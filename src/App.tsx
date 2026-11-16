import { useEffect, useRef, useState } from "react";
import { getToken, signOut } from "./auth";
import { CONTROL_URL, isDesktop, SERVER } from "./config";
import { ControlClient, type ControlState, type Me, type NetSet } from "./control";
import { engine } from "./runtime";
import { useSettings } from "./settings";
import { Main } from "./ui/Main";
import { SettingsPanel } from "./ui/SettingsPanel";
import { SignIn } from "./ui/SignIn";
import { Wizard } from "./ui/Wizard";
import { Wordmark } from "./ui/common";

type Phase = "signin" | "running" | "replaced";

export default function App() {
  const s = useSettings();
  const [token, setToken] = useState<string | null>(getToken);
  // The browser fallback has no token: it tries its cookie and falls back to the sign-in screen.
  const [phase, setPhase] = useState<Phase>(isDesktop && !token ? "signin" : "running");
  const [attempt, setAttempt] = useState(0);
  const [me, setMe] = useState<Me | null>(null);
  const [set, setSet] = useState<NetSet | null>(null);
  const [state, setState] = useState<ControlState>("connecting");
  const [notice, setNotice] = useState("");
  const [signInNotice, setSignInNotice] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const control = useRef<ControlClient | null>(null);

  useEffect(() => {
    if (phase !== "running") return;
    const c = new ControlClient(CONTROL_URL, token);
    control.current = c;
    let noticeTimer: number | undefined;
    c.onState = setState;
    c.onHello = setMe;
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
    c.onEnded = (why) => {
      void engine.stop();
      setSet(null);
      if (why === "replaced") return setPhase("replaced");
      if (isDesktop) {
        void signOut();
        setToken(null);
        setSignInNotice("You were signed out. Sign in again to continue.");
      }
      setPhase("signin");
    };
    engine.onNeedRefresh = () => c.refresh();
    c.start();
    return () => {
      window.clearTimeout(noticeTimer);
      c.stop();
      control.current = null;
      void engine.stop();
    };
  }, [phase, token, attempt]);

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

  if (!s.wizardDone) return <Wizard />;

  return (
    <div className="relative h-full">
      <Main
        me={me}
        set={set}
        control={state}
        notice={notice}
        onSelect={(id) => control.current?.select(id)}
        onSettings={() => setShowSettings(true)}
      />
      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          onSignOut={() => {
            setShowSettings(false);
            if (isDesktop) {
              void signOut();
              setToken(null);
              setPhase("signin");
            } else {
              // The browser's session belongs to the site; sign out there.
              window.location.href = `${SERVER}/`;
            }
          }}
        />
      )}
    </div>
  );
}
