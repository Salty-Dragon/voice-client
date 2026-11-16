// The roster board. Dragging a card, or selecting it and choosing a
// destination, moves the player; the roster is the routing table, so this is
// also what re-routes their audio. Permissions here only decide what is
// offered: the server checks every move again.

import { useState } from "react";
import { rpc, type OpDetail, type Party, type Person } from "../api";
import { ConfirmButton, useAct, useApp, useLoad } from "./app-context";
import { when } from "./RosterView";
import { tip } from "./tips";

const PARTY_SIZE = 9;
const STATE_LABEL = { live: "Live", planned: "Planned", ended: "Ended" } as const;
const STATE_CLASS = { live: "text-net-party", planned: "text-gold", ended: "text-text-muted" } as const;

export function Board({ opId, onBack }: { opId: number; onBack: () => void }) {
  const { info, set, select, refreshInfo } = useApp();
  const me = info.user.id;
  // Other organisers edit the same board, so reload often as well as on every change notice.
  const { data, error, reload } = useLoad(() => rpc<OpDetail>("op.get", { opId }), [opId], 5000);
  const act = useAct();
  const [selected, setSelected] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | "reserve" | null>(null);

  if (error && !data) {
    return (
      <div className="p-4 flex flex-col gap-3">
        <p className="text-danger">{error}</p>
        <div><button type="button" className="btn btn-quiet" onClick={onBack}>Back to operations</button></div>
      </div>
    );
  }
  if (!data) return <p className="p-4 text-text-muted">Loading…</p>;

  const { op, perms, canRunOp } = data;
  const open = op.state !== "ended";
  const online = new Set(data.onlineIds);
  const person = new Map(op.people.map((p) => [p.userId, p]));
  const partyOf = (userId: number) => op.parties.find((p) => p.memberIds.includes(userId)) ?? null;

  const run = (method: string, params: Record<string, unknown>) => {
    void act.run(() => rpc(method, { opId, ...params })).then(() => {
      reload();
      refreshInfo();
    });
  };

  const overOwnClan = (p: Person) => p.clanId !== null && perms.leadClanIds.includes(p.clanId);
  /** May the viewer place this player in any party? */
  const canPlace = (p: Person) => open && (perms.isOrganiser || overOwnClan(p));
  /** May the viewer at least send this player to Reserve? */
  const canKick = (p: Person) => open && (canPlace(p) || partyOf(p.userId)?.leaderId === me);
  const canLead = (p: Person, party: Party) => open && (perms.isOrganiser || overOwnClan(p) || party.leaderId === me);

  const move = (userId: number, partyId: number | null) => {
    if ((partyOf(userId)?.id ?? null) === partyId) return;
    run("op.move", { userId, partyId });
    setSelected(null);
  };
  const drop = (target: number | null) => (e: React.DragEvent) => {
    e.preventDefault();
    setOver(null);
    const p = dragging === null ? undefined : person.get(dragging);
    setDragging(null);
    if (p && (target === null ? canKick(p) : canPlace(p))) move(p.userId, target);
  };
  const allow = (target: number | "reserve") => (e: React.DragEvent) => {
    if (dragging === null) return;
    e.preventDefault();
    setOver(target);
  };

  // Asking to join: for players who cannot simply place themselves.
  const self = person.get(me);
  const canAsk = open && !!self && !canPlace(self);
  const myRequest = op.requests.find((r) => r.userId === me)?.partyId ?? null;
  const canAnswer = (party: Party, p: Person) => open && (party.leaderId === me || perms.isOrganiser || overOwnClan(p));

  const sel = selected === null ? undefined : person.get(selected);
  const selParty = sel ? partyOf(sel.userId) : null;

  // A plain render function, not a component: a component defined here would
  // be remounted on every state change, which cancels a drag in progress.
  const card = (p: Person, party: Party | null) => {
    const draggable = canKick(p);
    return (
      <li
        key={p.userId}
        draggable={draggable}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(p.userId));
          setDragging(p.userId);
        }}
        onDragEnd={() => {
          setDragging(null);
          setOver(null);
        }}
      >
        <button
          type="button"
          aria-pressed={selected === p.userId}
          onClick={() => setSelected(selected === p.userId ? null : p.userId)}
          className={`flex w-full items-center gap-2 rounded-sm border px-2 py-1 text-left transition-colors duration-150 ${
            selected === p.userId ? "border-gold-bright bg-bg-2" : "border-line bg-bg-2/60 hover:border-gold-dim"
          } ${draggable ? "cursor-grab" : "cursor-default"}`}
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${online.has(p.userId) ? "bg-net-party" : "bg-line"}`} {...tip(online.has(p.userId) ? "App open" : "Offline")} />
          <span className={`truncate font-medium ${p.userId === me ? "text-gold-bright" : ""}`}>{p.name}</span>
          {p.classTag && <span className="text-xs text-gold">{p.classTag}</span>}
          <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-text-muted">
            {op.eventLeaderId === p.userId && <span {...tip("Event leader: speaks on Broadcast and Command, starts and ends the operation")} className="text-net-broadcast">♛ Lead</span>}
            {op.deputyIds.includes(p.userId) && <span {...tip("Deputy: speaks on Broadcast and Command, can move anyone")} className="text-net-broadcast">Deputy</span>}
            {p.clanRole === "leader" && <span {...tip("Clan leader: speaks on Clan and Command")} className="text-net-clan">⚑ Clan</span>}
            {p.clanRole === "officer" && <span {...tip("Clan officer: speaks on Clan")} className="text-net-clan">Officer</span>}
            {party?.leaderId === p.userId && <span {...tip("Party leader: on Command for this party")} className="text-net-command">» PL</span>}
            {op.clans.length > 1 && p.clanTag && <span>[{p.clanTag}]</span>}
          </span>
        </button>
      </li>
    );
  };

  const here = set?.operation?.id === op.id;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" className="btn btn-quiet text-sm" onClick={onBack}>← Operations</button>
        <h1 className="title text-gold-bright">{op.name}</h1>
        <span className={`text-xs uppercase tracking-wider ${STATE_CLASS[op.state]}`}>{STATE_LABEL[op.state]}</span>
        <span className="text-text-muted">{when(op.startsAt)}</span>
        <span className="text-text-muted">{op.clans.map((c) => c.name).join(", ")} · {op.people.length} players · {op.people.filter((p) => online.has(p.userId)).length} online</span>
        {open && !here && (
          <button type="button" className="btn text-sm ml-auto" onClick={() => select(op.id)} {...tip("Connect your voice to this operation now, before it goes live")}>
            Join voice
          </button>
        )}
        {here && <span className="ml-auto text-xs text-net-party" {...tip("You are connected to this operation's nets")}>Your voice is here</span>}
      </div>

      {/* Operation controls */}
      <div className="panel flex flex-wrap items-center gap-x-6 gap-y-3 p-3">
        <span>
          <span className="text-text-muted">Event leader </span>
          <span className="font-medium">{person.get(op.eventLeaderId)?.name ?? "?"}</span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-text-muted">Deputies</span>
          {op.deputyIds.length === 0 && <span className="text-text-muted">none</span>}
          {op.deputyIds.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-sm border border-line px-2 py-0.5">
              {person.get(id)?.name ?? "?"}
              {canRunOp && open && (
                <button type="button" className="text-text-muted hover:text-danger cursor-pointer" aria-label={`Remove deputy ${person.get(id)?.name ?? ""}`} onClick={() => run("op.setDeputy", { userId: id, on: false })}>
                  ×
                </button>
              )}
            </span>
          ))}
        </span>
        {canRunOp && open && (
          <span className="ml-auto flex gap-2">
            {op.state === "planned" && (
              <span {...tip("Moves every player from their lounge into their party and nets")}>
                <ConfirmButton className="btn text-sm" confirm="Go live now?" onConfirm={() => run("op.setState", { state: "live" })}>Start operation</ConfirmButton>
              </span>
            )}
            <span {...tip("Returns everyone to their lounge and locks this roster")}>
              <ConfirmButton confirm="End for everyone?" onConfirm={() => run("op.setState", { state: "ended" })}>End operation</ConfirmButton>
            </span>
          </span>
        )}
      </div>
      {op.state === "planned" && (
        <p className="text-xs text-text-muted -mt-2">
          Players stay in their lounge until you start the operation; starting it pulls everyone into their party automatically.
        </p>
      )}

      {/* Selected player: the keyboard and touch way to do what dragging does */}
      <div className="panel flex min-h-12 flex-wrap items-center gap-3 px-3 py-2" aria-live="polite">
        {!sel ? (
          <span className="text-text-muted">
            {perms.canEditParties
              ? "Drag a player to a party, or select one to move them."
              : canAsk
                ? "Ask to join a party; its leader accepts or declines."
                : "Select a player to see their options."}
          </span>
        ) : (
          <>
            <span>
              <span className="font-medium">{sel.name}</span>
              <span className="text-text-muted"> · {selParty ? selParty.name : "Reserve"}</span>
            </span>
            {canKick(sel) && (
              <select
                className="field w-auto"
                value=""
                aria-label={`Move ${sel.name} to`}
                onChange={(e) => move(sel.userId, e.target.value === "reserve" ? null : Number(e.target.value))}
              >
                <option value="" disabled>Move to…</option>
                {canPlace(sel) &&
                  op.parties.filter((p) => p.id !== selParty?.id).map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.memberIds.length})</option>
                  ))}
                {selParty && <option value="reserve">Reserve</option>}
              </select>
            )}
            {selParty && selParty.leaderId !== sel.userId && canLead(sel, selParty) && (
              <button type="button" className="btn btn-quiet text-sm" onClick={() => run("party.setLeader", { partyId: selParty.id, userId: sel.userId })} {...tip("Party leaders are on Command and answer join requests")}>
                Make party leader
              </button>
            )}
            {canRunOp && open && sel.userId !== op.eventLeaderId && !op.deputyIds.includes(sel.userId) && (
              <button type="button" className="btn btn-quiet text-sm" onClick={() => run("op.setDeputy", { userId: sel.userId, on: true })} {...tip("Deputies speak on Broadcast and Command and can move anyone")}>
                Make deputy
              </button>
            )}
            <button type="button" className="ml-auto text-text-muted hover:text-text cursor-pointer" onClick={() => setSelected(null)}>Clear</button>
          </>
        )}
        {act.busy && <span className="text-text-muted">Saving…</span>}
        {act.error && <span className="text-danger" role="alert">{act.error}</span>}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {op.parties.map((party) => (
            <PartyBlock
              key={party.id}
              party={party}
              highlight={over === party.id}
              canEdit={perms.canEditParties}
              canRename={perms.canEditParties || (open && party.leaderId === me)}
              onDragOver={allow(party.id)}
              onDragLeave={() => setOver(null)}
              onDrop={drop(party.id)}
              onRename={(name) => run("party.rename", { partyId: party.id, name })}
              onDelete={() => run("party.delete", { partyId: party.id })}
              footer={
                <>
                  {op.requests
                    .filter((r) => r.partyId === party.id)
                    .map((r) => {
                      const p = person.get(r.userId);
                      if (!p) return null;
                      return (
                        <div key={r.userId} className="flex flex-wrap items-center gap-2 rounded-sm border border-dashed border-gold-dim px-2 py-1">
                          <span className="truncate">
                            <span className="font-medium">{p.name}</span>
                            {p.classTag && <span className="ml-1 text-xs text-gold">{p.classTag}</span>}
                            <span className="text-text-muted"> asks to join</span>
                          </span>
                          {canAnswer(party, p) ? (
                            <span className="ml-auto flex gap-1">
                              <button type="button" className="btn text-xs px-2 py-0.5" onClick={() => run("party.answerJoin", { partyId: party.id, userId: p.userId, accept: true })}>Accept</button>
                              <button type="button" className="btn btn-quiet text-xs px-2 py-0.5" onClick={() => run("party.answerJoin", { partyId: party.id, userId: p.userId, accept: false })}>Decline</button>
                            </span>
                          ) : (
                            p.userId === me && (
                              <button type="button" className="ml-auto text-xs text-text-muted hover:text-danger cursor-pointer" onClick={() => run("party.cancelJoin", {})}>Cancel</button>
                            )
                          )}
                        </div>
                      );
                    })}
                  {canAsk && !party.memberIds.includes(me) && myRequest !== party.id && (
                    <button type="button" className="btn btn-quiet text-xs self-start px-2 py-0.5" onClick={() => run("party.requestJoin", { partyId: party.id })} {...tip("The party's leader gets your request and accepts or declines")}>
                      Ask to join
                    </button>
                  )}
                </>
              }
            >
              {party.memberIds.map((id) => {
                const p = person.get(id);
                return p ? card(p, party) : null;
              })}
            </PartyBlock>
          ))}
          {perms.canEditParties && (
            <button
              type="button"
              onClick={() => run("party.create", { name: "" })}
              {...tip("Add an empty party. The first player placed in it leads it.")}
              className="min-h-24 rounded-sm border border-dashed border-gold-dim text-gold hover:border-gold hover:text-gold-bright cursor-pointer transition-colors duration-150"
            >
              + New party
            </button>
          )}
          {op.parties.length === 0 && !perms.canEditParties && <p className="text-text-muted">No parties have been formed yet.</p>}
        </div>

        <div
          onDragOver={allow("reserve")}
          onDragLeave={() => setOver(null)}
          onDrop={drop(null)}
          className={`panel flex w-full flex-col gap-3 p-3 lg:w-72 ${over === "reserve" ? "border-gold-bright" : ""}`}
        >
          <h2 className="title flex items-baseline justify-between text-sm text-net-reserve" {...tip("Everyone taking part who is not in a party. They can talk to each other and to the organisers.")}>
            Reserve <span className="font-sans tabular-nums">{op.reserveIds.length}</span>
          </h2>
          {op.reserveIds.length === 0 ? (
            <p className="text-text-muted">Everyone has a party.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {op.reserveIds.map((id) => {
                const p = person.get(id);
                return p ? card(p, null) : null;
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function PartyBlock({
  party,
  children,
  highlight,
  canEdit,
  canRename,
  onRename,
  onDelete,
  footer,
  ...dnd
}: {
  party: Party;
  children: React.ReactNode;
  highlight: boolean;
  canEdit: boolean;
  canRename: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
  /** Join requests and the ask-to-join button. */
  footer?: React.ReactNode;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const [editing, setEditing] = useState(false);
  const count = party.memberIds.length;
  return (
    <div {...dnd} className={`panel flex flex-col gap-2 p-3 ${highlight ? "border-gold-bright" : ""}`}>
      <div className="flex items-baseline gap-2">
        {editing ? (
          <form
            className="flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
              setEditing(false);
              if (name && name !== party.name) onRename(name);
            }}
          >
            <input name="name" defaultValue={party.name} maxLength={48} autoFocus onBlur={() => setEditing(false)} className="field py-0.5" aria-label="Party name" />
          </form>
        ) : (
          <h2 className="title flex-1 truncate text-sm text-net-party">
            {canRename ? (
              <button type="button" className="title cursor-text hover:text-gold-bright" {...tip("Click to rename")} onClick={() => setEditing(true)}>{party.name}</button>
            ) : (
              party.name
            )}
          </h2>
        )}
        <span className={`tabular-nums ${count > PARTY_SIZE ? "text-danger" : "text-text-muted"}`} {...tip(`Usual party size is ${PARTY_SIZE}. Going over is allowed.`)}>{count}/{PARTY_SIZE}</span>
      </div>
      {count > PARTY_SIZE && <p className="text-xs text-danger">Over the usual party size of {PARTY_SIZE}.</p>}
      {count === 0 ? <p className="py-3 text-center text-text-muted">Empty</p> : <ul className="flex flex-col gap-1">{children}</ul>}
      {footer}
      {canEdit && (
        <div className="flex justify-end">
          <ConfirmButton className="text-xs text-text-muted hover:text-danger cursor-pointer" confirm="Delete party?" onConfirm={onDelete}>Delete</ConfirmButton>
        </div>
      )}
    </div>
  );
}
