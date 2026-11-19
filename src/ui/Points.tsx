// Points (an alliance may call them DKP or anything else): the settings of a
// pool, its standings, a player's lines, and an operation's points from its
// draft to being posted. The server decides who may see and do what (its
// web/lib/points.ts, STATUS decision 57); these screens offer only that.

import { Fragment, useEffect, useState } from "react";
import { rpc } from "../api";
import { t } from "../words";
import { useAct, useApp } from "./app-context";
import { Help } from "./tips";

export type PoolSettings = {
  enabled: boolean;
  name: string;
  mode: "flat" | "hourly";
  minShare: number;
  rates: Record<string, number>;
  cameBonus: number;
  noShow: number;
  eventLeaderPosts: boolean;
  open: boolean;
};
export type PoolInfo = { id: number | null; clanId: number | null; clanTag: string | null; clanName: string | null; settings: PoolSettings; manage: boolean; seeAll: boolean };
export type PointsOverview = { clanPools: boolean; eventTypes: string[]; pools: PoolInfo[] };
type StandingRow = { userId: number; name: string; clanTag: string | null; points: number; earned: number; adjusted: number; lastAt: string | null };
type WaitingOp = { id: number; name: string; eventType: string | null; endedAt: string };
type Standings = { pool: PoolInfo; rows: StandingRow[]; waiting: WaitingOp[] };
type Entry = { id: number; at: string; kind: "earned" | "adjust"; amount: number; label: string | null; reason: string | null; by: string | null; operationId: number | null };
type PlayerPoints = { pool: PoolInfo; player: { userId: number; name: string }; points: number; entries: Entry[] };
type Suggested = { amount: number; earned: number; bonus: number; noShow: number };
type OpRow = { userId: number; name: string; clanTag: string | null; seconds: number; signup: "coming" | "out" | null; suggested: Suggested; amount: number | null };
type OpPool = { pool: PoolInfo; posted: { by: string | null; at: string } | null; canPost: boolean; rows: OpRow[] };
type OpPointsData = { op: { id: number; name: string; eventType: string | null; endedAt: string | null; seconds: number }; pools: OpPool[] };

// t() where shown.
export const POINTS_HELP = [
  "Points (call them DKP, EP or anything else) are earned at operations and can be spent on loot.",
  "When an operation ends, what each player earned is worked out from who was in voice and for how long, as a draft. Whoever posts the points looks it over, changes what needs changing, and posts it. Nothing is added until then.",
  "Earning: a set amount for being in voice at least a share of the operation, or an amount for each hour in voice. Each kind of event can have its own amount. A bonus for saying \"coming\" and coming, and a deduction for saying \"coming\" and not, are optional.",
  "Points can also be given or taken by hand, always with a reason. Nothing is ever changed or removed: a mistake is put right with another line, and every line is in the log.",
  "Each player always sees their own points and every line behind them.",
].join("\n");

