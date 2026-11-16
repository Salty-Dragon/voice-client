// Voice engine: one LiveKit room per net, one microphone capture shared by
// all of them. Each room the player may speak in gets its own clone of the
// mic track, published muted; a net's key (or voice activation, on Party and
// Reserve) unmutes only that room's clone.
//
// Which rooms exist is not decided here. The control channel delivers a net
// set and apply() makes the connections match it: new rooms are joined first,
// old ones left afterwards, so a move has no silent gap.

import {
  AudioPresets,
  ConnectionState,
  LocalAudioTrack,
  type Participant,
  type RemoteAudioTrack,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import type { NetGrant, NetSet } from "./control";
import { getSettings, onSettings, type NetKind, type Settings } from "./settings";

export type Member = {
  identity: string;
  name: string;
  classTag: string | null;
  clanTag: string | null;
  clanId: number | null;
  speaking: boolean;
  self: boolean;
  /** May speak on this net (holds a published track or is allowed to). */
  canSpeak: boolean;
  /** Your own volume for this player (0 to 1) and whether you muted them. */
  volume: number;
  muted: boolean;
};

export type Speaker = { identity: string; name: string; clanId: number | null; clanTag: string | null };

export type NetView = {
  net: NetKind;
  label: string;
  room: string;
  state: "connecting" | "connected" | "reconnecting" | "disconnected";
  speak: boolean;
  /** Our mic is open on this net right now. */
  live: boolean;
  /** Others speaking right now. */
  speakers: Speaker[];
  /** Made quieter right now because a higher-priority net is live. */
  lowered: boolean;
  members: Member[];
};

/** How long the mic stays open after a push-to-talk key is released, so word endings are not clipped. */
const RELEASE_TAIL_MS = 200;
/** Lower number = higher priority. A live net lowers every net below it for the listener. */
const PRIORITY: Record<NetKind, number> = { broadcast: 0, command: 1, clan: 2, party: 3, reserve: 3, lounge: 4 };
/** A net counts as live for this long after its last speaker closes their mic, so gaps between words do not pump the volume. */
const LIVE_HOLD_MS = 400;
/** How often volumes are re-evaluated. */
const VOLUME_TICK_MS = 50;
/** Holding one of these sends your voice to that net only; voice activation pauses meanwhile. */
const KEYED_ONLY: NetKind[] = ["broadcast", "command", "clan"];

type Net = {
  grant: NetGrant;
  room: Room;
  track?: LocalAudioTrack;
  live: boolean;
  /** Opened by a key (gets the release tail) rather than by voice. */
  byKey: boolean;
  /** When to close after the reason to be open has gone; 0 = not closing. */
  closeAt: number;
  speakers: Speaker[];
  /** We are leaving on purpose; ignore the disconnect that follows. */
  closing: boolean;
  failed: boolean;
  /** Someone else has their mic open here until at least this time. */
  liveUntil: number;
  /** The same, for a senior leader (Command only). */
  seniorLiveUntil: number;
  /** This net is being played quieter right now. */
  lowered: boolean;
};

function meta(p: Participant): { classTag: string | null; clanTag: string | null; clanId: number | null; senior: boolean } {
  try {
    const m = JSON.parse(p.metadata || "{}") as { classTag?: string | null; clanTag?: string | null; clanId?: number | null; senior?: boolean };
    return { classTag: m.classTag ?? null, clanTag: m.clanTag ?? null, clanId: typeof m.clanId === "number" ? m.clanId : null, senior: m.senior === true };
  } catch {
    return { classTag: null, clanTag: null, clanId: null, senior: false };
  }
}

export class VoiceEngine {
  private nets = new Map<string, Net>();
  private url = "";
  private mic?: MediaStream;
  private micTrack?: MediaStreamTrack;
  private micPromise?: Promise<void>;
  private ctx?: AudioContext;
  private meterSource?: MediaStreamAudioSourceNode;
  private meterNode?: AudioWorkletNode;
  private sink: HTMLElement;
  private queue: Promise<void> = Promise.resolve();
  private held = new Set<NetKind>();
  private voiceUntil = 0;
  private refreshTimer: number | undefined;
  private settings: Settings = getSettings();
  /** With more than one lounge, the one the player talks in. They hear all of them. */
  private talkLounge: string | null = null;
  private lastVolumeTick = 0;
  /** Volume last set per track, to avoid setting it again and again. */
  private volumeSet = new WeakMap<object, number>();

  /** Latest mic level in dBFS, about every 10 ms. */
  level = -100;
  muteAll = false;
  micError = "";

  onChange: () => void = () => {};
  /** A room could not get back in with the token it has; fresh ones are needed. */
  onNeedRefresh: () => void = () => {};
  private levelListeners = new Set<(db: number) => void>();

  constructor() {
    this.sink = document.createElement("div");
    this.sink.hidden = true;
    document.body.appendChild(this.sink);
    onSettings(() => this.settingsChanged());
    // Backup clock. The meter worklet is the main one, because timers are
    // slowed while the window sits behind a game.
    window.setInterval(() => this.update(), 100);
  }

  // ---- Microphone ---------------------------------------------------------

  /** Captures the mic once and keeps it. Safe to call repeatedly. */
  startMic(): Promise<void> {
    this.micPromise ??= this.capture().catch((e) => {
      this.micPromise = undefined;
      this.micError = e instanceof Error ? e.message : String(e);
      this.onChange();
      throw e;
    });
    return this.micPromise;
  }

  private async capture() {
    const s = this.settings;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        deviceId: s.inputDeviceId ? { exact: s.inputDeviceId } : undefined,
        echoCancellation: s.echoCancellation,
        noiseSuppression: s.noiseSuppression,
        autoGainControl: s.autoGainControl,
      },
      video: false,
    });
    this.mic = stream;
    this.micTrack = stream.getAudioTracks()[0];
    this.micError = "";
    await this.startMeter(stream);
    this.onChange();
  }

  /** Level metering runs on the processed signal, so noise suppression acts before the voice gate. */
  private async startMeter(stream: MediaStream) {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        await this.ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}meter-worklet.js`);
        this.meterNode = new AudioWorkletNode(this.ctx, "meter");
        this.meterNode.port.onmessage = (e) => {
          this.level = e.data as number;
          this.levelListeners.forEach((l) => l(this.level));
          this.update();
        };
        // The graph only runs if it reaches the output; a silent gain keeps it inaudible.
        const silent = this.ctx.createGain();
        silent.gain.value = 0;
        this.meterNode.connect(silent).connect(this.ctx.destination);
      }
      this.meterSource?.disconnect();
      this.meterSource = this.ctx.createMediaStreamSource(stream);
      this.meterSource.connect(this.meterNode!);
      void this.ctx.resume();
    } catch (e) {
      console.warn("level meter unavailable", e);
    }
  }

  /** Re-captures after a device or processing change and swaps the new mic into every room. */
  private async recapture() {
    if (!this.mic) return;
    const old = this.mic;
    this.micPromise = this.capture();
    try {
      await this.micPromise;
    } catch (e) {
      this.mic = old; // keep the working mic
      this.micTrack = old.getAudioTracks()[0];
      this.micError = e instanceof Error ? e.message : String(e);
      this.micPromise = Promise.resolve();
      this.onChange();
      return;
    }
    for (const net of this.nets.values()) {
      if (!net.track || !this.micTrack) continue;
      const clone = this.micTrack.clone();
      clone.enabled = net.live;
      await net.track.replaceTrack(clone, true).catch((e) => console.warn("replaceTrack", e));
    }
    old.getTracks().forEach((t) => t.stop());
  }

  onLevel(listener: (db: number) => void): () => void {
    this.levelListeners.add(listener);
    return () => this.levelListeners.delete(listener);
  }

  /** Listens to the room for a few seconds and returns a threshold just above its noise. */
  async measureNoise(ms = 5000): Promise<number> {
    const samples: number[] = [];
    const stop = this.onLevel((db) => samples.push(db));
    await new Promise((r) => setTimeout(r, ms));
    stop();
    if (!samples.length) return this.settings.vadThresholdDb;
    samples.sort((a, b) => a - b);
    const loud = samples[Math.floor(samples.length * 0.95)];
    return Math.round(Math.min(-15, Math.max(-70, loud + 6)));
  }

  /** Records a few seconds of the mic and plays it back, so the player hears what others will. */
  async micTest(ms = 3000): Promise<void> {
    await this.startMic();
    if (!this.mic) return;
    const rec = new MediaRecorder(this.mic);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise((r) => (rec.onstop = r));
    rec.start();
    await new Promise((r) => setTimeout(r, ms));
    rec.stop();
    await stopped;
    const audio = new Audio(URL.createObjectURL(new Blob(chunks, { type: rec.mimeType })));
    const out = this.settings.outputDeviceId;
    if (out && "setSinkId" in audio) await (audio as HTMLAudioElement & { setSinkId(id: string): Promise<void> }).setSinkId(out).catch(() => {});
    await audio.play();
    await new Promise((r) => (audio.onended = r));
    URL.revokeObjectURL(audio.src);
  }

  // ---- Rooms --------------------------------------------------------------

  /** Makes the connections match the net set. Calls are applied one at a time, in order. */
  apply(set: NetSet): Promise<void> {
    this.queue = this.queue.then(() => this.reconcile(set)).catch((e) => console.error("apply failed", e));
    return this.queue;
  }

  private async reconcile(set: NetSet) {
    this.url = set.url;
    const wanted = new Map(set.nets.map((g) => [g.room, g]));

    // Join new rooms (and re-join dead ones) before leaving anything.
    await Promise.all(
      [...wanted.values()].map(async (grant) => {
        const cur = this.nets.get(grant.room);
        if (cur && cur.room.state !== ConnectionState.Disconnected && !cur.failed) {
          cur.grant = grant;
          if (grant.speak && !cur.track) await this.publish(cur);
          else if (!grant.speak && cur.track) await this.unpublish(cur);
          return;
        }
        if (cur) await this.leave(cur);
        await this.join(grant);
      }),
    );

    for (const net of [...this.nets.values()]) {
      if (!wanted.has(net.grant.room)) await this.leave(net);
    }
    this.onChange();
  }

  private async join(grant: NetGrant) {
    const room = new Room({
      adaptiveStream: false,
      dynacast: false,
      publishDefaults: { dtx: true, red: true, audioPreset: AudioPresets.speech },
      audioOutput: this.settings.outputDeviceId ? { deviceId: this.settings.outputDeviceId } : undefined,
    });
    const net: Net = { grant, room, live: false, byKey: false, closeAt: 0, speakers: [], closing: false, failed: false, liveUntil: 0, seniorLiveUntil: 0, lowered: false };
    this.nets.set(grant.room, net);
    const changed = () => this.onChange();

    room
      .on(RoomEvent.ConnectionStateChanged, changed)
      .on(RoomEvent.ParticipantConnected, changed)
      .on(RoomEvent.ParticipantDisconnected, changed)
      .on(RoomEvent.ParticipantMetadataChanged, changed)
      .on(RoomEvent.ParticipantNameChanged, changed)
      .on(RoomEvent.TrackPublished, changed)
      .on(RoomEvent.TrackUnpublished, changed)
      .on(RoomEvent.AudioPlaybackStatusChanged, changed)
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        net.speakers = speakers.filter((p) => !p.isLocal).map((p) => {
          const m = meta(p);
          return { identity: p.identity, name: p.name || p.identity, clanId: m.clanId, clanTag: m.clanTag };
        });
        this.onChange();
      })
      .on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        el.dataset.room = net.grant.room;
        this.sink.appendChild(el);
        this.applyVolumes(true);
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((el) => el.remove());
      })
      .on(RoomEvent.ParticipantPermissionsChanged, (_prev, participant) => {
        // The server may grant speaking a moment after the net set says so.
        if (participant.isLocal && net.grant.speak && !net.track) void this.publish(net).then(changed);
      })
      .on(RoomEvent.Disconnected, () => {
        if (net.closing) return;
        // LiveKit gave up reconnecting, or the server removed us. Ask the
        // control channel what our rooms should be now; apply() re-joins.
        net.track = undefined;
        net.live = false;
        this.clearAudio(net.grant.room);
        this.needRefresh();
        this.onChange();
      });

    try {
      await room.connect(this.url, grant.token);
      if (grant.speak) await this.publish(net);
    } catch (e) {
      console.warn(`join ${grant.room} failed`, e);
      net.failed = true;
      this.needRefresh();
    }
    this.onChange();
  }

  private async publish(net: Net) {
    if (net.track || net.room.state !== ConnectionState.Connected) return;
    try {
      await this.startMic();
    } catch {
      return; // no microphone: listen-only until it is fixed in Settings
    }
    if (!this.micTrack || net.track) return;
    const clone = this.micTrack.clone();
    clone.enabled = false;
    const track = new LocalAudioTrack(clone, undefined, true);
    try {
      await net.room.localParticipant.publishTrack(track, { source: Track.Source.Microphone, name: net.grant.net });
      await track.mute();
      net.track = track;
    } catch (e) {
      // Usually the speak permission has not arrived yet; ParticipantPermissionsChanged retries.
      clone.stop();
      console.warn(`publish on ${net.grant.room} failed`, e);
    }
  }

  private async unpublish(net: Net) {
    const track = net.track;
    if (!track) return;
    net.track = undefined;
    net.live = false;
    await net.room.localParticipant.unpublishTrack(track, true).catch(() => {});
  }

  private async leave(net: Net) {
    net.closing = true;
    this.nets.delete(net.grant.room);
    net.track?.stop();
    await net.room.disconnect().catch(() => {});
    this.clearAudio(net.grant.room);
  }

  /** Removes a room's audio elements. A disconnect does not always report each track as unsubscribed. */
  private clearAudio(room: string) {
    this.sink.querySelectorAll<HTMLAudioElement>("audio").forEach((el) => {
      if (el.dataset.room === room) el.remove();
    });
  }

  /** Throttled: several rooms failing together produce one request. */
  private needRefresh() {
    if (this.refreshTimer !== undefined) return;
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = undefined;
      this.onNeedRefresh();
    }, 3000);
  }

  async stop() {
    window.clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
    await this.queue;
    await Promise.all([...this.nets.values()].map((n) => this.leave(n)));
    this.held.clear();
    this.onChange();
  }

  // ---- Opening and closing the mic ---------------------------------------

  /** Key down / up for one kind of net. */
  ptt(kind: NetKind, down: boolean) {
    if (down) this.held.add(kind);
    else this.held.delete(kind);
    this.update();
  }

  toggleMuteAll() {
    this.muteAll = !this.muteAll;
    this.update();
    this.onChange();
  }

  /** The room the player talks in when in a lounge. */
  get loungeRoom(): string | null {
    const lounges = [...this.nets.values()].filter((n) => n.grant.net === "lounge").map((n) => n.grant.room);
    return this.talkLounge && lounges.includes(this.talkLounge) ? this.talkLounge : (lounges[0] ?? null);
  }

  setLoungeRoom(room: string) {
    this.talkLounge = room;
    this.update();
    this.onChange();
  }

  /** The net voice activation applies to: the party, Reserve for a player without one, or the lounge. */
  private voiceRoom(): string | null {
    let reserve: string | null = null;
    for (const net of this.nets.values()) {
      if (net.grant.net === "party") return net.grant.room;
      if (net.grant.net === "reserve") reserve = net.grant.room;
    }
    return reserve ?? this.loungeRoom;
  }

  /** Decides, for every net, whether the mic should be open now. Runs on every key event and meter tick. */
  private update() {
    const now = Date.now();
    const s = this.settings;
    const voiceMode = s.partyMode === "voice";
    if (voiceMode && this.level >= s.vadThresholdDb) this.voiceUntil = now + s.vadHoldMs;
    const keyedHeld = KEYED_ONLY.some((k) => this.held.has(k));
    const voiceRoom = voiceMode ? this.voiceRoom() : null;
    const loungeRoom = this.loungeRoom;
    let changed = false;

    for (const net of this.nets.values()) {
      if (!net.track) continue;
      // A lounge is talked in with the Party key, and only the chosen one.
      const byKey = net.grant.net === "lounge" ? net.grant.room === loungeRoom && this.held.has("party") : this.held.has(net.grant.net);
      const byVoice = net.grant.room === voiceRoom && !keyedHeld && now < this.voiceUntil;
      const want = !this.muteAll && (byKey || byVoice);

      if (want) {
        net.closeAt = 0;
        net.byKey = byKey;
        if (!net.live) {
          net.live = true;
          // Enabling the media track is what opens the mic; LiveKit's unmute also tells the server.
          net.track.mediaStreamTrack.enabled = true;
          void net.track.unmute();
          changed = true;
        }
      } else if (net.live) {
        // Voice activation already waited out its hold time; a released key gets a short tail.
        if (!net.closeAt) net.closeAt = now + (net.byKey && !this.muteAll ? RELEASE_TAIL_MS : 0);
        if (now >= net.closeAt) {
          net.live = false;
          net.closeAt = 0;
          void net.track.mute();
          changed = true;
        }
      }
    }
    if (changed) this.onChange();
    if (now - this.lastVolumeTick >= VOLUME_TICK_MS) {
      this.lastVolumeTick = now;
      this.applyVolumes();
    }
  }

  // ---- Volume: per net, per player, and ducking ---------------------------

  /**
   * Sets every incoming track to: the net's volume, times the player's own
   * setting for that speaker, times the ducking factor. Ducking: while a
   * higher-priority net is live, lower nets drop to the duck level; and on
   * Command, while a senior leader speaks, the party leaders drop the same way.
   *
   * "Live" is read from who has their mic open, which arrives sooner than
   * the server's who-is-speaking detection, so the start of a call is not masked.
   */
  private applyVolumes(force = false) {
    const now = Date.now();
    const s = this.settings;
    const nets = [...this.nets.values()];

    for (const net of nets) {
      for (const p of net.room.remoteParticipants.values()) {
        let open = false;
        p.audioTrackPublications.forEach((pub) => {
          if (!pub.isMuted && pub.track) open = true;
        });
        if (!open || s.playerMuted[p.identity]) continue;
        net.liveUntil = now + LIVE_HOLD_MS;
        if (net.grant.net === "command" && meta(p).senior) net.seniorLiveUntil = now + LIVE_HOLD_MS;
      }
    }

    let shownChanged = false;
    for (const net of nets) {
      const rank = PRIORITY[net.grant.net];
      const ducked = s.ducking && nets.some((other) => PRIORITY[other.grant.net] < rank && other.liveUntil > now);
      const seniorLive = s.ducking && net.grant.net === "command" && net.seniorLiveUntil > now;
      // Shown on the net's card, so a player can see why it went quiet.
      if (net.lowered !== ducked) {
        net.lowered = ducked;
        shownChanged = true;
      }
      const base = s.netVolume[net.grant.net];
      for (const p of net.room.remoteParticipants.values()) {
        const own = s.playerMuted[p.identity] ? 0 : (s.playerVolume[p.identity] ?? 1);
        const duck = ducked || (seniorLive && !meta(p).senior) ? s.duckLevel : 1;
        const volume = Math.max(0, Math.min(1, base * own * duck));
        p.audioTrackPublications.forEach((pub) => {
          const track = pub.track as RemoteAudioTrack | undefined;
          if (!track) return;
          if (!force && this.volumeSet.get(track) === volume) return;
          this.volumeSet.set(track, volume);
          track.setVolume(volume);
        });
      }
    }
    if (shownChanged) this.onChange();
  }

  // ---- Settings -----------------------------------------------------------

  private settingsChanged() {
    const prev = this.settings;
    const next = (this.settings = getSettings());
    if (
      prev.inputDeviceId !== next.inputDeviceId ||
      prev.echoCancellation !== next.echoCancellation ||
      prev.noiseSuppression !== next.noiseSuppression ||
      prev.autoGainControl !== next.autoGainControl
    ) {
      this.queue = this.queue.then(() => this.recapture()).catch(() => {});
    }
    if (prev.outputDeviceId !== next.outputDeviceId) {
      for (const net of this.nets.values()) void net.room.switchActiveDevice("audiooutput", next.outputDeviceId || "default").catch(() => {});
    }
    this.applyVolumes();
    this.update();
  }

  // ---- Playback permission and cues ---------------------------------------

  /** True when the browser is holding audio back until the player clicks something. */
  get audioBlocked(): boolean {
    if (this.ctx && this.ctx.state === "suspended") return true;
    for (const net of this.nets.values()) if (net.room.state === ConnectionState.Connected && !net.room.canPlaybackAudio) return true;
    return false;
  }

  async unlockAudio() {
    await this.ctx?.resume().catch(() => {});
    await Promise.all([...this.nets.values()].map((n) => n.room.startAudio().catch(() => {})));
    this.onChange();
  }

  /** A short two-note cue, generated here (no sound files, nothing borrowed). */
  cue(kind: "moved") {
    const s = this.settings;
    if (!s.cues || s.cueVolume <= 0) return;
    const ctx = (this.ctx ??= new AudioContext());
    const notes = kind === "moved" ? [660, 880] : [440];
    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.25 * s.cueVolume, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  // ---- For the UI ---------------------------------------------------------

  get hasMic(): boolean {
    return !!this.micTrack;
  }

  view(): NetView[] {
    const order: NetKind[] = ["broadcast", "command", "clan", "party", "reserve", "lounge"];
    return [...this.nets.values()]
      .sort((a, b) => order.indexOf(a.grant.net) - order.indexOf(b.grant.net))
      .map((net) => {
        const speaking = new Set(net.room.activeSpeakers.map((p) => p.identity));
        const person = (p: Participant, self: boolean): Member => ({
          identity: p.identity,
          name: p.name || p.identity,
          ...meta(p),
          speaking: self ? net.live : speaking.has(p.identity),
          self,
          canSpeak: self ? net.grant.speak : (p.permissions?.canPublish ?? false),
          volume: this.settings.playerVolume[p.identity] ?? 1,
          muted: this.settings.playerMuted[p.identity] === true,
        });
        const members = [...net.room.remoteParticipants.values()].map((p) => person(p, false));
        if (net.room.state === ConnectionState.Connected) members.push(person(net.room.localParticipant, true));
        members.sort((a, b) => a.name.localeCompare(b.name));
        const state: NetView["state"] = net.failed
          ? "disconnected"
          : net.room.state === ConnectionState.Connected
            ? "connected"
            : net.room.state === ConnectionState.Connecting
              ? "connecting"
              : net.room.state === ConnectionState.Disconnected
                ? "disconnected"
                : "reconnecting";
        return {
          net: net.grant.net,
          label: net.grant.label,
          room: net.grant.room,
          state,
          speak: net.grant.speak && !!net.track,
          live: net.live,
          speakers: net.speakers,
          lowered: net.lowered,
          members,
        };
      });
  }
}
