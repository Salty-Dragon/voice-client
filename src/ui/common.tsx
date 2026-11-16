import { useEffect, useRef, useState } from "react";
import { APP_NAME } from "../config";
import { keyLabel } from "../keys";
import { captureKey, engine } from "../runtime";
import { setSettings, useSettings, type BindTarget, type NetKind } from "../settings";
import { tip } from "./tips";

export const NET_TEXT: Record<NetKind, string> = {
  broadcast: "text-net-broadcast",
  command: "text-net-command",
  clan: "text-net-clan",
  party: "text-net-party",
  reserve: "text-net-reserve",
  lounge: "text-text",
};
export const NET_BORDER: Record<NetKind, string> = {
  broadcast: "border-l-net-broadcast",
  command: "border-l-net-command",
  clan: "border-l-net-clan",
  party: "border-l-net-party",
  reserve: "border-l-net-reserve",
  lounge: "border-l-gold-dim",
};
export const NET_NAME: Record<NetKind, string> = {
  broadcast: "Broadcast",
  command: "Command",
  clan: "Clan",
  party: "Party",
  reserve: "Reserve",
  lounge: "Lounge",
};

/** One line on what each net is for, shown as a tooltip. */
export const NET_TIP: Record<NetKind, string> = {
  broadcast: "Broadcast: the event leader and deputies speak, everyone in the operation hears.",
  command: "Command: the event leader, deputies, clan leaders and party leaders talk to each other. Nobody else hears it.",
  clan: "Clan: the clan leader and officers speak, the whole clan hears.",
  party: "Party: you and your party talk here.",
  reserve: "Reserve: players without a party, and the organisers placing them.",
  lounge: "Lounge: your clan's room between operations. Everyone in it can talk.",
};
/** The net colours as CSS values, for glows and shadows. */
export const NET_VAR: Record<NetKind, string> = {
  broadcast: "var(--color-net-broadcast)",
  command: "var(--color-net-command)",
  clan: "var(--color-net-clan)",
  party: "var(--color-net-party)",
  reserve: "var(--color-net-reserve)",
  lounge: "var(--color-gold)",
};

