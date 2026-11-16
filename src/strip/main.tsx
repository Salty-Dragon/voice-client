// The compact strip: a small always-on-top window with one line per net that
// has someone speaking. It holds no connection of its own; the main window
// sends it what to show.
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { NET_NAME, NET_TEXT } from "../ui/net-style";
import { CHANNEL, POSITION_KEY, type FromStrip, type StripState, type ToStrip } from "./feed";

const WIDTH = 300;
const LINE = 22;
const PADDING = 12;
/** With nothing heard from the main window for this long, say so rather than show stale names. */
const STALE_MS = 4000;

function Strip() {
  const [state, setState] = useState<StripState | null>(null);
  const [stale, setStale] = useState(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const last = useRef(0);

  useEffect(() => {
    const ch = new BroadcastChannel(CHANNEL);
    channel.current = ch;
    ch.onmessage = (e: MessageEvent<ToStrip>) => {
      if (e.data?.type !== "state") return;
      last.current = Date.now();
      setStale(false);
      setState(e.data.state);
    };
    ch.postMessage({ type: "hello" } satisfies FromStrip);
    const timer = window.setInterval(() => {
      if (Date.now() - last.current > STALE_MS) {
        setStale(true);
        ch.postMessage({ type: "hello" } satisfies FromStrip);
      }
      // Remember where the strip sits, for the next time it is opened.
      try {
        localStorage.setItem(POSITION_KEY, JSON.stringify({ x: window.screenX, y: window.screenY }));
      } catch {
        /* not remembered */
      }
    }, 1500);
    return () => {
      window.clearInterval(timer);
      ch.close();
    };
  }, []);

  const lines = !stale && state ? state.lines : [];
  const rows = Math.max(1, lines.length) + (state?.locked && !stale ? 1 : 0);

  // The window is as tall as what it shows.
  useEffect(() => {
    void (async () => {
      const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
      await getCurrentWindow().setSize(new LogicalSize(WIDTH, rows * LINE + PADDING));
    })().catch(() => {});
  }, [rows]);

  const drag = (e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().startDragging()).catch(() => {});
  };
  const openMain = () => void import("@tauri-apps/api/core").then(({ invoke }) => invoke("show_main_window")).catch(() => {});

  return (
    <div
      className="flex h-full cursor-grab select-none flex-col justify-center border border-gold-dim bg-bg-0 px-2 text-[13px] leading-[22px]"
      onMouseDown={drag}
      onDoubleClick={openMain}
      role="status"
      aria-label="Who is speaking"
    >
      {state?.locked && !stale && <div className="truncate font-semibold text-net-broadcast">Broadcast locked open</div>}
      {lines.length === 0 ? (
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${stale || !state?.where ? "bg-line" : state.muted ? "bg-danger" : "bg-net-party"}`} />
          <span className="min-w-0 flex-1 truncate text-text-muted">
            {stale || !state ? "Waiting for the app…" : !state.where ? "Not in voice" : state.muted ? `Mic muted · ${state.where}` : `Quiet · ${state.where}`}
          </span>
          <Close channel={channel} />
        </div>
      ) : (
        lines.map((line, i) => (
          <div key={`${line.net}-${line.label}`} className={`flex items-center gap-2 ${line.lowered ? "opacity-60" : ""}`}>
            <span className={`w-[4.5rem] shrink-0 truncate text-[11px] font-semibold uppercase tracking-wider ${NET_TEXT[line.net]}`}>
              {line.net === "party" || line.net === "lounge" ? line.label : NET_NAME[line.net]}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {line.you && <span className={`mr-1 font-semibold ${NET_TEXT[line.net]}`}>You</span>}
              {line.speakers.map((sp, n) => (
                <span key={`${sp.name}-${n}`} className="mr-1.5 inline-flex items-center gap-1 align-middle">
                  {sp.crest ? <img src={sp.crest} alt="" className="h-3.5 w-3.5 object-contain" /> : sp.tag ? <span className="text-[11px] text-text-muted">[{sp.tag}]</span> : null}
                  {sp.name}
                </span>
              ))}
            </span>
            {i === 0 && <Close channel={channel} />}
          </div>
        ))
      )}
    </div>
  );
}

function Close({ channel }: { channel: React.RefObject<BroadcastChannel | null> }) {
  return (
    <button
      type="button"
      className="shrink-0 cursor-pointer px-1 text-text-muted hover:text-text"
      aria-label="Close the strip"
      onClick={() => channel.current?.postMessage({ type: "close" } satisfies FromStrip)}
    >
      ×
    </button>
  );
}

document.title = "Compact strip";
createRoot(document.getElementById("root")!).render(<Strip />);
