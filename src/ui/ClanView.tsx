import { useRef, useState } from "react";
import { rpc, type ClanMember, type ClanSummary, type ClanView as ClanData, type Cp, type CpList, type Invite } from "../api";
import { clearInviteOutcome, redeemInvite, useInviteOutcome } from "../invite";
import { ConfirmButton, useAct, useApp, useLoad } from "./app-context";
import { ClanCrest, Initial } from "./common";
import { Help } from "./tips";
import { AuditLog } from "./AuditLog";

function Section({ title, help, before, children }: { title: string; help?: string; before?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel p-5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {before}
        <h2 className="title title-rule flex-1 text-sm text-gold">
          {title}
          {help && <Help text={help} />}
        </h2>
      </div>
      {children}
    </section>
  );
}

const CREST_SIZE = 128;

/** Fits the picked image into a small square and returns it as base64, ready to send. */
async function shrink(file: File): Promise<string> {
  const image = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = CREST_SIZE;
  const scale = Math.min(CREST_SIZE / image.width, CREST_SIZE / image.height);
  const w = image.width * scale, h = image.height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This device could not prepare the image.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, (CREST_SIZE - w) / 2, (CREST_SIZE - h) / 2, w, h);
  // PNG keeps sharp edges and transparency; a photo that comes out too large goes as WebP instead.
  let url = canvas.toDataURL("image/png");
  if (url.length > 110_000) url = canvas.toDataURL("image/webp", 0.85);
  return url.slice(url.indexOf(",") + 1);
}

/** The clan leader's control for the crest. */
function CrestEditor({ clanId }: { clanId: number }) {
  const { crests } = useApp();
  const act = useAct();
  const input = useRef<HTMLInputElement>(null);
  const has = crests.has(clanId);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-text-muted">Clan crest</span>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        aria-label="Crest image"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          await act.run(async () => {
            let image: string;
            try {
              image = await shrink(file);
            } catch {
              throw new Error("That file is not an image this app can read. Use a PNG, JPEG or WebP.");
            }
            await rpc("clan.setCrest", { clanId, image });
          });
        }}
      />
      <button type="button" className="btn btn-quiet text-sm" disabled={act.busy} onClick={() => input.current?.click()}>
        {act.busy ? "Saving…" : has ? "Change crest" : "Upload crest"}
      </button>
      {has && (
        <ConfirmButton confirm="Remove the crest?" disabled={act.busy} onConfirm={() => void act.run(() => rpc("clan.setCrest", { clanId, image: null }))}>
          Remove
        </ConfirmButton>
      )}
      <Help text={"Your clan's crest is shown beside the clan wherever it appears: its lounge and Clan net, roster boards and the clan lists. Beside your members' names it takes the place of the clan tag. Without a crest, the tag is shown.\nPick any PNG, JPEG or WebP. It is shrunk to a small square, so a simple, bold image reads best. A transparent background works well on the dark screens.\nEveryone in the alliance can see it. Alliance admins can remove a crest."} />
      {act.error && <span className="text-danger" role="alert">{act.error}</span>}
    </div>
  );
}

function JoinAClan() {
  const { refreshInfo } = useApp();
  const { data: clans, error } = useLoad(() => rpc<ClanSummary[]>("clans.list"), []);
  const act = useAct();
  return (
    <Section title="Join your clan">
      <p className="text-text-muted">Pick the clan you are in. Its leader or an officer then approves you, and you get its lounge and its operations.</p>
      {error && <p className="text-danger">{error}</p>}
      {clans && clans.length === 0 && <p className="text-text-muted">No clans have been created yet. An alliance admin does that.</p>}
      <ul className="flex flex-col divide-y divide-line">
        {clans?.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-4 py-2">
            <ClanCrest clanId={c.id} size={24} />
            <span className="font-medium">{c.name}</span>
            <span className="text-text-muted">[{c.tag}]</span>
            <span className="text-text-muted">{c.leaderName ? `Led by ${c.leaderName}` : "No leader yet"} · {c.members} members</span>
            <button
              type="button"
              className="btn text-sm ml-auto"
              disabled={act.busy}
              onClick={async () => {
                await act.run(() => rpc("clan.request", { clanId: c.id }));
                refreshInfo();
              }}
            >
              Request to join
            </button>
          </li>
        ))}
      </ul>
      {act.error && <p className="text-danger" role="alert">{act.error}</p>}
      <PasteInvite />
    </Section>
  );
}