/** A small square with the player's initial, so a list of names is easier to scan. */
export function Initial({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-bg-0 border border-line text-[10px] font-semibold uppercase text-text-muted ${className}`}>
      {name.trim().charAt(0) || "?"}
    </span>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`title text-gold-bright ${className}`}>{APP_NAME}</span>;
}

/** Re-renders the caller whenever the engine's state changes. */
export function useEngine() {
  const [, bump] = useState(0);
  useEffect(() => {
    const prev = engine.onChange;
    engine.onChange = () => {
      prev();
      bump((n) => n + 1);
    };
    return () => {
      engine.onChange = prev;
    };
  }, []);
  return engine;
}

export function useDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const load = () => navigator.mediaDevices.enumerateDevices().then(setDevices).catch(() => {});
    void load();
    navigator.mediaDevices.addEventListener("devicechange", load);
    // Device names only appear once the microphone has been allowed.
    const t = window.setInterval(load, 3000);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", load);
      window.clearInterval(t);
    };
  }, []);
  return {
    inputs: devices.filter((d) => d.kind === "audioinput" && d.deviceId),
    outputs: devices.filter((d) => d.kind === "audiooutput" && d.deviceId),
  };
}

const DB_MIN = -70;
const pct = (db: number) => Math.max(0, Math.min(100, ((db - DB_MIN) / -DB_MIN) * 100));

/** Live input level. With `threshold`, also draws the voice-activation marker on it. */
export function Meter({ threshold }: { threshold?: number }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let peak = -100;
    return engine.onLevel((db) => {
      // Fast rise, slow fall, so the bar is readable.
      peak = db > peak ? db : peak - 0.6;
      if (bar.current) {
        bar.current.style.width = `${pct(peak)}%`;
        bar.current.style.background =
          threshold !== undefined && peak >= threshold ? "var(--color-net-party)" : "var(--color-gold-dim)";
      }
    });
  }, [threshold]);
  return (
    <div
      className="relative h-3 rounded-sm bg-bg-2 border border-line overflow-hidden"
      role="img"
      aria-label="Microphone level"
      {...tip(threshold !== undefined ? "Your microphone level. The mic opens when the bar passes the gold marker." : "Your microphone level right now.")}
    >
      <div ref={bar} className="h-full" style={{ width: 0 }} />
      {threshold !== undefined && (
        <div className="absolute top-0 bottom-0 w-0.5 bg-gold-bright" style={{ left: `${pct(threshold)}%` }} />
      )}
    </div>
  );
}

/** A button that shows a binding and re-binds it on click. */
export function KeyBind({ target, label }: { target: BindTarget; label?: string }) {
  const s = useSettings();
  const [capturing, setCapturing] = useState(false);
  const code = s.bindings[target];
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        className={`btn text-sm min-w-28 ${code === null && !capturing ? "btn-quiet" : ""}`}
        disabled={capturing}
        aria-label={`${label ?? target} key`}
        {...tip("Click, then press the key or mouse button you want. The game still receives the key.")}
        onClick={async (e) => {
          // Drop focus so a bound Space or Enter does not click this button again.
          e.currentTarget.blur();
          setCapturing(true);
          const next = await captureKey();
          setCapturing(false);
          setSettings({ bindings: { ...s.bindings, [target]: next } });
        }}
      >
        {capturing ? "Press a key…" : code !== null ? keyLabel(code) : "Bind a key"}
      </button>
      {code !== null && !capturing && (
        <button
          type="button"
          className="px-1 text-text-muted hover:text-danger cursor-pointer"
          aria-label={`Clear ${label ?? target} key`}
          {...tip("Remove this key")}
          onClick={() => setSettings({ bindings: { ...s.bindings, [target]: null } })}
        >
          ×
        </button>
      )}
    </span>
  );
}

export function DevicePickers() {
  const s = useSettings();
  const { inputs, outputs } = useDevices();
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-text-muted">
        Microphone
        <select className="field" value={s.inputDeviceId} onChange={(e) => setSettings({ inputDeviceId: e.target.value })}>
          <option value="">System default</option>
          {inputs.filter((d) => d.deviceId !== "default").map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || "Microphone"}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-text-muted">
        Speakers or headset
        <select className="field" value={s.outputDeviceId} onChange={(e) => setSettings({ outputDeviceId: e.target.value })}>
          <option value="">System default</option>
          {outputs.filter((d) => d.deviceId !== "default").map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || "Output"}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function MicTest() {
  const [state, setState] = useState<"idle" | "recording" | "playing">("idle");
  const [error, setError] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <Meter />
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn btn-quiet text-sm"
          disabled={state !== "idle"}
          {...tip("Records 3 seconds from your microphone and plays them back through your headset.")}
          onClick={async () => {
            setError("");
            setState("recording");
            const playing = window.setTimeout(() => setState("playing"), 3000);
            try {
              await engine.micTest(3000);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
            window.clearTimeout(playing);
            setState("idle");
          }}
        >
          {state === "recording" ? "Speak now…" : state === "playing" ? "Playing back…" : "Test: record 3 seconds"}
        </button>
        {error && <span className="text-danger" role="alert">{error}</span>}
      </div>
    </div>
  );
}

/** Push-to-talk or voice activation for Party and Reserve, with the sensitivity marker. */
export function PartyMode() {
  const s = useSettings();
  const [measuring, setMeasuring] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <label className="flex items-center gap-2" {...tip("Your mic is open only while you hold your key.")}>
          <input type="radio" checked={s.partyMode === "ptt"} onChange={() => setSettings({ partyMode: "ptt" })} /> Push-to-talk
        </label>
        <label className="flex items-center gap-2" {...tip("Your mic opens by itself when you speak. Applies to your party, Reserve and the lounge only.")}>
          <input type="radio" checked={s.partyMode === "voice"} onChange={() => setSettings({ partyMode: "voice" })} /> Voice activation
        </label>
      </div>
      {s.partyMode === "ptt" ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-text-muted">Party and lounge key</span>
          <KeyBind target="party" label="Party" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Meter threshold={s.vadThresholdDb} />
          <input
            type="range"
            min={-70}
            max={-10}
            step={1}
            value={s.vadThresholdDb}
            aria-label="Voice activation sensitivity"
            onChange={(e) => setSettings({ vadThresholdDb: Number(e.target.value) })}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-quiet text-sm"
              disabled={measuring}
              {...tip("Measures the noise in your room for 5 seconds and sets the marker just above it.")}
              onClick={async () => {
                setMeasuring(true);
                setSettings({ vadThresholdDb: await engine.measureNoise(5000) });
                setMeasuring(false);
              }}
            >
              {measuring ? "Stay quiet for 5 seconds…" : "Auto"}
            </button>
            <span className="text-text-muted text-xs">
              The mic opens when the bar passes the marker. Set it above your keyboard noise and below your voice.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
