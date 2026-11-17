// For alliance admins and the app admin: the clans, who leads them, and bans.
// Appointing alliance admins and the alliance lounge switch stay on the site's
// admin panel, with the app admin.

import { useState } from "react";
import { rpc, type AllianceView as AllianceData } from "../api";
import { DISCORD_HELP, DiscordSetup } from "./DiscordSetup";
import { GAME_SETUP_HELP, GameSetup } from "./GameSetup";
import { ConfirmButton, useAct, useApp, useLoad } from "./app-context";
import { ClanCrest, ClanMark } from "./common";
import { Help } from "./tips";
import { AuditLog } from "./AuditLog";

function Section({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <section className="panel p-5 flex flex-col gap-3">
      <h2 className="title title-rule text-sm text-gold">
        {title}
        {help && <Help text={help} />}
      </h2>
      {children}
    </section>
  );
}

export function AllianceView() {
  const { info, crests } = useApp();
  const { data, error, reload } = useLoad(() => rpc<AllianceData>("alliance.get"), []);
  const act = useAct();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [filter, setFilter] = useState("");
  /** The clan being renamed, with what has been typed so far. */
  const [renaming, setRenaming] = useState<{ id: number; name: string; tag: string } | null>(null);
  /** A move to another clan that is waiting to be confirmed. */
  const [moving, setMoving] = useState<{ userId: number; clanId: number } | null>(null);

  if (error && !data) return <p className="p-4 text-danger">{error}</p>;
  if (!data) return <p className="p-4 text-text-muted">Loading…</p>;

  const call = (method: string, params: Record<string, unknown>) => act.run(() => rpc(method, params)).then(reload);
  const eligible = data.users.filter((u) => !u.banned);
  const shown = data.users.filter((u) => u.name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      {act.error && <p className="text-danger" role="alert">{act.error}</p>}

      <Section title="Clans" help={"Every player belongs to one clan, and voice follows it: a clan has its own lounge between operations and its own Clan net during them.\nRename changes a clan's name and tag; its members, constant parties, crest and invite links stay. Delete is offered once a clan is empty or has only its leader left.\nCreate the clan here, then appoint its leader. The leader approves members and appoints officers. Appointing a new leader makes the previous one an ordinary member."}>
        {data.clans.length === 0 && <p className="text-text-muted">No clans yet. Create the first one below, then appoint its leader.</p>}
        <ul className="flex flex-col divide-y divide-line">
          {data.clans.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
              <ClanCrest clanId={c.id} size={24} />
              {renaming?.id === c.id ? (
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act.run(() => rpc("alliance.renameClan", { clanId: c.id, name: renaming.name, tag: renaming.tag })).then((ok) => {
                      if (ok) setRenaming(null);
                      reload();
                    });
                  }}
                >
                  <input className="field w-52 py-0.5" value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} maxLength={48} required autoFocus aria-label="New clan name" />
                  <input className="field w-24 py-0.5" value={renaming.tag} onChange={(e) => setRenaming({ ...renaming, tag: e.target.value })} maxLength={8} required aria-label="New tag" />
                  <button className="btn text-sm" disabled={act.busy}>Save</button>
                  <button type="button" className="btn btn-quiet text-sm" onClick={() => setRenaming(null)}>Cancel</button>
                </form>
              ) : (
                <>
                  <span className="font-medium text-gold-bright">{c.name}</span>
                  <span className="text-text-muted">[{c.tag}]</span>
                  <button type="button" className="text-xs text-text-muted hover:text-gold-bright cursor-pointer" aria-label={`Rename ${c.name}`} onClick={() => setRenaming({ id: c.id, name: c.name, tag: c.tag })}>Rename</button>
                  {c.members <= 1 && (
                    <ConfirmButton className="text-xs text-text-muted hover:text-danger cursor-pointer" confirm={`Delete ${c.name} for good?`} disabled={act.busy} onConfirm={() => void call("alliance.deleteClan", { clanId: c.id })}>Delete</ConfirmButton>
                  )}
                </>
              )}
              <span className="text-text-muted">{c.leaderName ? `Led by ${c.leaderName}` : "No leader yet"} · {c.members} members</span>
              {crests.has(c.id) && (
                <ConfirmButton className="ml-auto text-xs text-text-muted hover:text-danger cursor-pointer" confirm="Remove this crest?" disabled={act.busy} onConfirm={() => void call("clan.setCrest", { clanId: c.id, image: null })}>Remove crest</ConfirmButton>
              )}
              <select
                className={`field w-auto ${crests.has(c.id) ? "" : "ml-auto"}`}
                value=""
                disabled={act.busy}
                aria-label={`Leader of ${c.name}`}
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
            <span className="flex items-center gap-1">
              Tag
              <Help text={"A short form of the clan's name: 1 to 8 letters or digits, for example DRG for Dragons.\nIt is shown in brackets beside every member's name in voice and on roster boards, so callers can tell at a glance which clan a player is from. Once the clan's leader uploads a crest, the crest is shown there instead of the tag.\nIn an operation with several clans it also names each clan's own net, for example \"Clan DRG\"."} />
            </span>
            <input className="field w-28" value={tag} onChange={(e) => setTag(e.target.value)} maxLength={8} required />
          </label>
          <button className="btn" disabled={act.busy}>Create clan</button>
        </form>
        <p className="text-xs text-text-muted">The new leader must have signed in once. A player in another clan has to be moved out of it first (Players, below). A clan can be deleted once only its leader is left in it.</p>
      </Section>

      <Section title={`Players (${data.users.length})`} help={"Everyone who has signed in and confirmed a name.\nApp admin: runs this install and has full access.\nAlliance admin: manages clans, clan leaders, operations and bans. The app admin appoints them on the site's admin page.\nMove to clan: puts the player straight into another clan as an approved member, without a request or an invite. Use it for a transfer. In the clan they leave, they lose their constant parties and their party places in operations still to come. A clan's leader has to be replaced before they can be moved.\nA ban signs the player out everywhere, removes them from every room at once, and follows their Discord account."}>
        <input className="field max-w-xs" placeholder="Find a player" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find a player" />
        <ul className="flex flex-col divide-y divide-line">
          {shown.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className={u.banned ? "line-through text-text-muted" : "font-medium"}>{u.name}</span>
              <span className="text-text-muted"><ClanMark clanId={u.clanId} tag={u.clanTag} size={18} /></span>
              {u.isAdmin && <span className="text-xs uppercase tracking-wider text-gold-dim">App admin</span>}
              {u.isAllianceAdmin && <span className="text-xs uppercase tracking-wider text-gold-dim">Alliance admin</span>}
              {u.banned && <span className="text-xs uppercase tracking-wider text-danger">Banned</span>}
              {!u.banned && data.clans.some((c) => c.id !== u.clanId) && (
                <select
                  className="field ml-auto w-auto py-0.5 text-sm"
                  value=""
                  disabled={act.busy}
                  aria-label={`Move ${u.name} to a clan`}
                  onChange={(e) => setMoving({ userId: u.id, clanId: Number(e.target.value) })}
                >
                  <option value="" disabled>{u.clanId === null ? "Put in a clan…" : "Move to clan…"}</option>
                  {data.clans.filter((c) => c.id !== u.clanId).map((c) => (
                    <option key={c.id} value={c.id}>{c.name} [{c.tag}]</option>
                  ))}
                </select>
              )}
              {/* Offered only where the server would allow it; it checks again. */}
              {u.id !== info.user.id && !u.isAdmin && (!u.isAllianceAdmin || info.user.isAdmin) && (
                <span className={!u.banned && data.clans.some((c) => c.id !== u.clanId) ? "" : "ml-auto"}>
                  {u.banned ? (
                    <button type="button" className="btn btn-quiet text-sm" disabled={act.busy} onClick={() => void call("alliance.setBanned", { userId: u.id, banned: false })}>Lift ban</button>
                  ) : (
                    <ConfirmButton confirm={`Ban ${u.name}?`} disabled={act.busy} onConfirm={() => void call("alliance.setBanned", { userId: u.id, banned: true })}>Ban</ConfirmButton>
                  )}
                </span>
              )}
              {moving?.userId === u.id && (
                <span className="flex w-full flex-wrap items-center justify-end gap-2" role="status">
                  <span className="text-gold">Move {u.name} to {data.clans.find((c) => c.id === moving.clanId)?.name}?</span>
                  <button type="button" className="btn text-sm" disabled={act.busy} onClick={() => void call("alliance.moveToClan", { userId: u.id, clanId: moving.clanId }).then(() => setMoving(null))}>Move</button>
                  <button type="button" className="btn btn-quiet text-sm" onClick={() => setMoving(null)}>Cancel</button>
                  {u.clanId !== null && <span className="w-full text-right text-xs text-text-muted">They leave their constant parties and their party places in operations still to come.</span>}
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-text-muted">A ban signs the player out everywhere and removes them from every room at once. It follows their Discord account.</p>
      </Section>

      <Section title="Game setup" help={GAME_SETUP_HELP}>
        <GameSetup />
      </Section>

      {data.discord !== undefined && (
        <Section title="Discord announcements" help={DISCORD_HELP("any operation of the alliance") + "\nEach clan's leader can also set up a channel of their own on the Clan screen, for the operations that clan takes part in."}>
          <DiscordSetup clanId={null} connected={data.discord} onChange={reload} />
        </Section>
      )}

      <AuditLog
        scope="alliance"
        title="Log"
        help={"Who changed what, newest first: clans and their leaders, approvals and removals, invite links, constant parties, operations, every roster move, bans.\nA line that starts with The server is something done automatically, such as promoting a party's next member when its leader dropped out.\nAn account that has since been deleted shows as a deleted account.\nA clan's leader can read the part of this that concerns their own clan, on the Clan tab."}
      />
    </div>
  );
}
