import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, rpc, type ClanSummary, type Info } from "./api";
import { getToken, signOut } from "./auth";
import { CONTROL_URL, isDesktop, SERVER } from "./config";
import { ControlClient, type ControlState, type NetSet } from "./control";
import { engine } from "./runtime";
import { useSettings } from "./settings";
import { installUpdate, useUpdate } from "./update";
import { AppContext, type Tab } from "./ui/app-context";
import { AllianceView } from "./ui/AllianceView";
import { ClanView } from "./ui/ClanView";
import { NET_NAME, useEngine, Wordmark } from "./ui/common";
import { GuidesView } from "./ui/GuidesView";
import { Help } from "./ui/tips";
import { NameStep } from "./ui/NameStep";
import { RosterView } from "./ui/RosterView";
import { SettingsPanel } from "./ui/SettingsPanel";
import { SignIn } from "./ui/SignIn";
import { VoiceView } from "./ui/VoiceView";
import { Wizard } from "./ui/Wizard";

type Phase = "signin" | "running" | "replaced";

const TABS: { id: Tab; label: string }[] = [
  { id: "voice", label: "Voice" },
  { id: "roster", label: "Operations" },
  { id: "clan", label: "Clan" },
  { id: "alliance", label: "Alliance" },
  { id: "guides", label: "Guides" },
];