/** For a player who was sent an invite link and has it on their clipboard. */
function PasteInvite() {
  const { refreshInfo } = useApp();
  const act = useAct();
  const [text, setText] = useState("");
  const [done, setDone] = useState("");
  return (
    <form
      className="flex flex-col gap-2 border-t border-line pt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setDone("");
        const ok = await act.run(async () => setDone(await redeemInvite(text)));
        if (ok) {
          setText("");
          refreshInfo();
        }
      }}
    >
      <label className="flex flex-col gap-1 text-text-muted">
        <span className="flex items-center gap-1">
          Have an invite link?
          <Help text={"A clan's leader or officer can send you an invite link. Paste it here (the whole address, or just its code) to join that clan.\nDepending on how the link was made, you are let in at once or added to the clan's waiting list."} />
        </span>
        <span className="flex flex-wrap gap-2">
          <input className="field max-w-md flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the link here" aria-label="Invite link" />
          <button className="btn text-sm" disabled={act.busy || text.trim().length < 8}>Use invite</button>
        </span>
      </label>
      {act.error && <p className="text-danger" role="alert">{act.error}</p>}
      {done && <p className="text-net-party" role="status">{done}</p>}
    </form>
  );
}

const INVITE_HELP = [
  "An invite link brings a player to your clan without them having to find it in the list.",
  "Send it privately, for example in your clan's own Discord channel. Anyone who has the link can use it until it runs out, expires, or you revoke it.",
  "Still needs approval: the player joins your waiting list and you approve them as usual. This is the safe choice.",
  "Lets them straight in: no approval step. Whoever made the link is recorded as having vouched for everyone who uses it. Use it only for a link you hand to people you know.",
].join("\n");

