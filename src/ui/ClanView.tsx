import { rpc, type ClanSummary, type ClanView as ClanData } from "../api";
import { ConfirmButton, useAct, useApp, useLoad } from "./app-context";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel p-5 flex flex-col gap-3">
      <h2 className="title text-sm text-gold">{title}</h2>
      {children}
    </section>
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
    </Section>
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
        <Section title={`Waiting for approval (${pending.length})`}>
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
      <Section title={`${data.clan.name} [${data.clan.tag}] · ${active.length} members`}>
        <ul className="flex flex-col divide-y divide-line">
          {active.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 py-2">
              <span
                className={`h-2 w-2 rounded-full ${online.has(m.userId) ? "bg-net-party" : "bg-line"}`}
                title={online.has(m.userId) ? "App open" : "Offline"}
                aria-label={online.has(m.userId) ? "online" : "offline"}
              />
              <span className={`font-medium ${m.userId === info.user.id ? "text-gold-bright" : ""}`}>{m.name}</span>
              {m.classTag && <span className="text-gold">{m.classTag}</span>}
              {m.role !== "member" && <span className="text-xs uppercase tracking-wider text-net-clan">{m.role}</span>}
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
    </>
  );
}

export function ClanView() {
  const { info, refreshInfo } = useApp();
  const act = useAct();
  const m = info.membership;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
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