export const poolTitle = (p: PoolInfo) => (p.clanId === null ? p.settings.name : `${p.settings.name} [${p.clanTag ?? ""}]`);
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.round(s / 60)} min`);
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** The points the viewer can see or set up. Null while loading. */
export function usePointsOverview(): [PointsOverview | null, () => void] {
  const { tick } = useApp();
  const [data, setData] = useState<PointsOverview | null>(null);
  const [again, setAgain] = useState(0);
  useEffect(() => {
    let live = true;
    rpc<PointsOverview>("points.overview")
      .then((r) => live && setData(r))
      // A server from before points answers with an unknown method: no points, nothing to show.
      .catch(() => live && setData({ clanPools: false, eventTypes: [], pools: [] }));
    return () => {
      live = false;
    };
  }, [tick, again]);
  return [data, () => setAgain((n) => n + 1)];
}

// ---- Settings ----

/**
 * The settings of the alliance's points (clanId null), for its admins, with
 * the switch that lets clans keep their own; or of a clan's, for its leader
 * and officers, once the alliance allows it.
 */
export function PointsSettingsSection({ clanId }: { clanId: number | null }) {
  const [data, reload] = usePointsOverview();
  const pool = data?.pools.find((p) => p.clanId === clanId);
  if (!data || !pool?.manage) return null;
  return (
    <section className="panel flex flex-col gap-3 p-5" data-points-settings={clanId === null ? "alliance" : clanId}>
      <h2 className="title title-rule text-sm text-gold">
        {clanId === null ? "Points" : t("The clan's own points")}
        <Help text={t(POINTS_HELP) + (clanId === null ? t("\nThe alliance's admins can also let each clan keep points of its own, run by the clan's leader and officers, for the clan's own loot.") : "")} />
      </h2>
      <PointsForm key={JSON.stringify(pool.settings)} pool={pool} eventTypes={data.eventTypes} onSaved={reload} />
      {clanId === null && <ClanPoolsSwitch on={data.clanPools} onChange={reload} />}
    </section>
  );
}

function ClanPoolsSwitch({ on, onChange }: { on: boolean; onChange: () => void }) {
  const act = useAct();
  return (
    <label className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
      <input type="checkbox" checked={on} disabled={act.busy} data-points-clan-pools onChange={(e) => void act.run(() => rpc("points.setClanPools", { on: e.target.checked })).then(onChange)} />
      {t("Clans may keep points of their own")}
      <span className="text-xs text-text-muted">{t("Run by each clan's leader and officers, on the Clan tab. Off: what they have is kept, out of sight.")}</span>
      {act.error && <span className="text-danger" role="alert">{act.error}</span>}
    </label>
  );
}

function PointsForm({ pool, eventTypes, onSaved }: { pool: PoolInfo; eventTypes: string[]; onSaved: () => void }) {
  const act = useAct();
  const [s, setS] = useState<PoolSettings>(pool.settings);
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<PoolSettings>) => {
    setSaved(false);
    setS((x) => ({ ...x, ...patch }));
  };
  const setRate = (kind: string, v: string) => {
    const rates = { ...s.rates };
    if (kind !== "" && v === "") delete rates[kind];
    else rates[kind] = Math.max(0, Math.floor(Number(v) || 0));
    set({ rates });
  };
  const changed = JSON.stringify(s) !== JSON.stringify(pool.settings);
  const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
  const save = () =>
    void act.run(() => rpc("points.setPool", { clanId: pool.clanId, settings: s })).then((ok) => {
      if (ok) {
        setSaved(true);
        onSaved();
      }
    });
  const per = s.mode === "hourly" ? "per hour in voice" : t("for the operation");
  return (
    <div className="flex flex-col gap-3" data-points-form>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={s.enabled} onChange={(e) => set({ enabled: e.target.checked })} data-points-enabled />
        {pool.clanId === null ? "Keep points" : t("Keep points for the clan")}
        <span className="text-xs text-text-muted">{pool.clanId === null ? t("Off: nobody in the alliance sees points.") : t("Off: the clan's members do not see them.")}</span>
      </label>
      {s.enabled && (
        <>
          <label className="flex flex-wrap items-center gap-2">
            <span className="w-40 text-text-muted">Called</span>
            <input className="field w-40" value={s.name} maxLength={16} onChange={(e) => set({ name: e.target.value })} aria-label="What the points are called" data-points-name />
            <span className="text-xs text-text-muted">Points, DKP, EP: whatever your players say.</span>
          </label>
          <label className="flex flex-wrap items-center gap-2">
            <span className="w-40 text-text-muted">Earned</span>
            <select className="field w-auto" value={s.mode} onChange={(e) => set({ mode: e.target.value as PoolSettings["mode"] })} aria-label="How points are earned" data-points-mode>
              <option value="flat">{t("A set amount for each operation")}</option>
              <option value="hourly">An amount for each hour in voice</option>
            </select>
          </label>
          {s.mode === "flat" && (
            <label className="flex flex-wrap items-center gap-2">
              <span className="w-40 text-text-muted">For being there</span>
              <input className="field w-20" type="number" min={0} max={100} value={s.minShare} onChange={(e) => set({ minShare: Math.min(100, num(e.target.value)) })} aria-label={t("Share of the operation")} data-points-share />
              <span className="text-text-muted">{t("% of the operation or more")}</span>
            </label>
          )}
          <div className="flex flex-col gap-1.5" data-points-rates>
            <label className="flex flex-wrap items-center gap-2">
              <span className="w-40 text-text-muted">{eventTypes.length ? t("Any operation") : "Amount"}</span>
              <input className="field w-24" type="number" min={0} value={s.rates[""] ?? 0} onChange={(e) => setRate("", e.target.value)} aria-label={t("Points for any operation")} data-points-rate="" />
              <span className="text-text-muted">{per}</span>
            </label>
            {eventTypes.map((kind) => (
              <label key={kind} className="flex flex-wrap items-center gap-2">
                <span className="w-40 truncate text-text-muted">{kind}</span>
                <input className="field w-24" type="number" min={0} placeholder={String(s.rates[""] ?? 0)} value={s.rates[kind] ?? ""} onChange={(e) => setRate(kind, e.target.value)} aria-label={`Points for ${kind}`} data-points-rate={kind} />
                <span className="text-text-muted">{kind in s.rates ? per : "as above"}</span>
              </label>
            ))}
          </div>
          <label className="flex flex-wrap items-center gap-2">
            <span className="w-40 text-text-muted">Came as they said</span>
            <input className="field w-24" type="number" min={0} value={s.cameBonus} onChange={(e) => set({ cameBonus: num(e.target.value) })} aria-label="Bonus for coming as said" data-points-bonus />
            <span className="text-xs text-text-muted">added for saying "coming" and earning points</span>
          </label>
          <label className="flex flex-wrap items-center gap-2">
            <span className="w-40 text-text-muted">Did not show</span>
            <input className="field w-24" type="number" min={0} value={s.noShow} onChange={(e) => set({ noShow: num(e.target.value) })} aria-label="Taken for not showing" data-points-noshow />
            <span className="text-xs text-text-muted">taken for saying "coming" and never being in voice</span>
          </label>
          {pool.clanId === null && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={s.eventLeaderPosts} onChange={(e) => set({ eventLeaderPosts: e.target.checked })} data-points-leader-posts />
              {t("An operation's event leader may post its points")}
              <span className="text-xs text-text-muted">{t("Off: only the alliance's admins do.")}</span>
            </label>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={s.open} onChange={(e) => set({ open: e.target.checked })} data-points-open />
            Everyone sees the standings
            <span className="text-xs text-text-muted">{pool.clanId === null ? t("Off: admins see all, a clan's leader and officers their clan, each player their own.") : t("Off: the clan's leader and officers see all, each player their own.")}</span>
          </label>
        </>
      )}
      <div className="flex items-center gap-3">
        <button type="button" className="btn" disabled={!changed || act.busy} onClick={save} data-points-save>Save the points</button>
        {saved && !changed && <span className="text-sm text-text-muted" role="status">Saved.</span>}
        {act.error && <span className="text-danger" role="alert">{act.error}</span>}
      </div>
    </div>
  );
}

// ---- Standings ----

/** A pool's standings, a player's lines, adjustments by hand, and the operations waiting for their points. */
export function PointsStandings({ pool }: { pool: PoolInfo }) {
  const { info, tick } = useApp();
  const [data, setData] = useState<Standings | null>(null);
  const [error, setError] = useState("");
  const [player, setPlayer] = useState<number | null>(null);
  const [opId, setOpId] = useState<number | null>(null);
  const [again, setAgain] = useState(0);
  const reload = () => setAgain((n) => n + 1);
  useEffect(() => {
    if (pool.id === null) return;
    let live = true;
    rpc<Standings>("points.standings", { poolId: pool.id })
      .then((r) => live && (setData(r), setError("")))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [pool.id, tick, again]);

  if (pool.id === null) return <p className="text-text-muted">{t("These points are not switched on yet.")}</p>;
  if (error) return <p className="text-danger" role="alert">{error}</p>;
  if (!data) return <p className="text-text-muted">Loading…</p>;
  const name = data.pool.settings.name;
  if (opId !== null) {
    return (
      <div className="flex flex-col gap-3">
        <button type="button" className="btn btn-quiet self-start text-sm" onClick={() => (setOpId(null), reload())}>Back to the standings</button>
        <OpPoints opId={opId} onPosted={reload} />
      </div>
    );
  }
  if (player !== null) return <PlayerLines poolId={pool.id} userId={player} manage={data.pool.manage} onBack={() => (setPlayer(null), reload())} />;
  return (
    <div className="flex flex-col gap-4" data-points-standings={pool.id}>
      {data.waiting.length > 0 && (
        <section className="panel flex flex-col gap-2 border-gold-dim p-4" data-points-waiting>
          <h2 className="title title-rule text-sm text-gold">{t(`Operations waiting for their ${name}`)}</h2>
          <ul className="flex flex-col divide-y divide-line">
            {data.waiting.map((w) => (
              <li key={w.id} className="flex items-center gap-3 py-1.5">
                <span className="flex-1">{w.name}{w.eventType && <span className="text-xs text-text-muted"> · {w.eventType}</span>}</span>
                <span className="text-xs text-text-muted">{day(w.endedAt)}</span>
                <button type="button" className="btn text-sm" onClick={() => setOpId(w.id)} data-points-review={w.id}>Review and post</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="panel flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="title title-rule flex-1 text-sm text-gold">{t(`${name}: standings`)}</h2>
          <button type="button" className="btn btn-quiet text-xs" onClick={() => setPlayer(info.user.id)} data-points-mine>My own lines</button>
        </div>
        {!data.pool.seeAll && <p className="text-xs text-text-muted">{data.rows.length > 1 ? t("You see your own clan's players.") : "You see your own points. The standings are not open to everyone."}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted">
                <th className="py-1 pr-3 font-normal">#</th>
                <th className="py-1 pr-3 font-normal">Player</th>
                <th className="py-1 pr-3 text-right font-normal">{name}</th>
                <th className="py-1 pr-3 text-right font-normal">{t("From operations")}</th>
                <th className="py-1 pr-3 text-right font-normal">By hand</th>
                <th className="py-1 font-normal">Last change</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={r.userId} className={`cursor-pointer border-t border-line hover:bg-bg-2 ${r.userId === info.user.id ? "bg-bg-2/60" : ""}`} onClick={() => setPlayer(r.userId)} data-points-row={r.userId}>
                  <td className="py-1 pr-3 tabular-nums text-text-muted">{i + 1}</td>
                  <td className="py-1 pr-3">
                    <button type="button" className="cursor-pointer text-left text-gold hover:text-gold-bright" onClick={() => setPlayer(r.userId)}>{r.name}</button>
                    {r.clanTag && <span className="text-[11px] text-text-muted"> [{r.clanTag}]</span>}
                  </td>
                  <td className={`py-1 pr-3 text-right font-semibold tabular-nums ${r.points < 0 ? "text-danger" : ""}`} data-points-total>{r.points}</td>
                  <td className="py-1 pr-3 text-right tabular-nums text-text-muted">{r.earned || ""}</td>
                  <td className="py-1 pr-3 text-right tabular-nums text-text-muted">{r.adjusted ? signed(r.adjusted) : ""}</td>
                  <td className="py-1 text-text-muted">{r.lastAt ? day(r.lastAt) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PlayerLines({ poolId, userId, manage, onBack }: { poolId: number; userId: number; manage: boolean; onBack: () => void }) {
  const [data, setData] = useState<PlayerPoints | null>(null);
  const [error, setError] = useState("");
  const [again, setAgain] = useState(0);
  useEffect(() => {
    let live = true;
    rpc<PlayerPoints>("points.player", { poolId, userId })
      .then((r) => live && (setData(r), setError("")))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [poolId, userId, again]);
  return (
    <div className="flex flex-col gap-3" data-points-player={userId}>
      <button type="button" className="btn btn-quiet self-start text-sm" onClick={onBack}>Back to the standings</button>
      {error && <p className="text-danger" role="alert">{error}</p>}
      {data && (
        <section className="panel flex flex-col gap-3 p-5">
          <div className="flex items-baseline gap-3">
            <h2 className="title flex-1 text-gold-bright">{data.player.name}</h2>
            <span className="text-2xl font-semibold tabular-nums" data-points-balance>{data.points}</span>
            <span className="text-text-muted">{data.pool.settings.name}</span>
          </div>
          {manage && <AdjustForm poolId={poolId} userId={userId} name={data.pool.settings.name} onDone={() => setAgain((n) => n + 1)} />}
          {data.entries.length === 0 ? (
            <p className="text-text-muted">Nothing yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line" data-points-lines>
              {data.entries.map((e) => (
                <li key={e.id} className="flex items-baseline gap-3 py-1.5">
                  <span className={`w-16 text-right font-semibold tabular-nums ${e.amount < 0 ? "text-danger" : "text-net-party"}`}>{signed(e.amount)}</span>
                  <span className="flex-1">
                    {e.kind === "earned" ? (e.label ?? t("An operation")) : e.reason}
                    {e.kind === "adjust" && <span className="text-xs text-text-muted"> · by hand</span>}
                  </span>
                  <span className="text-xs text-text-muted">{e.by ? `${e.by}, ` : ""}{day(e.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function AdjustForm({ poolId, userId, name, onDone }: { poolId: number; userId: number; name: string; onDone: () => void }) {
  const act = useAct();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const send = () =>
    void act.run(() => rpc("points.adjust", { poolId, userId, amount: Math.trunc(Number(amount)), reason })).then((ok) => {
      if (ok) {
        setAmount("");
        setReason("");
        onDone();
      }
    });
  return (
    <form className="flex flex-wrap items-center gap-2 border-y border-line py-2" onSubmit={(e) => (e.preventDefault(), send())} data-points-adjust>
      <span className="text-text-muted">Give or take</span>
      <input className="field w-24" type="number" placeholder="+10 or -10" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={`${name} to give (negative to take)`} />
      <input className="field min-w-0 flex-1" maxLength={120} placeholder="Why (the player sees this)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" />
      <button type="submit" className="btn text-sm" disabled={act.busy || !amount || Number(amount) === 0 || !reason.trim()}>Add the line</button>
      {act.error && <span className="w-full text-danger" role="alert">{act.error}</span>}
    </form>
  );
}

// ---- An operation's points ----

/** On an ended operation's board, and from the standings: its points in each pool, posted or as a draft to review. */
export function OpPoints({ opId, onPosted }: { opId: number; onPosted?: () => void }) {
  const { tick } = useApp();
  const [data, setData] = useState<OpPointsData | null>(null);
  const [again, setAgain] = useState(0);
  useEffect(() => {
    let live = true;
    rpc<OpPointsData>("points.op", { opId })
      .then((r) => live && setData(r))
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
  }, [opId, tick, again]);
  if (!data || data.pools.length === 0) return null;
  const shown = data.pools.filter((p) => p.posted || p.canPost);
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((p) => (
        <section key={p.pool.id} className="panel flex flex-col gap-3 p-5" data-points-op={p.pool.id}>
          <h2 className="title title-rule text-sm text-gold">
            {poolTitle(p.pool)}
            <Help text={t(POINTS_HELP)} />
          </h2>
          {p.posted ? <Posted p={p} /> : <Draft p={p} op={data.op} onPosted={() => (setAgain((n) => n + 1), onPosted?.())} />}
        </section>
      ))}
    </>
  );
}

function Posted({ p }: { p: OpPool }) {
  const got = p.rows.filter((r) => r.amount);
  return (
    <>
      <p className="text-xs text-text-muted" data-points-posted>
        Posted{p.posted?.by ? ` by ${p.posted.by}` : ""} on {day(p.posted!.at)}. Changes since then are made by hand and show on each player's lines.
      </p>
      {got.length === 0 ? (
        <p className="text-text-muted">Nobody you can see got any.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-x-4 gap-y-1 text-sm">
          {got.map((r) => (
            <li key={r.userId} className="flex gap-2">
              <span className="flex-1 truncate">{r.name}</span>
              <span className={`tabular-nums ${r.amount! < 0 ? "text-danger" : ""}`} data-points-got={r.userId}>{signed(r.amount!)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Draft({ p, op, onPosted }: { p: OpPool; op: OpPointsData["op"]; onPosted: () => void }) {
  const act = useAct();
  const [amounts, setAmounts] = useState<Record<number, string>>(() => Object.fromEntries(p.rows.map((r) => [r.userId, String(r.suggested.amount)])));
  const [extra, setExtra] = useState("");
  const [sure, setSure] = useState(false);
  const value = (id: number) => Math.trunc(Number(amounts[id]) || 0);
  const total = p.rows.reduce((t, r) => t + value(r.userId), 0);
  const players = p.rows.filter((r) => value(r.userId) !== 0).length;
  const name = p.pool.settings.name;
  const addToAll = () => {
    const n = Math.trunc(Number(extra) || 0);
    if (!n) return;
    setAmounts((a) => Object.fromEntries(p.rows.map((r) => [r.userId, String(r.seconds > 0 ? value(r.userId) + n : value(r.userId))])));
    setExtra("");
  };
  const post = () =>
    void act.run(() => rpc("points.post", { poolId: p.pool.id, opId: op.id, rows: p.rows.map((r) => ({ userId: r.userId, amount: value(r.userId) })) })).then((ok) => ok && onPosted());
  const why = (s: Suggested) => [s.earned ? `${s.earned} earned` : "", s.bonus ? `+${s.bonus} came as said` : "", s.noShow ? `${s.noShow} did not show` : ""].filter(Boolean).join(", ");
  return (
    <div className="flex flex-col gap-3" data-points-draft>
      <p className="text-sm text-text-muted">
        {t(`A draft from who was in voice: the operation ran ${dur(op.seconds)}. Change any amount, then post. Nothing is added until you do, and it is posted once.`)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-text-muted">Add to everyone who was in voice</span>
        <input className="field w-20" type="number" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="+5" aria-label="Add to everyone who was in voice" data-points-extra />
        <button type="button" className="btn btn-quiet text-sm" disabled={!Number(extra)} onClick={addToAll}>Add</button>
        <span className="text-xs text-text-muted">For a boss kill or a won siege.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-text-muted">
              <th className="py-1 pr-3 font-normal">Player</th>
              <th className="py-1 pr-3 text-right font-normal">In voice</th>
              <th className="py-1 pr-3 font-normal">Said</th>
              <th className="py-1 pr-3 font-normal">Suggested</th>
              <th className="py-1 text-right font-normal">{name}</th>
            </tr>
          </thead>
          <tbody>
            {p.rows.map((r) => (
              <tr key={r.userId} className="border-t border-line" data-points-draft-row={r.userId}>
                <td className="py-1 pr-3">{r.name}{r.clanTag && <span className="text-[11px] text-text-muted"> [{r.clanTag}]</span>}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-text-muted">{r.seconds > 0 ? dur(r.seconds) : "Not in voice"}</td>
                <td className="py-1 pr-3 text-text-muted">{r.signup === "coming" ? "Coming" : r.signup === "out" ? "Can't come" : ""}</td>
                <td className="py-1 pr-3 text-xs text-text-muted">{why(r.suggested) || "0"}</td>
                <td className="py-1 text-right">
                  <input className="field w-20 text-right tabular-nums" type="number" value={amounts[r.userId] ?? ""} onChange={(e) => setAmounts((x) => ({ ...x, [r.userId]: e.target.value }))} aria-label={`${name} for ${r.name}`} data-points-amount={r.userId} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {!sure ? (
          <button type="button" className="btn" disabled={act.busy} onClick={() => setSure(true)} data-points-post>{`Post ${name}`}</button>
        ) : (
          <Fragment>
            <span>{`${players} ${players === 1 ? "player" : "players"}, ${total} ${name} in all. Post them?`}</span>
            <button type="button" className="btn" disabled={act.busy} onClick={post} data-points-confirm>Post</button>
            <button type="button" className="btn btn-quiet" disabled={act.busy} onClick={() => setSure(false)}>Not yet</button>
          </Fragment>
        )}
        {act.error && <span className="text-danger" role="alert">{act.error}</span>}
      </div>
    </div>
  );
}
