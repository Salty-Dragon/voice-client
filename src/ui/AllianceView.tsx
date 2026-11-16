// For alliance admins and the app admin: the clans, who leads them, and bans.
// Appointing alliance admins and the alliance lounge switch stay on the site's
// admin panel, with the app admin.

import { useState } from "react";
import { rpc, type AllianceView as AllianceData } from "../api";
import { ConfirmButton, useAct, useApp, useLoad } from "./app-context";
import { tip } from "./tips";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel p-5 flex flex-col gap-3">
      <h2 className="title title-rule text-sm text-gold">{title}</h2>
      {children}
    </section>
  );
}

export function AllianceView() {
  const { info } = useApp();
  const { data, error, reload } = useLoad(() => rpc<AllianceData>("alliance.get"), []);
  const act = useAct();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [filter, setFilter] = useState("");

  if (error && !data) return <p className="p-4 text-danger">{error}</p>;
  if (!data) return <p className="p-4 text-text-muted">Loading…</p>;

  const call = (method: string, params: Record<string, unknown>) => act.run(() => rpc(method, params)).then(reload);
  const eligible = data.users.filter((u) => !u.banned);
  const shown = data.users.filter((u) => u.name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      {act.error && <p className="text-danger" role="alert">{act.error}</p>}

      <Section title="Clans">
        {data.clans.length === 0 && <p className="text-text-muted">No clans yet. Create the first one below, then appoint its leader.</p>}
        <ul className="flex flex-col divide-y divide-line">
          {data.clans.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
              <span className="font-medium text-gold-bright">{c.name}</span>
              <span className="text-text-muted">[{c.tag}]</span>
              <span className="text-text-muted">{c.leaderName ? `Led by ${c.leaderName}` : "No leader yet"} · {c.members} members</span>
              <select
                className="field ml-auto w-auto"
                value=""
                disabled={act.busy}
                aria-label={`Leader of ${c.name}`}
                {...tip("The leader approves members and appoints officers. The previous leader becomes an ordinary member.")}
                onChange={(e) => void call("alliance.appointLeader", { clanId: c.id, userId: Number(e.target.value) })}
              >
                <option value="" disabled>{c.leaderName ? "Change leader…" : "Appoint leader…"}</option>
                {eligible.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}{u.clanTag ? ` [${u.clanTag}]` : ""}</option>
                ))}
              </select>
            </li>
          ))}
        </ul>
        <form
          className="flex flex-wrap items-end gap-3 border-t border-line pt-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act.run(() => rpc("alliance.createClan", { name, tag }))) {
              setName("");
              setTag("");
            }
            reload();
          }}
        >
          <label className="flex flex-col gap-1 text-text-muted">
            Clan name
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={48} required />
          </label>
          <label className="flex flex-col gap-1 text-text-muted">
            Tag
            <input className="field w-28" value={tag} onChange={(e) => setTag(e.target.value)} maxLength={8} required />
          </label>
          <button className="btn" disabled={act.busy}>Create clan</button>
        </form>
        <p className="text-xs text-text-muted">The new leader must have signed in once. A player in another clan has to be removed from it first.</p>
      </Section>

      <Section title={`Players (${data.users.length})`}>
        <input className="field max-w-xs" placeholder="Find a player" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find a player" />
        <ul className="flex flex-col divide-y divide-line">
          {shown.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className={u.banned ? "line-through text-text-muted" : "font-medium"}>{u.name}</span>
              {u.clanTag && <span className="text-text-muted">[{u.clanTag}]</span>}
              {u.isAdmin && <span className="text-xs uppercase tracking-wider text-gold-dim" {...tip("Runs this install. Full access.")}>App admin</span>}
              {u.isAllianceAdmin && <span className="text-xs uppercase tracking-wider text-gold-dim" {...tip("Manages clans, clan leaders, operations and bans")}>Alliance admin</span>}
              {u.banned && <span className="text-xs uppercase tracking-wider text-danger">Banned</span>}
              {/* Offered only where the server would allow it; it checks again. */}
              {u.id !== info.user.id && !u.isAdmin && (!u.isAllianceAdmin || info.user.isAdmin) && (
                <span className="ml-auto">
                  {u.banned ? (
                    <button type="button" className="btn btn-quiet text-sm" disabled={act.busy} onClick={() => void call("alliance.setBanned", { userId: u.id, banned: false })}>Lift ban</button>
                  ) : (
                    <ConfirmButton confirm={`Ban ${u.name}?`} disabled={act.busy} onConfirm={() => void call("alliance.setBanned", { userId: u.id, banned: true })}>Ban</ConfirmButton>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-text-muted">A ban signs the player out everywhere and removes them from every room at once. It follows their Discord account.</p>
      </Section>
    </div>
  );
}
