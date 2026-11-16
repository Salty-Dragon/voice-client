import { useEffect, useState } from "react";
import { isDesktop } from "../config";
import { getSettings } from "../settings";
import { updateAtStart, useUpdate } from "../update";
import { Wordmark } from "./common";

/**
 * The first screen of the desktop app: installs a waiting update before the
 * player joins voice, then hands over to the app. With no update (or a slow
 * server) it passes straight through.
 */
export function Boot({ children }: { children: React.ReactNode }) {
  // Nothing to wait for in the browser, or with automatic updates switched off.
  const [ready, setReady] = useState(() => !isDesktop || !getSettings().autoUpdate);
  const u = useUpdate();

  useEffect(() => {
    void updateAtStart().finally(() => setReady(true));
  }, []);

  if (ready) return <>{children}</>;
  return (
    <main className="flex h-full items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3 text-center" role="status">
        <Wordmark className="text-lg" />
        <p className="text-text-muted">
          {u.phase === "downloading"
            ? `Downloading version ${u.version}${u.percent === null ? "…" : `: ${u.percent}%`}`
            : u.phase === "ready" || u.phase === "installing"
              ? `Installing version ${u.version}. The app will restart by itself.`
              : "Checking for updates…"}
        </p>
      </div>
    </main>
  );
}
