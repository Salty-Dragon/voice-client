import { useEffect, useState } from "react";
import { isDesktop } from "../config";
import type { NetView } from "../engine";
import { keyLabel } from "../keys";
import { engine } from "../runtime";
import { bindTargetOf, useSettings, type BindTarget } from "../settings";
import { useApp } from "./app-context";
import { KeyBind, NET_BORDER, NET_NAME, NET_TEXT, useEngine } from "./common";

const STATE_TEXT: Record<NetView["state"], string> = {
  connecting: "Connecting…",
  connected: "",
  reconnecting: "Reconnecting…",
  disconnected: "Disconnected, retrying…",
};

const TALK = new Set(["party", "reserve", "lounge"]);

function NetCard({ net, talkHere, onTalkHere }: { net: NetView; talkHere: boolean; onTalkHere?: () => void }) {
  const s = useSettings();
  const key = s.bindings[bindTargetOf(net.net)];
  const voice = s.partyMode === "voice" && TALK.has(net.net);
  const how = !net.speak
    ? "Listen only"
    : net.net === "lounge" && !talkHere
      ? "Listening"
      : voice && key === null
        ? "Voice activated"
        : key !== null
          ? `Hold ${keyLabel(key)}${voice ? " or just speak" : ""}`
          : "No key bound";
  return (
    <li className={`panel border-l-4 ${NET_BORDER[net.net]} px-3 py-2 flex flex-col gap-1 transition-colors duration-150 ${net.live ? "bg-bg-2" : ""}`}>
      <div className="flex items-baseline gap-2">
        <span className={`title text-sm ${NET_TEXT[net.net]}`}>{net.label}</span>
        {net.label !== NET_NAME[net.net] && net.net !== "lounge" && <span className="text-xs text-text-muted">{NET_NAME[net.net]}</span>}
        <span className="ml-auto text-xs text-text-muted tabular-nums" title="Connected">{net.members.length}</span>
      </div>
      {net.state !== "connected" ? (
        <span className="text-xs text-danger">{STATE_TEXT[net.state]}</span>
      ) : (
        <div className="min-h-5 truncate">
          {net.live && <span className={`font-semibold ${NET_TEXT[net.net]}`}>You </span>}
          {net.speakers.join(", ")}
          {!net.live && net.speakers.length === 0 && <span className="text-text-muted">Quiet</span>}
        </div>
      )}
      <div className="flex items-center text-xs text-text-muted">
        {how}
        {onTalkHere && !talkHere && (
          <button type="button" className="ml-auto text-gold hover:text-gold-bright cursor-pointer" onClick={onTalkHere}>Talk here</button>
        )}
      </div>
    </li>
  );
}

