// The alliance's game setup, edited by its admins: which classes there are
// and what each does, how big a party is and what it should have, the
// alliance's own kinds of event, and so on. Nothing about any one game is
// built into the app; an alliance starts from a preset and changes it.
//
// Lists are typed one entry to a line, like a column of a spreadsheet. The
// server checks everything and says what is wrong in words.

import { useEffect, useState } from "react";
import { rpc, type GameProfile, type GameProfileEdit } from "../api";
import { refreshGame } from "../game";
import { ConfirmButton, useAct, useLoad } from "./app-context";

export const GAME_SETUP_HELP = [
  "How this alliance's game works, so the app fits it. Players choose from these lists, and the roster board works out from them what each party still needs.",
  "Start from a preset and change what you like. Type lists one entry to a line.",
  "Classes: a name, a short tag shown beside players' names, and the role the class plays, separated by commas. For example: Bishop, BP, Healer. The role must be one of your roles, or left out.",
  "A party needs: tick the roles every party should have one of. The board lists the ones a party has nobody for.",
  "Kinds of event: your own list, for example your alliance's sieges and bosses. An operation can then be marked as one of them.",
  "Changing a list does not change what players have already chosen: someone with a class you remove keeps it until they choose again.",
].join("\n");

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);
const classText = (p: GameProfile) => p.classes.map((c) => [c.name, c.tag, c.role ?? ""].join(", ").replace(/, $/, "")).join("\n");

type Draft = { preset: string; roles: string; classes: string; partySize: string; needs: string[]; groupTypes: string; levelLabel: string; levelBands: string; eventTypes: string; nameRule: string };
const draftOf = (p: GameProfile): Draft => ({
  preset: p.preset,
  roles: p.roles.join("\n"),
  classes: classText(p),
  partySize: String(p.partySize),
  needs: p.partyNeeds,
  groupTypes: p.groupTypes.join("\n"),
  levelLabel: p.levelLabel,
  levelBands: p.levelBands.join("\n"),
  eventTypes: p.eventTypes.join("\n"),
  nameRule: p.nameRule,
});
const profileOf = (d: Draft) => ({
  preset: d.preset,
  roles: lines(d.roles),
  classes: lines(d.classes).map((l) => {
    const [name = "", tag = "", role = ""] = l.split(",").map((x) => x.trim());
    return { name, tag, role: role || null };
  }),
  partySize: Number(d.partySize),
  partyNeeds: d.needs,
  groupTypes: lines(d.groupTypes),
  levelLabel: d.levelLabel,
  levelBands: lines(d.levelBands),
  eventTypes: lines(d.eventTypes),
  nameRule: d.nameRule,
});

function ListBox({ label, value, onChange, rows, hint }: { label: string; value: string; onChange: (v: string) => void; rows: number; hint?: string }) {
  return (
    <label className="flex min-w-48 flex-1 flex-col gap-1 text-text-muted">
      <span>
        {label} <span className="text-xs tabular-nums">({lines(value).length})</span>
      </span>
      <textarea className="field font-mono text-sm" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} aria-label={label} />
      {hint && <span className="text-xs">{hint}</span>}
    </label>
  );
}