/** The clan leadership's invite links: make one, copy it, revoke it. */
function InviteLinks({ clanId }: { clanId: number }) {
  const { data, error, reload } = useLoad(() => rpc<Invite[]>("clan.invites", { clanId }), [clanId]);
  const act = useAct();
  const [uses, setUses] = useState(10);
  const [days, setDays] = useState(7);
  const [auto, setAuto] = useState(false);
  const [copied, setCopied] = useState("");
  const copy = async (inv: Invite) => {
    try {
      await navigator.clipboard.writeText(inv.link);
      setCopied(inv.code);
      window.setTimeout(() => setCopied(""), 2500);
    } catch {
      setCopied("");
    }
  };
  return (
    <Section title={`Invite links (${data?.length ?? 0})`} help={INVITE_HELP}>
      {error && <p className="text-danger">{error}</p>}
      {data && data.length === 0 && <p className="text-text-muted">No open invite links.</p>}
      <ul className="flex flex-col divide-y divide-line">
        {data?.map((inv) => (
          <li key={inv.code} data-invite={inv.code} className="flex flex-col gap-1 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <input className="field min-w-0 flex-1 select-all text-xs" readOnly value={inv.link} aria-label="Invite link" onFocus={(e) => e.target.select()} />
              <button type="button" className="btn text-sm" onClick={() => void copy(inv)}>{copied === inv.code ? "Copied" : "Copy link"}</button>
              <ConfirmButton confirm="Revoke this link?" disabled={act.busy} onConfirm={() => void act.run(() => rpc("clan.revokeInvite", { code: inv.code })).then(reload)}>
                Revoke
              </ConfirmButton>
            </div>
            <p className="text-xs text-text-muted">
              <span className={inv.autoApprove ? "text-net-command" : ""}>{inv.autoApprove ? "Lets them straight in" : "Still needs approval"}</span>
              {` · used ${inv.uses} of ${inv.maxUses} · until ${new Date(inv.expiresAt).toLocaleDateString(undefined, { dateStyle: "medium" })} · made by ${inv.createdBy}`}
            </p>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-col gap-2 border-t border-line pt-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await act.run(() => rpc("clan.createInvite", { clanId, maxUses: uses, days, autoApprove: auto }));
          reload();
        }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-text-muted">
            Uses
            <input type="number" className="field w-24" min={1} max={500} value={uses} onChange={(e) => setUses(Number(e.target.value))} aria-label="Number of uses" />
          </label>
          <label className="flex flex-col gap-1 text-text-muted">
            Valid for (days)
            <input type="number" className="field w-24" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Days valid" />
          </label>
          <button className="btn text-sm" disabled={act.busy}>Create invite link</button>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Let people who use it straight in, without approval
        </label>
        {auto && <p className="text-xs text-net-command">Anyone who gets hold of this link joins your clan and hears its nets. Share it only with people you know.</p>}
      </form>
      {act.error && <p className="text-danger" role="alert">{act.error}</p>}
    </Section>
  );
}

const PARTY_SIZE = 9;
const CP_HELP = [
  "A constant party is a standing group in your clan: the players who always fight together, in a fixed order, with a leader.",
  "On an operation's roster board it is dropped in with one click as a ready party, so the roster does not have to be rebuilt for every event.",
  "A player is in one constant party at a time: adding them to another moves them.",
  "The clan leader and officers create and delete them. A constant party's own leader can rename it, change its members and hand leadership on.",
  "Changing one here does not change operations it was already added to.",
].join("\n");

/** The clan's constant parties. Everyone in the clan sees them; who may change what is decided per party. */
function ConstantParties({ clanId, members, leads }: { clanId: number; members: ClanMember[]; leads: boolean }) {
  const { info } = useApp();
  const me = info.user.id;
  const { data, error, reload } = useLoad(() => rpc<CpList>("cps.list", { clanId }), [clanId]);
  const act = useAct();
  const [name, setName] = useState("");
  const call = (method: string, params: Record<string, unknown>) => act.run(() => rpc(method, params)).then(reload);
  if (error) return <p className="text-danger">{error}</p>;
  if (!data) return null;
  // Nothing to show a plain member of a clan that has none.
  if (data.cps.length === 0 && !data.canCreate) return null;
  const active = members.filter((m) => m.status === "active");

  return (
    <Section title={`Constant parties (${data.cps.length})`} help={CP_HELP}>
      {data.cps.length === 0 && <p className="text-text-muted">None yet. Create one for each group that always fights together.</p>}
      <ul className="flex flex-col gap-3">
        {data.cps.map((cp) => (
          <CpCard key={cp.id} cp={cp} me={me} canManage={leads || data.canCreate || cp.leaderId === me} canDelete={data.canCreate} clanMembers={active} busy={act.busy} call={call} />
        ))}
      </ul>
      {data.canCreate && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await call("cp.create", { clanId, name });
            setName("");
          }}
        >
          <input className="field w-56" value={name} onChange={(e) => setName(e.target.value)} maxLength={48} placeholder="Name, for example Vanguard" aria-label="New constant party" />
          <button className="btn text-sm" disabled={act.busy || name.trim().length < 2}>Create</button>
        </form>
      )}
      {act.error && <p className="text-danger" role="alert">{act.error}</p>}
    </Section>
  );
}

