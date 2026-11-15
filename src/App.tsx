import { useEffect, useMemo, useRef, useState } from "react";
import { NET_ORDER, VoiceEngine, type JoinResponse, type LatencySample, type NetId, type NetView } from "./engine";
import { createInput, isDesktop, type Binding, type Foreground, type InputBackend, type InputDiag, type InputSource } from "./input";
import { keyLabel } from "./keys";

const DEFAULT_SERVER = import.meta.env.VITE_SERVER ?? "https://ignite.v1rtopia.com";
const NET_NAME: Record<NetId, string> = {
  broadcast: "Broadcast",
  command: "Command",
  clan: "Clan",
  party: "Party",
};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

export default function App() {
  const engine = useMemo(() => new VoiceEngine(), []);
  const inputRef = useRef<InputBackend | null>(null);

  const [server, setServer] = useState(() => load("server", isDesktop ? DEFAULT_SERVER : location.origin));
  const [name, setName] = useState(() => load("name", ""));
  const [pass, setPass] = useState("");
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [nets, setNets] = useState<NetView[]>([]);
  const [bindings, setBindings] = useState<Binding[]>(() => load("bindings", []));
  const [capturing, setCapturing] = useState<NetId | null>(null);
  const [source, setSource] = useState<InputSource>(() => load("source", "hook"));
  const [fg, setFg] = useState<Foreground | null>(null);
  const [alwaysAdmin, setAlwaysAdmin] = useState<boolean>(() => load("alwaysAdmin", false));
  const triedElevate = useRef(false);
  const [diag, setDiag] = useState<InputDiag>({ hook: 0, raw: 0 });
  const [samples, setSamples] = useState<LatencySample[]>([]);
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    engine.onChange = () => setNets(engine.view());
    engine.onLog = (line) => setLog((l) => [...l.slice(-300), line]);
    engine.onLatency = (s) => setSamples((xs) => [...xs.slice(-99), s]);
    let cancelled = false;
    void createInput().then((input) => {
      if (cancelled) return;
      inputRef.current = input;
      input.onPtt((e) => engine.ptt(e.net, e.down, e.t));
      input.onForeground(setFg);
      input.onDiag(setDiag);
      void input.setBindings(load("bindings", []));
      void input.setSource(load("source", "hook"));
    });
    return () => {
      cancelled = true;
    };
  }, [engine]);

  useEffect(() => {
    save("bindings", bindings);
    void inputRef.current?.setBindings(bindings);
  }, [bindings]);

  useEffect(() => {
    save("source", source);
    void inputRef.current?.setSource(source);
  }, [source]);

  useEffect(() => {
    save("alwaysAdmin", alwaysAdmin);
  }, [alwaysAdmin]);

  // With the setting on, relaunch elevated once per start. If the Windows
  // prompt is declined the app carries on as a normal user.
  useEffect(() => {
    if (!alwaysAdmin || !fg || fg.selfElevated || triedElevate.current) return;
    triedElevate.current = true;
    inputRef.current?.restartAsAdmin().catch(() => {});
  }, [alwaysAdmin, fg]);

  async function join() {
    setBusy(true);
    setError("");
    try {
      save("server", server);
      save("name", name);
      const res = await fetch(`${server.replace(/\/$/, "")}/spike/api/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, pass }),
      });
      if (!res.ok) throw new Error(res.status === 401 ? "Wrong passphrase" : `Server said ${res.status}`);
      const data = (await res.json()) as JoinResponse;
      await engine.start(data, { echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      setJoined(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await engine.stop();
    } finally {
      setBusy(false);
    }
  }

  async function bind(net: NetId) {
    const input = inputRef.current;
    if (!input) return;
    setCapturing(net);
    const code = await input.capture();
    setCapturing(null);
    setBindings((bs) => [...bs.filter((b) => b.net !== net), { net, code }]);
  }

  const blocked = !!fg && !fg.selfElevated && fg.elevated !== false;
  const withAudio = samples.filter((s) => s.audioMs !== null).map((s) => s.audioMs as number);

  if (!joined) {
    return (
      <main className="join">
        <h1>Voice Spike</h1>
        <p className="muted">Phase 0 test build. Throwaway.</p>
        {isDesktop && (
          <label>
            Server
            <input value={server} onChange={(e) => setServer(e.target.value)} />
          </label>
        )}
        <label>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoFocus />
        </label>
        <label>
          Test passphrase
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && join()} />
        </label>
        <button disabled={busy || !name.trim() || !pass} onClick={join}>
          {busy ? "Connecting…" : "Join all four nets"}
        </button>
        {error && <p className="error">{error}</p>}
        {!isDesktop && (
          <p className="muted">Browser mode: push-to-talk only works while this tab has focus.</p>
        )}
      </main>
    );
  }

  return (
    <main>
      {blocked && (
        <div className="warn">
          <strong>{fg!.exe || "The window in front"} is running as administrator.</strong> Windows hides key presses
          from this app while it has focus, so push-to-talk will not fire.
          <button onClick={() => inputRef.current?.restartAsAdmin()}>Restart as administrator</button>
        </div>
      )}

      <section>
        <h2>Nets</h2>
        <table>
          <thead>
            <tr>
              <th>Net</th>
              <th>Connection</th>
              <th>Others</th>
              <th>Speaking</th>
              <th>Your key</th>
              <th>Volume</th>
            </tr>
          </thead>
          <tbody>
            {NET_ORDER.map((id) => {
              const n = nets.find((x) => x.net === id);
              const b = bindings.find((x) => x.net === id);
              return (
                <tr key={id} className={n?.live ? `live ${id}` : id}>
                  <td className="net">{NET_NAME[id]}</td>
                  <td className={n?.state === "connected" ? "ok" : "bad"}>{n?.state ?? "–"}</td>
                  <td>{n?.listeners ?? 0}</td>
                  <td>{n?.live ? <b>YOU </b> : null}{n?.speakers.join(", ")}</td>
                  <td>
                    <button
                      onClick={(e) => {
                        // Drop focus so a bound Space or Enter does not click this button again.
                        e.currentTarget.blur();
                        void bind(id);
                      }}
                      disabled={capturing !== null}
                    >
                      {capturing === id ? "Press a key or mouse button…" : b ? keyLabel(b.code) : "Bind"}
                    </button>
                  </td>
                  <td>
                    <input type="range" min={0} max={1} step={0.05} defaultValue={1} onChange={(e) => engine.setVolume(id, Number(e.target.value))} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="cols">
        <div>
          <h2>Key capture</h2>
          {isDesktop ? (
            <>
              <p>
                This app: <b>{fg?.selfElevated ? "administrator" : "normal user"}</b>
                <br />
                In front: <b>{fg?.exe || "?"}</b> (
                {fg?.elevated === true ? "administrator" : fg?.elevated === false ? "normal" : "unreadable, likely administrator"})
              </p>
              <p>
                <label className="inline">
                  <input type="checkbox" checked={alwaysAdmin} onChange={(e) => {
                      triedElevate.current = true; // takes effect on the next start, not mid-session
                      setAlwaysAdmin(e.target.checked);
                    }} /> Always
                  start as administrator (from the next start)
                </label>
              </p>
              <p>
                Method:{" "}
                <label className="inline">
                  <input type="radio" checked={source === "hook"} onChange={() => setSource("hook")} /> Low-level hook
                </label>{" "}
                <label className="inline">
                  <input type="radio" checked={source === "raw"} onChange={() => setSource("raw")} /> Raw Input
                </label>
              </p>
              <p className="mono">
                Key/button transitions seen: hook {diag.hook} · raw {diag.raw}
              </p>
              <p className="muted">
Only the selected method counts. Its number should climb as you press keys with the game in front; if
                it stays flat, that method is blocked there, so try the other.
              </p>
            </>
          ) : (
            <p className="muted">Browser mode: keys only register while this tab has focus.</p>
          )}
        </div>
        <div>
          <h2>Key press to audio</h2>
          <p className="mono">
            presses {samples.length} · with speech {withAudio.length}
            <br />
            hook → app: median {median(samples.map((s) => s.deliverMs))} ms, max {Math.max(0, ...samples.map((s) => s.deliverMs))} ms
            <br />
            hook → mic open: median {median(samples.map((s) => s.enableMs))} ms
            <br />
            hook → audio leaving: median {median(withAudio)} ms, max {Math.max(0, ...withAudio)} ms (target &lt; 150)
          </p>
          <p className="muted">Start talking first, then press the key: silence sends nothing, so there is nothing to time.</p>
          <button onClick={() => setSamples([])}>Reset</button>
        </div>
      </section>

      <section>
        <h2>Reconnect test</h2>
        <p className="muted">
          Real test: disable your network adapter for 10 seconds, re-enable it, and wait for the “all rooms recovered”
          line. The buttons trigger LiveKit's own simulated faults.
        </p>
        <button onClick={() => engine.simulate("signal-reconnect")}>Simulate signal drop</button>{" "}
        <button onClick={() => engine.simulate("full-reconnect")}>Simulate full reconnect</button>{" "}
        <button onClick={() => navigator.clipboard?.writeText(log.join("\n"))}>Copy log</button>
        <pre className="log">{log.slice(-80).join("\n")}</pre>
      </section>
    </main>
  );
}