export default function App() {
  const s = useSettings();
  const eng = useEngine();
  const update = useUpdate();
  const [token, setToken] = useState<string | null>(getToken);
  // The browser version has no token: it tries the site's cookie and falls back to the sign-in screen.
  const [phase, setPhase] = useState<Phase>(isDesktop && !token ? "signin" : "running");
  const [attempt, setAttempt] = useState(0);
  const [info, setInfo] = useState<Info | null>(null);
  const [set, setSet] = useState<NetSet | null>(null);
  const [state, setState] = useState<ControlState>("connecting");
  const [notice, setNotice] = useState("");
  const [signInNotice, setSignInNotice] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<Tab>("voice");
  const [boardOp, setBoardOp] = useState<number | null>(null);
  const [crests, setCrests] = useState<ReadonlyMap<number, number>>(new Map());
  const control = useRef<ControlClient | null>(null);
  const retry = useRef<number | undefined>(undefined);
  const refreshInfoRef = useRef<() => void>(() => {});

  const leave = useCallback((why: string) => {
    void engine.stop();
    setSet(null);
    setInfo(null);
    if (isDesktop) {
      void signOut();
      setToken(null);
    }
    setSignInNotice(why);
    setPhase("signin");
  }, []);

  const refreshInfo = useCallback(() => {
    rpc<Info>("me")
      .then(setInfo)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) return leave(isDesktop ? "You were signed out. Sign in again to continue." : "");
        // The server could not be reached. Keep trying rather than sitting on "Connecting…" for good.
        window.clearTimeout(retry.current);
        retry.current = window.setTimeout(() => refreshInfoRef.current(), 4000);
      });
  }, [leave]);
  refreshInfoRef.current = refreshInfo;

  useEffect(() => {
    if (phase !== "running") return;
    refreshInfo();
    const c = new ControlClient(CONTROL_URL, token);
    control.current = c;
    let noticeTimer: number | undefined;
    c.onState = setState;
    c.onNetSet = (next) => {
      setSet(next);
      void engine.apply(next);
      if (next.notice?.kind === "moved") {
        engine.cue("moved");
        setNotice(next.notice.party ? `You were moved to ${next.notice.party}.` : "You were moved to Reserve.");
        window.clearTimeout(noticeTimer);
        noticeTimer = window.setTimeout(() => setNotice(""), 8000);
      }
    };
    c.onChanged = () => {
      setTick((n) => n + 1);
      refreshInfo();
    };
    c.onEnded = (why) => {
      if (why === "replaced") {
        void engine.stop();
        setSet(null);
        return setPhase("replaced");
      }
      leave(isDesktop ? "You were signed out. Sign in again to continue." : "");
    };
    engine.onNeedRefresh = () => c.refresh();
    c.start();
    return () => {
      window.clearTimeout(noticeTimer);
      window.clearTimeout(retry.current);
      c.stop();
      control.current = null;
      void engine.stop();
    };
  }, [phase, token, attempt, refreshInfo, leave]);

  // Which clans have a crest. Reloaded whenever the server reports a change.
  const named = info?.user.nameSet === true;
  useEffect(() => {
    if (phase !== "running" || !named) return;
    rpc<ClanSummary[]>("clans.list")
      .then((list) => setCrests(new Map(list.filter((c) => c.crest > 0).map((c) => [c.id, c.crest]))))
      .catch(() => {});
  }, [phase, named, tick]);

  if (phase === "signin") {
    return (
      <SignIn
        notice={signInNotice}
        onToken={(t) => {
          setSignInNotice("");
          setToken(t);
          setPhase("running");
        }}
      />
    );
  }

  if (phase === "replaced") {
    return (
      <main className="flex h-full items-center justify-center p-6">
        <div className="panel max-w-sm p-8 flex flex-col gap-4 text-center">
          <Wordmark className="text-lg" />
          <p>This account connected from somewhere else, so this one was disconnected.</p>
          <div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPhase("running");
                setAttempt((n) => n + 1);
              }}
            >
              Reconnect here
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!info) {
    return (
      <main className="flex h-full items-center justify-center">
        <p className="text-text-muted">Connecting…</p>
      </main>
    );
  }
  if (!info.user.nameSet) return <NameStep onSaved={refreshInfo} />;
  if (!s.wizardDone) return <Wizard />;

  // Nets your mic is open on right now, for the header's indicator.
  const onAir = eng.view().filter((n) => n.live).map((n) => (n.net === "lounge" || n.net === "party" ? n.label : NET_NAME[n.net]));

  const go = (next: Tab, opId?: number) => {
    setTab(next);
    setBoardOp(next === "roster" ? (opId ?? null) : null);
  };

  return (
    <AppContext.Provider
      value={{ info, refreshInfo, tick, set, control: state, select: (t) => control.current?.select(t), tab, go, boardOp, notice, crests }}
    >
      <div className="frame flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-gold-dim bg-bg-1/85 px-4 py-2">
          <Wordmark />
          <nav className="flex gap-1" aria-label="Screens">
            {TABS.filter((t) => t.id !== "alliance" || info.user.runsAlliance).map((t) => (
              <button
                key={t.id}
                type="button"
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => go(t.id)}
                className={`border-b-2 px-3 py-1 cursor-pointer transition-colors duration-150 ${
                  tab === t.id ? "border-gold text-gold-bright" : "border-transparent text-text-muted hover:text-text"
                }`}
              >
                {t.label}
                {t.id === "roster" && info.joinRequests.length > 0 && (
                  <span className="ml-2 rounded-sm bg-gold px-1.5 text-xs font-semibold text-bg-0" aria-label={`${info.joinRequests.length} asking to join your party`}>{info.joinRequests.length}</span>
                )}
                {t.id === "clan" && info.pendingApprovals > 0 && (
                  <span className="ml-2 rounded-sm bg-gold px-1.5 text-xs font-semibold text-bg-0" aria-label={`${info.pendingApprovals} waiting for approval`}>{info.pendingApprovals}</span>
                )}
              </button>
            ))}
          </nav>
          <span className="ml-auto flex items-center gap-3">
            {onAir.length > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-net-party" aria-label={`Your mic is open on ${onAir.join(", ")}`}>
                <span className="pulse h-2 w-2 rounded-full bg-net-party" />
                On air
                <span className="font-normal normal-case tracking-normal text-text-muted">{onAir.join(", ")}</span>
              </span>
            )}
            {state !== "online" && (
              <span className="flex items-center gap-1 text-xs text-danger">
                Server link lost, retrying…
                <Help text="The link that delivers roster changes dropped. Your voice keeps working, and it reconnects by itself." />
              </span>
            )}
            {eng.muteAll && (
              <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-danger">
                Mic muted
                <Help text="Your Mute all key is on. Press it again to speak." />
              </span>
            )}
            <span className="text-text-muted">
              {info.user.name}
              {info.user.classTag && <span className="ml-1 text-gold">{info.user.classTag}</span>}
            </span>
            <button type="button" className="btn btn-quiet text-sm" onClick={() => setShowSettings(true)}>Settings</button>
          </span>
        </header>

        {(update.phase === "ready" || update.phase === "installing") && (
          <div className="flex flex-wrap items-center gap-3 border-b border-gold-dim bg-bg-2 px-4 py-2" role="status">
            <span>
              Version {update.version} is ready.
              <span className="ml-2 text-text-muted">
                {update.phase === "installing"
                  ? "Installing; the app will restart by itself."
                  : "Restarting takes a few seconds and drops you from voice while it does."}
              </span>
            </span>
            <button type="button" className="btn text-sm" disabled={update.phase === "installing"} onClick={() => void installUpdate()}>
              Restart to update
            </button>
          </div>
        )}

        <div key={tab} className="rise min-h-0 flex-1 overflow-y-auto">
          {tab === "voice" && <VoiceView />}
          {tab === "roster" && <RosterView />}
          {tab === "clan" && <ClanView />}
          {tab === "alliance" && info.user.runsAlliance && <AllianceView />}
          {tab === "guides" && <GuidesView />}
        </div>

        {showSettings && (
          <SettingsPanel
            onClose={() => setShowSettings(false)}
            onSignOut={() => {
              setShowSettings(false);
              if (isDesktop) leave("");
              else window.location.href = `${SERVER}/`; // the browser's session belongs to the site
            }}
          />
        )}
      </div>
    </AppContext.Provider>
  );
}