function CpCard({
  cp,
  me,
  canManage,
  canDelete,
  clanMembers,
  busy,
  call,
}: {
  cp: Cp;
  me: number;
  canManage: boolean;
  canDelete: boolean;
  clanMembers: ClanMember[];
  busy: boolean;
  call: (method: string, params: Record<string, unknown>) => Promise<void>;
}) {
  const [renaming, setRenaming] = useState(false);
  const inside = new Set(cp.members.map((m) => m.userId));
  const mine = inside.has(me);
  const over = cp.members.length > PARTY_SIZE;
  return (
    <li data-cp={cp.id} className={`flex flex-col gap-2 border p-3 ${mine ? "border-gold-dim" : "border-line"}`}>
      <div className="flex flex-wrap items-baseline gap-3">
        {renaming ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const next = String(new FormData(e.currentTarget).get("name") ?? "").trim();
              setRenaming(false);
              if (next && next !== cp.name) await call("cp.rename", { cpId: cp.id, name: next });
            }}
          >
            <input name="name" defaultValue={cp.name} maxLength={48} autoFocus onBlur={() => setRenaming(false)} className="field py-0.5" aria-label="Constant party name" />
          </form>
        ) : (
          <h3 className="title text-sm text-net-party">
            {canManage ? (
              <button type="button" className="title cursor-text hover:text-gold-bright" aria-label={`Rename ${cp.name}`} onClick={() => setRenaming(true)}>{cp.name}</button>
            ) : (
              cp.name
            )}
          </h3>
        )}
        {mine && <span className="text-xs uppercase tracking-wider text-gold">Your constant party</span>}
        <span className={`ml-auto tabular-nums ${over ? "text-danger" : "text-text-muted"}`}>{cp.members.length}/{PARTY_SIZE}</span>
        {canDelete && (
          <ConfirmButton className="text-xs text-text-muted hover:text-danger cursor-pointer" confirm={`Delete ${cp.name}?`} disabled={busy} onConfirm={() => void call("cp.delete", { cpId: cp.id })}>
            Delete
          </ConfirmButton>
        )}
      </div>
      {over && <p className="text-xs text-danger">Over the usual party size of {PARTY_SIZE}.</p>}
      {cp.members.length === 0 ? (
        <p className="text-text-muted">No members yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {cp.members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 py-1.5">
              <Initial name={m.name} />
              <span className={`font-medium ${m.userId === me ? "text-gold-bright" : ""}`}>{m.name}</span>
              {m.classTag && <span className="text-gold">{m.classTag}</span>}
              {m.userId === cp.leaderId && <span className="text-xs uppercase tracking-wider text-net-command">Leader</span>}
              {canManage && (
                <span className="ml-auto flex gap-2">
                  {m.userId !== cp.leaderId && (
                    <button type="button" className="btn btn-quiet text-sm" disabled={busy} onClick={() => void call("cp.setLeader", { cpId: cp.id, userId: m.userId })}>Make leader</button>
                  )}
                  <button type="button" className="btn btn-quiet text-sm" disabled={busy} onClick={() => void call("cp.setMember", { cpId: cp.id, userId: m.userId, member: false })}>Take out</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <select
          className="field w-auto self-start text-sm"
          value=""
          disabled={busy}
          aria-label={`Add a member to ${cp.name}`}
          onChange={(e) => e.target.value && void call("cp.setMember", { cpId: cp.id, userId: Number(e.target.value), member: true })}
        >
          <option value="">Add a member…</option>
          {clanMembers
            .filter((m) => !inside.has(m.userId))
            .map((m) => (
              <option key={m.userId} value={m.userId}>{m.name}</option>
            ))}
        </select>
      )}
    </li>
  );
}

function Members({ clanId }: { clanId: number }) {
  const { info, refreshInfo } = useApp();
  const { data, error, reload } = useLoad(() => rpc<ClanData>("clan.get", { clanId }), [clanId]);
  const act = useAct();
  if (error) return <p className="text-danger">{error}</p>;
  if (!data) return <p className="text-text-muted">Loading…</p>;

  const online = new Set(data.onlineIds);
  const pending = data.members.filter((m) => m.status === "pending");
  const active = data.members.filter((m) => m.status === "active");
  const leads = data.myRole === "leader" || data.myRole === "officer";
  const call = (method: string, params: Record<string, unknown>) => async () => {
    await act.run(() => rpc(method, { clanId, ...params }));
    reload();
    refreshInfo();
  };

  return (
    <>
      {act.error && <p className="text-danger" role="alert">{act.error}</p>}
      {leads && (
        <Section title={`Waiting for approval (${pending.length})`} help={"Players who picked this clan and are waiting to be let in.\nApprove lets the player into the clan's lounge, its Clan net and its operations. Decline removes the request.\nThe clan leader and officers can do both."}>
          {pending.length === 0 ? (
            <p className="text-text-muted">Nobody is waiting.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {pending.map((m) => (
                <li key={m.userId} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="font-medium">{m.name}</span>
                  {m.classTag && <span className="text-gold">{m.classTag}</span>}
                  <span className="ml-auto flex gap-2">
                    <button type="button" className="btn text-sm" disabled={act.busy} onClick={call("clan.approve", { userId: m.userId })}>Approve</button>
                    <ConfirmButton confirm="Decline?" disabled={act.busy} onConfirm={call("clan.remove", { userId: m.userId })}>Decline</ConfirmButton>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-text-muted">Approve only names you recognise from the clan in game.</p>
        </Section>
      )}
      <Section
        title={`${data.clan.name} [${data.clan.tag}] · ${active.length} members`}
        before={<ClanCrest clanId={clanId} size={40} />}
        help={"Green dot: the player has the app open.\nLeader: speaks on Clan and Command, approves members and appoints officers.\nOfficer: approves and removes members, builds parties, and speaks on the Clan net.\nMembers hear the Clan net and talk in the lounge and in their party."}
      >
        {data.myRole === "leader" && <CrestEditor clanId={clanId} />}
        <ul className="flex flex-col divide-y divide-line">
          {active.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 py-2">
              <span
                className={`h-2 w-2 rounded-full ${online.has(m.userId) ? "bg-net-party" : "bg-line"}`}
                role="img"
                aria-label={online.has(m.userId) ? "App open" : "Offline"}
              />
              <Initial name={m.name} />
              <span className={`font-medium ${m.userId === info.user.id ? "text-gold-bright" : ""}`}>{m.name}</span>
              {m.classTag && <span className="text-gold">{m.classTag}</span>}
              {m.role !== "member" && (
                <span className="text-xs uppercase tracking-wider text-net-clan">
                  {m.role}
                </span>
              )}
              <span className="ml-auto flex gap-2">
                {data.myRole === "leader" && m.role === "member" && (
                  <button type="button" className="btn btn-quiet text-sm" disabled={act.busy} onClick={call("clan.setOfficer", { userId: m.userId, officer: true })}>Make officer</button>
                )}
                {data.myRole === "leader" && m.role === "officer" && (
                  <button type="button" className="btn btn-quiet text-sm" disabled={act.busy} onClick={call("clan.setOfficer", { userId: m.userId, officer: false })}>Remove officer</button>
                )}
                {leads && m.role !== "leader" && (m.role === "member" || data.myRole === "leader") && m.userId !== info.user.id && (
                  <ConfirmButton confirm={`Remove ${m.name}?`} disabled={act.busy} onConfirm={call("clan.remove", { userId: m.userId })}>Remove</ConfirmButton>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Section>
      {leads && <InviteLinks clanId={clanId} />}
      <ConstantParties clanId={clanId} members={data.members} leads={leads} />
      {data.myRole === "leader" && (
        <AuditLog
          scope="clan"
          clanId={clanId}
          title="Clan log"
          help={"Who changed what in your clan, newest first: requests, approvals and removals, officers, invite links, constant parties, and what was done to your members in operations.\nOnly the clan's leader sees this. Alliance admins see the whole alliance's log.\nAn account that has since been deleted shows as a deleted account."}
        />
      )}
    </>
  );
}

export function ClanView() {
  const { info, refreshInfo } = useApp();
  const act = useAct();
  const invited = useInviteOutcome();
  const m = info.membership;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      {invited && (
        <div className={`panel flex flex-wrap items-center gap-3 px-4 py-3 ${invited.ok ? "border-net-party" : "border-danger"}`} role={invited.ok ? "status" : "alert"}>
          <span className="flex-1">{invited.text}</span>
          <button type="button" className="btn btn-quiet text-sm" onClick={clearInviteOutcome}>OK</button>
        </div>
      )}
      {!m && <JoinAClan />}
      {m?.status === "pending" && (
        <Section title="Waiting for approval">
          <p>
            A leader or officer of <span className="font-medium">{m.name}</span> has to approve you. This screen updates by itself when they do.
          </p>
          <div>
            <ConfirmButton
              confirm="Withdraw request?"
              disabled={act.busy}
              onConfirm={async () => {
                await act.run(() => rpc("clan.withdraw"));
                refreshInfo();
              }}
            >
              Withdraw
            </ConfirmButton>
          </div>
        </Section>
      )}
      {m?.status === "active" && <Members clanId={m.clanId} />}
    </div>
  );
}