export function GameSetup() {
  const { data, error, reload } = useLoad(() => rpc<GameProfileEdit>("alliance.getProfile"), [], 600_000);
  const [d, setD] = useState<Draft | null>(null);
  const [saved, setSaved] = useState("");
  const [open, setOpen] = useState(false);
  const act = useAct();
  // The draft follows the server until the admin starts typing; after a save it is taken from the server again.
  useEffect(() => {
    if (data && !d) setD(draftOf(data.profile));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (error && !data) return <p className="text-danger">{error}</p>;
  if (!data || !d) return <p className="text-text-muted">Loading…</p>;

  const set = (patch: Partial<Draft>) => {
    setSaved("");
    setD({ ...d, ...patch });
  };
  const roles = lines(d.roles);
  const now = data.profile;
  const presetLabel = data.presets.find((p) => p.id === now.preset)?.label ?? "your own";
  const changed = JSON.stringify(profileOf(d)) !== JSON.stringify(profileOf(draftOf(now)));

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3" data-game-setup>
        <span className="text-text-muted">
          Started from <span className="text-text">{presetLabel}</span>: {now.classes.length} classes, parties of {now.partySize}
          {now.eventTypes.length > 0 && `, ${now.eventTypes.length} kinds of event`}.
        </span>
        <button type="button" className="btn btn-quiet ml-auto text-sm" onClick={() => setOpen(true)}>Change the setup</button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      data-game-setup
      onSubmit={(e) => {
        e.preventDefault();
        void act.run(() => rpc("alliance.setProfile", { profile: profileOf(d) })).then((ok) => {
          if (!ok) return;
          setSaved("Saved. Every player's app has the new lists.");
          setD(null);
          reload();
          refreshGame();
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-text-muted">
          Start again from a preset
          <select className="field" value="" onChange={(e) => {
            const p = data.presets.find((x) => x.id === e.target.value);
            if (p) setD(draftOf(p.profile));
            setSaved("");
          }} aria-label="Preset">
            <option value="" disabled>Choose a game…</option>
            {data.presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <span className="pb-2 text-xs text-text-muted">Choosing one fills in the lists below. Nothing changes for players until you save.</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <ListBox label="Roles" rows={8} value={d.roles} onChange={(v) => set({ roles: v, needs: d.needs.filter((n) => lines(v).some((r) => r.toLowerCase() === n.toLowerCase())) })} hint="What a class does in a party." />
        <ListBox label="Classes" rows={8} value={d.classes} onChange={(v) => set({ classes: v })} hint="Name, tag, role. One class to a line." />
      </div>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <label className="flex flex-col gap-1 text-text-muted">
          Party size
          <input type="number" min={2} max={40} className="field w-24" value={d.partySize} onChange={(e) => set({ partySize: e.target.value })} aria-label="Party size" />
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-text-muted">A party needs one of each</legend>
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {roles.length === 0 && <span className="text-text-muted">Add roles first.</span>}
            {roles.map((r) => (
              <label key={r} className="flex items-center gap-1.5">
                <input type="checkbox" checked={d.needs.some((n) => n.toLowerCase() === r.toLowerCase())} onChange={(e) => set({ needs: e.target.checked ? [...d.needs, r] : d.needs.filter((n) => n.toLowerCase() !== r.toLowerCase()) })} />
                {r}
              </label>
            ))}
          </span>
        </fieldset>
        <label className="flex flex-col gap-1 text-text-muted">
          In-game names may have
          <select className="field" value={d.nameRule} onChange={(e) => set({ nameRule: e.target.value })} aria-label="In-game names may have">
            {data.nameRules.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <ListBox label="Kinds of event" rows={6} value={d.eventTypes} onChange={(v) => set({ eventTypes: v })} hint="Your own: sieges, bosses, whatever you run." />
        <ListBox label="Group types" rows={6} value={d.groupTypes} onChange={(v) => set({ groupTypes: v })} hint="What a party can be marked as. Leave empty for none." />
        <div className="flex min-w-48 flex-1 flex-col gap-2">
          <label className="flex flex-col gap-1 text-text-muted">
            Bands are called
            <input className="field" value={d.levelLabel} maxLength={24} onChange={(e) => set({ levelLabel: e.target.value })} aria-label="Bands are called" />
          </label>
          <ListBox label="Bands" rows={3} value={d.levelBands} onChange={(v) => set({ levelBands: v })} hint="For example 60-70. Leave empty and players are not asked." />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={act.busy || !changed}>Save game setup</button>
        <button type="button" className="btn btn-quiet" onClick={() => { setD(draftOf(now)); setSaved(""); setOpen(false); }}>Close</button>
        {changed && <ConfirmButton className="text-xs text-text-muted hover:text-danger cursor-pointer" confirm="Throw the changes away?" onConfirm={() => { setD(draftOf(now)); setSaved(""); }}>Undo changes</ConfirmButton>}
        {act.error && <span className="text-danger" role="alert">{act.error}</span>}
        {saved && <span className="text-net-party" role="status">{saved}</span>}
      </div>
    </form>
  );
}
