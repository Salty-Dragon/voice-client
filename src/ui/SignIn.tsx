import { useEffect, useState } from "react";
import { beginSignIn, onSignInLink, redeem } from "../auth";
import { isDesktop, SERVER } from "../config";
import { Wordmark } from "./common";

export function SignIn({ onToken, notice }: { onToken: (token: string) => void; notice?: string }) {
  const [waiting, setWaiting] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const finish = async (c: string) => {
    setError("");
    try {
      onToken(await redeem(c));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    let off = () => {};
    let gone = false;
    void onSignInLink((c) => void finish(c)).then((un) => (gone ? un() : (off = un)));
    return () => {
      gone = true;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex h-full items-center justify-center p-6">
      <div className="panel w-full max-w-sm p-8 flex flex-col gap-5 text-center">
        <Wordmark className="text-2xl" />
        <p className="text-text-muted">Voice that follows the chain of command.</p>
        {notice && <p className="text-gold" role="status">{notice}</p>}
        {!isDesktop ? (
          <>
            <a className="btn" href={`${SERVER}/`}>Sign in on the site</a>
            <p className="text-xs text-text-muted">Sign in with Discord there, then come back to this page.</p>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                setError("");
                try {
                  await beginSignIn();
                  setWaiting(true);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              Sign in with Discord
            </button>
            {waiting && (
              <div className="flex flex-col gap-2 text-left">
                <p className="text-text-muted">Finish signing in in your browser. This window continues by itself.</p>
                <details>
                  <summary className="cursor-pointer text-text-muted">Enter code instead</summary>
                  <form
                    className="mt-2 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void finish(code);
                    }}
                  >
                    <input className="field font-mono text-xs" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code from the browser page" aria-label="Sign-in code" />
                    <button className="btn btn-quiet text-sm" disabled={!code.trim()}>Use</button>
                  </form>
                </details>
              </div>
            )}
          </>
        )}
        {error && <p className="text-danger" role="alert">{error}</p>}
      </div>
    </main>
  );
}
