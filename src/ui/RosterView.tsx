import { useState } from "react";
import { rpc, type OpOptions, type OpSummary } from "../api";
import { useAct, useApp, useLoad } from "./app-context";
import { Board } from "./Board";

const STATE_LABEL = { live: "Live", planned: "Planned", ended: "Ended" } as const;
const STATE_CLASS = { live: "text-net-party", planned: "text-gold", ended: "text-text-muted" } as const;

export function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "No start time";
}

function NewOperation({ onCreated }: { onCreated: (id: number) => void }) {
  const { info } = useApp();
  const { data } = useLoad(() => rpc<OpOptions>("op.options"), [], 60_000);
  const [name, setName] = useState("");
  const [starts, setStarts] = useState("");
  const [leader, setLeader] = useState(info.user.id);
  const [picked, setPicked] = useState<number[] | null>(null);
  const act = useAct();
  if (!data) return null;
  if (data.clans.length === 0) return <p className="text-text-muted">Create a clan on the admin panel first.</p>;
  const clanIds = picked ?? (data.clans.length === 1 ? [data.clans[0].id] : []);

  return (
    <form
      className="flex flex-col gap-3 max-w-xl"
      onSubmit={async (e) => {
        e.preventDefault();
        let id = 0;
        const ok = await act.run(async () => {
          const startsAt = starts ? new Date(starts).toISOString() : null;
          id = (await rpc<{ id: number }>("op.create", { name, startsAt, eventLeaderId: leader, clanIds })).id;
        });
        if (ok) onCreated(id);
      }}
    >
      <label className="flex flex-col gap-1 text-text-muted">
        Name
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Aden siege" required />
      </label>
      <label className="flex flex-col gap-1 text-text-muted">
        Starts (your local time, optional)
        <input type="datetime-local" className="field" value={starts} onChange={(e) => setStarts(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-text-muted">
        Event leader
        <select className="field" value={leader} onChange={(e) => setLeader(Number(e.target.value))}>
          {data.users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}{u.clanTag ? ` [${u.clanTag}]` : ""}</option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-text-muted mb-1">Clans taking part</legend>
        {data.clans.map((c) => (
          <label key={c.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={clanIds.includes(c.id)}
              onChange={(e) => setPicked(e.target.checked ? [...clanIds, c.id] : clanIds.filter((x) => x !== c.id))}
            />{" "}
            {c.name} [{c.tag}]
          </label>
        ))}
      </fieldset>
      <div className="flex items-center gap-3">
        <button className="btn" disabled={act.busy || !name.trim() || clanIds.length === 0}>Create operation</button>
        {act.error && <span className="text-danger" role="alert">{act.error}</span>}
      </div>
    </form>
  );
}

export function RosterView() {
  const { info, boardOp, go, set } = useApp();
  const { data: ops, error, reload } = useLoad(() => rpc<OpSummary[]>("ops.list"), []);
  const [creating, setCreating] = useState(false);

  if (boardOp !== null) return <Board opId={boardOp} onBack={() => go("roster")} />;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <section className="panel p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="title text-sm text-gold">Operations</h2>
          {info.user.isAdmin && !creating && (
            <button type="button" className="btn text-sm" onClick={() => setCreating(true)}>New operation</button>
          )}
        </div>
        {error && <p className="text-danger">{error}</p>}
        {ops && ops.length === 0 && (
          <p className="text-text-muted">
            {info.membership?.status === "active" || info.user.isAdmin
              ? "No operations yet. Until one starts, you are in the lounge."
              : "You will see your clan's operations here once you have been approved."}
          </p>
        )}
        <ul className="flex flex-col divide-y divide-line">
          {ops?.map((o) => (
            <li key={o.id}>
              <button type="button" className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 py-2 text-left cursor-pointer hover:bg-bg-2/60" onClick={() => go("roster", o.id)}>
                <span className="font-medium text-gold-bright">{o.name}</span>
                <span className={`text-xs uppercase tracking-wider ${STATE_CLASS[o.state]}`}>{STATE_LABEL[o.state]}</span>
                {set?.operation?.id === o.id && <span className="text-xs text-text-muted">you are here</span>}
                <span className="text-text-muted">{when(o.startsAt)}</span>
                <span className="text-text-muted ml-auto">Led by {o.leaderName}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {creating && (
        <section className="panel p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="title text-sm text-gold">New operation</h2>
            <button type="button" className="btn btn-quiet text-sm" onClick={() => setCreating(false)}>Cancel</button>
          </div>
          <NewOperation
            onCreated={(id) => {
              setCreating(false);
              reload();
              go("roster", id);
            }}
          />
        </section>
      )}
    </div>
  );
}
