import { useEffect, useState } from "react";
import { isDesktop, SERVER } from "../config";
import type { ControlState, Me, NetSet } from "../control";
import type { NetView } from "../engine";
import { keyLabel } from "../keys";
import { engine } from "../runtime";
import { useSettings, type NetKind } from "../settings";
import { KeyBind, NET_BORDER, NET_NAME, NET_TEXT, useEngine, Wordmark } from "./common";

async function openInBrowser(url: string) {
  if (isDesktop) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}

const STATE_TEXT: Record<NetView["state"], string> = {
  connecting: "Connecting…",
  connected: "",
  reconnecting: "Reconnecting…",
  disconnected: "Disconnected, retrying…",
};

function NetCard({ net }: { net: NetView }) {
  const s = useSettings();
  const key = s.bindings[net.net];
  const voice = s.partyMode === "voice" && (net.net === "party" || net.net === "reserve");
  return (
    <li className={`panel border-l-4 ${NET_BORDER[net.net]} px-3 py-2 flex flex-col gap-1 transition-colors duration-150 ${net.live ? "bg-bg-2" : ""}`}>
      <div className="flex items-baseline gap-2">
        <span className={`title text-sm ${NET_TEXT[net.net]}`}>{net.label}</span>
        {net.label !== NET_NAME[net.net] && <span className="text-xs text-text-muted">{NET_NAME[net.net]}</span>}
        <span className="ml-auto text-xs text-text-muted tabular-nums" title="Connected">{net.members.length}</span>
      </div>
      {net.state !== "connected" ? (
        <span className="text-xs text-danger">{STATE_TEXT[net.state]}</span>
      ) : (
        <div className="min-h-5 text-sm truncate">
          {net.live && <span className={`font-semibold ${NET_TEXT[net.net]}`}>You </span>}
          {net.speakers.join(", ")}
          {!net.live && net.speakers.length === 0 && <span className="text-text-muted">Quiet</span>}
        </div>
      )}
      <div className="text-xs text-text-muted">
        {!net.speak ? "Listen only" : voice && key === null ? "Voice activated" : key !== null ? `Hold ${keyLabel(key)}${voice ? " or just speak" : ""}` : "No key bound"}
      </div>
    </li>
  );
}

export function Main({
  me,
  set,
  control,
  notice,
  onSelect,
  onSettings,
}: {
  me: Me | null;
  set: NetSet | null;
  control: ControlState;
  notice: string;
  onSelect: (operationId: number) => void;
  onSettings: () => void;
}) {
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

  // The net you chat on: your party, or Reserve while you have none.
  const home = nets.find((n) => n.net === "party") ?? nets.find((n) => n.net === "reserve") ?? null;
  // Speaking nets with no key yet: a new leader is prompted to bind theirs.
  const unbound = nets.filter(
    (n) => n.speak && s.bindings[n.net] === null && !(s.partyMode === "voice" && (n.net === "party" || n.net === "reserve")),
  );
  const seen = new Set<NetKind>();
  const hints = nets.filter((n) => n.speak && s.bindings[n.net] !== null && !seen.has(n.net) && seen.add(n.net));

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-gold-dim bg-bg-1/85 px-4 py-2">
        <Wordmark />
        {op && set && set.operations.length > 1 ? (
          <select className="field w-auto" value={op.id} onChange={(e) => onSelect(Number(e.target.value))} aria-label="Operation">
            {set.operations.map((o) => (
              <option key={o.id} value={o.id}>{o.name}{o.state === "live" ? " (live)" : ""}</option>
            ))}
          </select>
        ) : (
          op && <span className="font-medium">{op.name}</span>
        )}
        {op && (
          <span className={`text-xs uppercase tracking-wider ${op.state === "live" ? "text-net-party" : "text-gold"}`}>
            {op.state === "live" ? "Live" : "Planned"}
          </span>
        )}
        <span className="ml-auto flex items-center gap-3">
          {control !== "online" && <span className="text-xs text-danger">Server link lost, retrying…</span>}
          {eng.muteAll && <span className="text-xs font-semibold uppercase tracking-wider text-danger">Mic muted</span>}
          <span className="text-text-muted">{me?.name}</span>
          <button type="button" className="btn btn-quiet text-sm" onClick={onSettings}>Settings</button>
        </span>
      </header>

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
        {notice && (
          <div className="panel px-3 py-2 text-gold-bright border-gold-bright" role="status">{notice}</div>
        )}
        {unbound.length > 0 && (
          <div className="panel flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-2">
            <span>You can speak on these nets. Bind a key for each:</span>
            {unbound.map((n) => (
              <span key={n.room} className="inline-flex items-center gap-2">
                <span className={`font-semibold ${NET_TEXT[n.net]}`}>{NET_NAME[n.net]}</span>
                <KeyBind target={n.net} label={NET_NAME[n.net]} />
              </span>
            ))}
          </div>
        )}
      </div>

      {!op ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-sm text-center flex flex-col gap-3">
            <h1 className="title text-gold">No operation yet</h1>
            <p className="text-text-muted">
              You are connected when your clan takes part in an operation. Until then there is nothing to hear.
              If you have not joined a clan yet, do that on the site.
            </p>
            <div><button type="button" className="btn btn-quiet" onClick={() => void openInBrowser(SERVER)}>Open the site</button></div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4 p-4">
          <ul className="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto" aria-label="Your nets">
            {nets.map((n) => <NetCard key={n.room} net={n} />)}
          </ul>
          <section className="panel flex min-w-0 flex-1 flex-col gap-3 p-4 overflow-y-auto">
            {home ? (
              <>
                <h1 className={`title ${NET_TEXT[home.net]}`}>{home.label}</h1>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
                  {home.members.map((m) => (
                    <li
                      key={m.identity}
                      className={`flex items-center gap-2 rounded-sm border px-2 py-1.5 ${NET_TEXT[home.net]} ${
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
              </>
            ) : (
              <p className="text-text-muted">Connecting…</p>
            )}
            <div className="mt-auto pt-2">
              <button type="button" className="text-sm text-text-muted hover:text-gold cursor-pointer" onClick={() => void openInBrowser(`${SERVER}/ops/${op.id}`)}>
                Open the roster board
              </button>
            </div>
          </section>
        </div>
      )}

      <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line bg-bg-1/85 px-4 py-2 text-xs text-text-muted">
        {hints.length === 0 && s.bindings.muteAll === null && <span>No keys bound. Open Settings to bind them.</span>}
        {hints.map((n) => (
          <span key={n.net}>
            <kbd className="rounded-sm border border-line bg-bg-2 px-1.5 py-0.5 text-text">{keyLabel(s.bindings[n.net] as number)}</kbd>{" "}
            <span className={NET_TEXT[n.net]}>{NET_NAME[n.net]}</span>
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
