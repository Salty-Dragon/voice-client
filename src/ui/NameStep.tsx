import { useState } from "react";
import { rpc } from "../api";
import { useAct } from "./app-context";
import { Wordmark } from "./common";

/** In-game name and class tag. Shown once after the first sign-in, and reused in Settings. */
export function ProfileForm({ name, classTag, onSaved, submit }: { name: string; classTag: string; onSaved: () => void; submit: string }) {
  const [n, setN] = useState(name);
  const [t, setT] = useState(classTag);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAct();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaved(false);
        if (await run(() => rpc("profile.save", { name: n, classTag: t }))) {
          setSaved(true);
          onSaved();
        }
      }}
    >
      <label className="flex flex-col gap-1 text-text-muted">
        In-game name
        <input className="field" value={n} onChange={(e) => setN(e.target.value)} maxLength={24} required autoComplete="off" />
        <span className="text-xs">Exactly as it appears in game, so callers can find you.</span>
      </label>
      <label className="flex flex-col gap-1 text-text-muted">
        Class tag (optional)
        <input className="field w-32 uppercase" value={t} onChange={(e) => setT(e.target.value)} maxLength={4} autoComplete="off" placeholder="BP, OL, SWS…" />
      </label>
      <div className="flex items-center gap-3">
        <button className="btn" disabled={busy || !n.trim()}>{busy ? "Saving…" : submit}</button>
        {error && <span className="text-danger" role="alert">{error}</span>}
        {saved && !error && <span className="text-net-party" role="status">Saved.</span>}
      </div>
    </form>
  );
}

export function NameStep({ onSaved }: { onSaved: () => void }) {
  return (
    <main className="flex h-full items-center justify-center p-6">
      <div className="panel w-full max-w-md p-8 flex flex-col gap-5">
        <Wordmark className="text-lg" />
        <h1 className="title text-gold">Your name</h1>
        <p className="text-text-muted">Welcome. First, confirm the name you play under. Your clan leader approves you by this name.</p>
        <ProfileForm name="" classTag="" onSaved={onSaved} submit="Confirm name" />
      </div>
    </main>
  );
}