export function VoiceView() {
  const { info, set, select, go, notice } = useApp();
  const eng = useEngine();
  const s = useSettings();
  const nets = eng.view();
  const op = set?.operation ?? null;
  const [, tick] = useState(0);

  // Playback permission can change without an engine event.
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 2000);
    return () => window.clearInterval(t);
  }, []);

  const lounges = nets.filter((n) => n.net === "lounge");
  const loungeRoom = eng.loungeRoom;
  // The net you chat on: your party, Reserve while you have none, or the lounge you picked.
  const home =
    nets.find((n) => n.net === "party") ?? nets.find((n) => n.net === "reserve") ?? lounges.find((n) => n.room === loungeRoom) ?? lounges[0] ?? null;

  // Speaking nets with no key yet: a new leader is prompted to bind theirs.
  const voiceMode = s.partyMode === "voice";
  const unbound = [
    ...new Set(
      nets
        .filter((n) => n.speak && s.bindings[bindTargetOf(n.net)] === null && !(voiceMode && TALK.has(n.net)))
        .map((n) => bindTargetOf(n.net)),
    ),
  ];
  const hints = [...new Set(nets.filter((n) => n.speak).map((n) => bindTargetOf(n.net)))].filter((t) => s.bindings[t] !== null) as Exclude<BindTarget, "muteAll">[];

  const hasLive = set?.operations.some((o) => o.state === "live") ?? false;
  const where = op ? String(op.id) : "lounge";

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 px-4 pt-3">
        <span className="text-text-muted">You are in</span>
        {set && set.operations.length > 0 ? (
          <select
            className="field w-auto"
            value={where}
            aria-label="Where you are"
            onChange={(e) => {
              // Picking the lounge during a live operation is a deliberate choice to sit it out.
              if (e.target.value === "lounge") select(hasLive ? "lounge" : "auto");
              else select(Number(e.target.value));
            }}
          >
            <option value="lounge">Lounge</option>
            {set.operations.map((o) => (
              <option key={o.id} value={o.id}>{o.name} ({o.state === "live" ? "live" : "planned"})</option>
            ))}
          </select>
        ) : (
          <span className="font-medium">{op ? op.name : "the lounge"}</span>
        )}
        {op && (
          <span className={`text-xs uppercase tracking-wider ${op.state === "live" ? "text-net-party" : "text-gold"}`}>
            {op.state === "live" ? "Live" : "Planned"}
          </span>
        )}
        {op && (
          <button type="button" className="ml-auto text-text-muted hover:text-gold cursor-pointer" onClick={() => go("roster", op.id)}>
            Open the roster board
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 px-4 pt-3 empty:hidden">
        {eng.audioBlocked && (
          <div className="panel flex items-center gap-3 px-3 py-2 border-danger">
            <span>Your browser is holding the sound back until you click.</span>
            <button type="button" className="btn text-sm" onClick={() => void engine.unlockAudio()}>Enable audio</button>
          </div>
        )}
        {eng.micError && (
          <div className="panel flex items-center gap-3 px-3 py-2 border-danger" role="alert">
            <span>Microphone problem: {eng.micError}. You can listen but not speak.</span>
            <button type="button" className="btn text-sm" onClick={() => void engine.startMic().catch(() => {})}>Try again</button>
          </div>
        )}
        {notice && <div className="panel px-3 py-2 text-gold-bright border-gold-bright" role="status">{notice}</div>}
        {unbound.length > 0 && (
          <div className="panel flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-2">
            <span>You can speak here. Bind a key for each:</span>
            {unbound.map((t) => (
              <span key={t} className="inline-flex items-center gap-2">
                <span className={`font-semibold ${NET_TEXT[t]}`}>{t === "party" && !op ? "Lounge" : NET_NAME[t]}</span>
                <KeyBind target={t} label={NET_NAME[t]} />
              </span>
            ))}
          </div>
        )}
      </div>

      {nets.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-sm text-center flex flex-col gap-3">
            {!set ? (
              <p className="text-text-muted">Connecting…</p>
            ) : info.membership?.status === "active" || op ? (
              <p className="text-text-muted">Connecting to your rooms…</p>
            ) : info.membership?.status === "pending" ? (
              <>
                <h1 className="title text-gold">Waiting for approval</h1>
                <p className="text-text-muted">
                  A leader or officer of {info.membership.name} has to approve you. You will land in the clan lounge as soon as they do.
                </p>
              </>
            ) : (
              <>
                <h1 className="title text-gold">Join your clan</h1>
                <p className="text-text-muted">Voice follows your clan. Pick yours, get approved, and you are in its lounge.</p>
                <div><button type="button" className="btn" onClick={() => go("clan")}>Choose a clan</button></div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4 p-4">
          <ul className="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto" aria-label="Your nets">
            {nets.map((n) => (
              <NetCard
                key={n.room}
                net={n}
                talkHere={n.net !== "lounge" || n.room === loungeRoom}
                onTalkHere={n.net === "lounge" && lounges.length > 1 ? () => engine.setLoungeRoom(n.room) : undefined}
              />
            ))}
          </ul>
          <section className="panel flex min-w-0 flex-1 flex-col gap-3 p-4 overflow-y-auto">
            {home && (
              <>
                <h1 className={`title ${NET_TEXT[home.net]}`}>{home.label}</h1>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
                  {home.members.map((m) => (
                    <li
                      key={m.identity}
                      className={`flex items-center gap-2 rounded-sm border px-2 py-1.5 ${home.net === "lounge" ? "text-net-party" : NET_TEXT[home.net]} ${
                        m.speaking ? "speaking border-current" : "border-line"
                      }`}
                    >
                      <span className={`truncate font-medium ${m.self ? "text-gold-bright" : "text-text"}`}>{m.name}</span>
                      {m.classTag && <span className="text-xs text-gold">{m.classTag}</span>}
                      {m.clanTag && <span className="ml-auto text-xs text-text-muted">[{m.clanTag}]</span>}
                    </li>
                  ))}
                </ul>
                {home.net === "reserve" && <p className="text-text-muted">You are in Reserve until an organiser places you in a party.</p>}
                {home.net === "lounge" && home.members.length <= 1 && home.state === "connected" && (
                  <p className="text-text-muted">Nobody else is here yet. Anyone from the clan who opens the app lands in this room.</p>
                )}
              </>
            )}
          </section>
        </div>
      )}

      <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line bg-bg-1/85 px-4 py-2 text-xs text-text-muted">
        {hints.length === 0 && s.bindings.muteAll === null && <span>{voiceMode ? "Voice activation is on." : "No keys bound. Open Settings to bind them."}</span>}
        {hints.map((t) => (
          <span key={t}>
            <kbd className="rounded-sm border border-line bg-bg-2 px-1.5 py-0.5 text-text">{keyLabel(s.bindings[t] as number)}</kbd>{" "}
            <span className={NET_TEXT[t]}>{t === "party" && !op ? "Lounge" : NET_NAME[t]}</span>
          </span>
        ))}
        {s.bindings.muteAll !== null && (
          <span>
            <kbd className="rounded-sm border border-line bg-bg-2 px-1.5 py-0.5 text-text">{keyLabel(s.bindings.muteAll)}</kbd> Mute all
          </span>
        )}
        {!isDesktop && <span className="ml-auto">Browser mode: keys only work while this tab has focus.</span>}
      </footer>
    </div>
  );
}
