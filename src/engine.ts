// Voice engine: one LiveKit room per net, one microphone capture shared by
// all of them. Each room gets its own clone of the mic track, published muted;
// holding a net's key unmutes only that room's clone.

import {
  AudioPresets,
  ConnectionState,
  LocalAudioTrack,
  RemoteAudioTrack,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";

export type NetId = "broadcast" | "command" | "clan" | "party";
export const NET_ORDER: NetId[] = ["broadcast", "command", "clan", "party"];

export type NetGrant = { net: NetId; room: string; token: string; canPublish: boolean };
export type JoinResponse = { url: string; nets: NetGrant[] };

export type NetView = {
  net: NetId;
  state: ConnectionState | "idle";
  canPublish: boolean;
  live: boolean; // our key is held
  speakers: string[];
  listeners: number;
};

export type LatencySample = {
  net: NetId;
  /** hook timestamp -> event handled in the WebView */
  deliverMs: number;
  /** hook timestamp -> track enabled */
  enableMs: number;
  /** hook timestamp -> speech-rate packets seen leaving; null if none (stay silent = no packets) */
  audioMs: number | null;
};

const RELEASE_TAIL_MS = 200;

type Net = {
  grant: NetGrant;
  room: Room;
  track?: LocalAudioTrack;
  live: boolean;
  releaseTimer?: number;
  speakers: string[];
  volume: number;
};

export class VoiceEngine {
  private nets = new Map<NetId, Net>();
  private mic?: MediaStream;
  private sink: HTMLElement;
  private dropStartedAt: number | null = null;

  onChange: () => void = () => {};
  onLog: (line: string) => void = () => {};
  onLatency: (s: LatencySample) => void = () => {};

  constructor() {
    this.sink = document.createElement("div");
    this.sink.style.display = "none";
    document.body.appendChild(this.sink);
  }

  view(): NetView[] {
    return NET_ORDER.filter((n) => this.nets.has(n)).map((n) => {
      const net = this.nets.get(n)!;
      return {
        net: n,
        state: net.room.state,
        canPublish: net.grant.canPublish,
        live: net.live,
        speakers: net.speakers,
        listeners: net.room.remoteParticipants.size,
      };
    });
  }

  async start(join: JoinResponse, audio: MediaTrackConstraints): Promise<void> {
    this.mic = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, ...audio },
      video: false,
    });
    const micTrack = this.mic.getAudioTracks()[0];
    this.log(`mic: ${micTrack.label}`);

    await Promise.all(join.nets.map((grant) => this.connect(join.url, grant, micTrack)));
    this.onChange();
  }

  private async connect(url: string, grant: NetGrant, micTrack: MediaStreamTrack) {
    const room = new Room({
      adaptiveStream: false,
      dynacast: false,
      publishDefaults: { dtx: true, red: true, audioPreset: AudioPresets.speech },
    });
    const net: Net = { grant, room, live: false, speakers: [], volume: 1 };
    this.nets.set(grant.net, net);
    const tag = grant.net;

    room
      .on(RoomEvent.ConnectionStateChanged, (s) => {
        this.log(`${tag}: ${s}`);
        this.trackRecovery();
        this.onChange();
      })
      .on(RoomEvent.SignalReconnecting, () => this.log(`${tag}: signal reconnecting`))
      .on(RoomEvent.Reconnecting, () => this.log(`${tag}: reconnecting`))
      .on(RoomEvent.Reconnected, () => this.log(`${tag}: reconnected`))
      .on(RoomEvent.Disconnected, (reason) => this.log(`${tag}: DISCONNECTED (reason ${reason})`))
      .on(RoomEvent.ParticipantConnected, () => this.onChange())
      .on(RoomEvent.ParticipantDisconnected, () => this.onChange())
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        net.speakers = speakers.map((p) => p.name || p.identity);
        this.onChange();
      })
      .on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        this.sink.appendChild(el);
        (track as RemoteAudioTrack).setVolume(net.volume);
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((el) => el.remove());
      });

    await room.connect(url, grant.token);

    if (grant.canPublish) {
      const track = new LocalAudioTrack(micTrack.clone(), undefined, true);
      await room.localParticipant.publishTrack(track, {
        source: Track.Source.Microphone,
        name: grant.net,
      });
      await track.mute();
      net.track = track;
    }
  }

  /** Key down / up for one net. `t` is the epoch-ms timestamp taken at the hook. */
  ptt(netId: NetId, down: boolean, t: number) {
    const net = this.nets.get(netId);
    if (!net?.track) return;
    window.clearTimeout(net.releaseTimer);

    if (down) {
      if (net.live) return;
      const deliverMs = Date.now() - t;
      net.live = true;
      void net.track.unmute();
      // LiveKit's unmute also signals the server; enabling the media track
      // directly is what actually opens the mic, so do it without waiting.
      net.track.mediaStreamTrack.enabled = true;
      const enableMs = Date.now() - t;
      void this.measure(net, t, deliverMs, enableMs);
    } else {
      net.releaseTimer = window.setTimeout(() => {
        net.live = false;
        void net.track?.mute();
        this.onChange();
      }, RELEASE_TAIL_MS);
    }
    this.onChange();
  }

  /**
   * While muted with silence suppression the sender emits a packet roughly
   * every 400 ms. Speech runs at 50 packets a second. Two packets inside
   * 100 ms therefore means real audio is leaving.
   */
  private async measure(net: Net, t: number, deliverMs: number, enableMs: number) {
    const sender = net.track?.sender;
    let audioMs: number | null = null;
    if (sender) {
      let lastCount = -1;
      let lastChange = 0;
      const deadline = Date.now() + 600;
      while (Date.now() < deadline && net.live) {
        const stats = await sender.getStats();
        let count = 0;
        stats.forEach((r) => {
          if (r.type === "outbound-rtp") count = r.packetsSent ?? 0;
        });
        const now = Date.now();
        if (lastCount >= 0 && count > lastCount) {
          if (lastChange && now - lastChange < 100) {
            audioMs = lastChange - t;
            break;
          }
          lastChange = now;
        }
        lastCount = count;
        await new Promise((r) => setTimeout(r, 8));
      }
    }
    this.onLatency({ net: net.grant.net, deliverMs, enableMs, audioMs });
  }

  setVolume(netId: NetId, volume: number) {
    const net = this.nets.get(netId);
    if (!net) return;
    net.volume = volume;
    net.room.remoteParticipants.forEach((p) =>
      p.audioTrackPublications.forEach((pub) => {
        (pub.track as RemoteAudioTrack | undefined)?.setVolume(volume);
      }),
    );
  }

  /** LiveKit's built-in fault injection, applied to every room at once. */
  async simulate(scenario: "signal-reconnect" | "full-reconnect") {
    this.log(`--- simulating ${scenario} on all rooms ---`);
    await Promise.all(
      [...this.nets.values()].map((n) => n.room.simulateScenario(scenario).catch((e) => this.log(String(e)))),
    );
  }

  /** Logs how long it takes for every room to be connected again after a drop. */
  private trackRecovery() {
    const states = [...this.nets.values()].map((n) => n.room.state);
    const allUp = states.every((s) => s === ConnectionState.Connected);
    if (!allUp && this.dropStartedAt === null && states.length === this.nets.size) {
      this.dropStartedAt = Date.now();
    } else if (allUp && this.dropStartedAt !== null) {
      const secs = ((Date.now() - this.dropStartedAt) / 1000).toFixed(1);
      this.dropStartedAt = null;
      const muted = [...this.nets.values()].filter((n) => n.track && !n.live && !n.track.isMuted);
      this.log(
        `=== all ${this.nets.size} rooms recovered after ${secs} s` +
          (muted.length ? ` (WARNING: ${muted.length} track(s) came back unmuted)` : "") +
          " ===",
      );
    }
  }

  async stop() {
    await Promise.all([...this.nets.values()].map((n) => n.room.disconnect()));
    this.mic?.getTracks().forEach((t) => t.stop());
    this.nets.clear();
    this.onChange();
  }

  private log(line: string) {
    this.onLog(`${new Date().toISOString().slice(11, 23)}  ${line}`);
  }
}
