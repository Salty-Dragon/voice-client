// Loot (STATUS decision 61): an operation's drops on its board (recorded by
// hand or read from a screenshot, given out, kept, sold, taken back), the loot
// history on the History tab, and the item list with prices. The server
// decides who may do what (its web/lib/loot.ts); these screens offer only that.

import { useEffect, useRef, useState } from "react";
import { rpc } from "../api";
import { t } from "../words";
import { useAct, useApp } from "./app-context";
import { Help } from "./tips";

type DropState = "open" | "given" | "kept" | "sold";
type Drop = {
  id: number;
  operationId: number | null;
  operation: string | null;
  item: string;
  itemId: number | null;
  quantity: number;
  state: DropState;
  recipient: { userId: number; name: string; character: string | null } | null;
  pool: { id: number; name: string } | null;
  cost: number | null;
  method: "price" | "council" | "none" | null;
  note: string | null;
  source: "hand" | "screenshot";
  recordedAt: string;
  givenAt: string | null;
  takenBack: boolean;
};
type Person = { userId: number; name: string; clanTag: string | null; characters: string[] };
type ChargePool = { id: number; name: string; clanTag: string | null; spending: "price" | "council"; prices: Record<number, number> };
type OpLootData = { drops: Drop[]; canRecord: boolean; pools: ChargePool[]; people: Person[]; items: { id: number; name: string }[]; reads: { enabled: boolean; left: number; perMonth: number } };
type ReadRow = { name: string; quantity: number; sure: boolean; itemId: number | null; character: string | null; userId: number | null };
type ReadView = { readId: number; readable: boolean; rows: ReadRow[]; note: string | null; left: number };

// t() where shown.
export const LOOT_HELP = [
  "Record what dropped at an operation, by hand or from a screenshot, and give it out.",
  "From a screenshot: press Print Screen in the game, then paste it here with Ctrl+V (or upload a picture). The drops are read for you and shown as rows to check; fix anything misread, choose who got each item if you know, and confirm. Nothing is added until you do. The picture is not kept.",
  "Giving an item out in a set of points that spends by price takes the cost from the player, with the item's name on their lines. A loot council's set records who got it and why, at no cost. With no set, it is only a record of who got it.",
  "A mistake is put right with Take back: the cost is refunded with a line of its own, and the drop can be given again. Nothing is erased, and everything is in the log.",
].join("\n");

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const qty = (d: { quantity: number; item: string }) => (d.quantity > 1 ? `${d.quantity} × ${d.item}` : d.item);
const personLabel = (p: Person) => `${p.name}${p.clanTag ? ` [${p.clanTag}]` : ""}`;

/**
 * A screenshot made small enough to send (under the site's 1 MB limit), with
 * small text kept sharp: WebP, at most 2000 pixels on the long side, quality
 * lowered and then size lowered only as far as needed.
 */
async function shrink(blob: Blob): Promise<{ data: string; type: "image/webp" | "image/jpeg" | "image/png" }> {
  const bmp = await createImageBitmap(blob);
  let scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  for (let attempt = 0; attempt < 8; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.92, 0.85, 0.75]) {
      const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", quality));
      if (!out) continue;
      const data = await new Promise<string>((res) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1] ?? "");
        r.readAsDataURL(out);
      });
      if (data.length <= 900_000) return { data, type: out.type === "image/webp" ? "image/webp" : out.type === "image/jpeg" ? "image/jpeg" : "image/png" };
    }
    scale *= 0.8;
  }
  throw new Error(t("That picture is too large to read. Try a smaller part of the screen."));
}

// ---- On an operation's board ----

/** The operation's loot, for anyone who can see the board; recording and giving for those allowed. */
export function OpLoot({ opId }: { opId: number }) {
  const { tick } = useApp();
  const [data, setData] = useState<OpLootData | null>(null);
  const [again, setAgain] = useState(0);
  const reload = () => setAgain((n) => n + 1);
  useEffect(() => {
    let live = true;
    rpc<OpLootData>("loot.op", { opId })
      .then((r) => live && setData(r))
      // A server from before loot: nothing to show.
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
  }, [opId, tick, again]);
  if (!data) return null;
  const acts = data.canRecord || data.pools.length > 0;
  if (!acts && data.drops.length === 0) return null;
  return (
    <section className="panel flex flex-col gap-3 p-5" data-loot-op={opId}>
      <h2 className="title title-rule text-sm text-gold">
        Loot
        <Help text={t(LOOT_HELP)} />
      </h2>
      {data.drops.length === 0 ? (
        <p className="text-sm text-text-muted">{t("Nothing recorded for this operation yet.")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line" data-loot-drops>
          {data.drops.map((d) => (
            <DropLine key={d.id} d={d} data={data} onChange={reload} />
          ))}
        </ul>
      )}
      {data.canRecord && <AddDrops opId={opId} data={data} onAdded={reload} />}
    </section>
  );
}

function DropLine({ d, data, onChange }: { d: Drop; data: OpLootData; onChange: () => void }) {
  const act = useAct();
  const [giving, setGiving] = useState(false);
  const mayGive = data.canRecord || data.pools.length > 0;
  const status =
    d.state === "given" && d.recipient
      ? `${d.recipient.name}${d.recipient.character && d.recipient.character !== d.recipient.name ? ` (${d.recipient.character})` : ""}${d.cost !== null && d.pool ? ` · ${d.cost} ${d.pool.name}` : d.method === "council" && d.pool ? ` · ${d.pool.name} council` : ""}`
      : d.state === "kept"
        ? t("Kept for the guild")
        : d.state === "sold"
          ? "Sold"
          : "Not given out";
  return (
    <li className="flex flex-col gap-2 py-2" data-loot-drop={d.id}>
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-medium">{qty(d)}</span>
        {d.source === "screenshot" && <span className="text-[11px] text-text-muted">from a screenshot</span>}
        <span className={`flex-1 text-sm ${d.state === "open" ? "text-gold" : "text-text-muted"}`} data-loot-status>{status}</span>
        {d.note && <span className="text-xs text-text-muted">{d.note}</span>}
        {mayGive && d.state === "open" && !giving && (
          <>
            <button type="button" className="btn text-sm" onClick={() => setGiving(true)} data-loot-give>Give…</button>
            {data.canRecord && (
              <>
                <button type="button" className="btn btn-quiet text-xs" disabled={act.busy} onClick={() => void act.run(() => rpc("loot.setKept", { dropId: d.id, state: "kept" })).then((ok) => ok && onChange())} data-loot-keep>Keep</button>
                <button type="button" className="btn btn-quiet text-xs" disabled={act.busy} onClick={() => void act.run(() => rpc("loot.setKept", { dropId: d.id, state: "sold" })).then((ok) => ok && onChange())} data-loot-sold>Sold</button>
              </>
            )}
          </>
        )}
        {mayGive && d.state !== "open" && (
          <button type="button" className="btn btn-quiet text-xs" disabled={act.busy} onClick={() => void act.run(() => rpc("loot.takeBack", { dropId: d.id })).then((ok) => ok && onChange())} data-loot-takeback>Take back</button>
        )}
      </div>
      {giving && <GiveForm d={d} data={data} onDone={() => (setGiving(false), onChange())} onCancel={() => setGiving(false)} />}
      {act.error && <span className="text-sm text-danger" role="alert">{act.error}</span>}
    </li>
  );
}

function GiveForm({ d, data, onDone, onCancel }: { d: Drop; data: OpLootData; onDone: () => void; onCancel: () => void }) {
  const act = useAct();
  const [userId, setUserId] = useState<number | "">("");
  const [character, setCharacter] = useState("");
  const [poolId, setPoolId] = useState<number | "">(data.pools[0]?.id ?? "");
  const pool = data.pools.find((p) => p.id === poolId);
  const priced = pool?.spending === "price" && d.itemId !== null ? pool.prices[d.itemId] : undefined;
  const [cost, setCost] = useState(priced !== undefined ? String(priced * d.quantity) : "");
  const [note, setNote] = useState("");
  const person = data.people.find((p) => p.userId === userId);
  const pickPool = (id: number | "") => {
    setPoolId(id);
    const p = data.pools.find((x) => x.id === id);
    const price = p?.spending === "price" && d.itemId !== null ? p.prices[d.itemId] : undefined;
    setCost(price !== undefined ? String(price * d.quantity) : "");
  };
  const send = () =>
    void act
      .run(() => rpc("loot.give", { dropId: d.id, userId, character: character || null, poolId: poolId === "" ? null : poolId, cost: pool?.spending === "price" ? Math.trunc(Number(cost) || 0) : null, note: note || null }))
      .then((ok) => ok && onDone());
  return (
    <div className="flex flex-col gap-2 rounded-sm border border-line p-3" data-loot-give-form>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 text-text-muted">To</span>
        <select className="field w-auto" value={userId} onChange={(e) => (setUserId(e.target.value ? Number(e.target.value) : ""), setCharacter(""))} aria-label="Who got it" data-loot-to>
          <option value="">Choose a player…</option>
          {data.people.map((p) => (
            <option key={p.userId} value={p.userId}>{personLabel(p)}</option>
          ))}
        </select>
        {person && person.characters.length > 0 && (
          <select className="field w-auto" value={character} onChange={(e) => setCharacter(e.target.value)} aria-label="As which character" data-loot-character>
            <option value="">{person.name}</option>
            {person.characters.filter((c) => c !== person.name).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 text-text-muted">Paid with</span>
        <select className="field w-auto" value={poolId} onChange={(e) => pickPool(e.target.value ? Number(e.target.value) : "")} aria-label="Which set of points" data-loot-pool>
          {data.pools.map((p) => (
            <option key={p.id} value={p.id}>{`${p.name}${p.clanTag ? ` [${p.clanTag}]` : ""}${p.spending === "council" ? t(" (loot council, no cost)") : ""}`}</option>
          ))}
          {data.canRecord && <option value="">{t("Nothing: just record who got it")}</option>}
        </select>
        {pool?.spending === "price" && (
          <>
            <input className="field w-28" type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Cost" aria-label="Cost" data-loot-cost />
            <span className="text-xs text-text-muted">{priced !== undefined ? `${priced} each on the price list` : "No price on the list: enter the winning bid or the price."}</span>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 text-text-muted">Note</span>
        <input className="field min-w-0 flex-1" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} placeholder={pool?.spending === "council" ? "Why (the council's reason)" : "Optional"} aria-label="Note" data-loot-note />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn" disabled={act.busy || userId === "" || (pool?.spending === "price" && cost === "")} onClick={send} data-loot-give-go>Give it</button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button>
        {act.error && <span className="text-danger" role="alert">{act.error}</span>}
      </div>
    </div>
  );
}

type Draft = { key: number; name: string; quantity: string; sure: boolean; userId: number | ""; character: string | null; include: boolean };

/** Adding drops: typed, or read from a pasted or uploaded screenshot and checked first. */
function AddDrops({ opId, data, onAdded }: { opId: number; data: OpLootData; onAdded: () => void }) {
  const act = useAct();
  const [rows, setRows] = useState<Draft[]>([]);
  const [readId, setReadId] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [left, setLeft] = useState(data.reads.left);
  const [reading, setReading] = useState(false);
  const [poolId, setPoolId] = useState<number | "">(data.pools.find((p) => p.spending === "price")?.id ?? data.pools[0]?.id ?? "");
  const [costs, setCosts] = useState<Record<number, string>>({});
  const file = useRef<HTMLInputElement>(null);
  const keyN = useRef(0);
  const blank = (): Draft => ({ key: keyN.current++, name: "", quantity: "1", sure: true, userId: "", character: null, include: true });
  const pool = data.pools.find((p) => p.id === poolId);
  const itemId = (name: string) => data.items.find((i) => i.name.toLowerCase() === name.trim().toLowerCase())?.id;
  const defaultCost = (r: Draft) => {
    const id = itemId(r.name);
    const p = pool?.spending === "price" && id !== undefined ? pool.prices[id] : undefined;
    return p !== undefined ? String(p * (Math.trunc(Number(r.quantity)) || 1)) : "";
  };

  const readImage = async (blob: Blob) => {
    if (!data.reads.enabled || left <= 0 || reading) return;
    setReading(true);
    await act.run(async () => {
      const img = await shrink(blob);
      const r = await rpc<ReadView>("loot.read", { opId, image: img.data, type: img.type });
      setReadId(r.readId);
      setNote(r.note ?? (r.readable && r.rows.length === 0 ? t("No drops were found in that picture.") : !r.readable ? t("That picture does not seem to show any loot.") : null));
      setLeft(r.left);
      setRows(r.rows.map((x) => ({ key: keyN.current++, name: x.name, quantity: String(x.quantity), sure: x.sure, userId: x.userId ?? "", character: x.character, include: true })));
      setCosts({});
    });
    setReading(false);
  };
  const onPaste = (e: React.ClipboardEvent) => {
    const it = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
    const blob = it?.getAsFile();
    if (blob) {
      e.preventDefault();
      void readImage(blob);
    }
  };
  const set = (key: number, patch: Partial<Draft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const chosen = rows.filter((r) => r.include && r.name.trim());
  const save = () =>
    void act.run(async () => {
      const res = await rpc<{ ids: number[] }>("loot.record", { opId, rows: chosen.map((r) => ({ name: r.name, quantity: Math.trunc(Number(r.quantity)) || 1, readId })) });
      // Recorded: the rows go, whatever happens next, so confirming again cannot record them twice.
      setRows([]);
      setReadId(null);
      setNote(null);
      // Rows with a player chosen are given out at once, in the chosen set. One that cannot be (say the player
      // cannot afford it) stays recorded, not given, and is named with the reason.
      const missed: string[] = [];
      for (let i = 0; i < chosen.length; i++) {
        const r = chosen[i];
        if (r.userId === "") continue;
        const cost = pool?.spending === "price" ? Math.trunc(Number(costs[r.key] ?? defaultCost(r)) || 0) : null;
        try {
          await rpc("loot.give", { dropId: res.ids[i], userId: r.userId, character: r.character, poolId: poolId === "" ? null : poolId, cost });
        } catch (e) {
          missed.push(`${r.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      onAdded();
      if (missed.length) throw new Error(`Recorded, but not given out: ${missed.join(" ")} Give ${missed.length === 1 ? "it" : "them"} from the list above.`);
    });
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3" onPaste={onPaste} tabIndex={-1} data-loot-add>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-quiet text-sm" onClick={() => setRows((r) => [...r, blank()])} data-loot-add-hand>+ Add a drop by hand</button>
        {data.reads.enabled ? (
          <>
            <button type="button" className="btn text-sm" disabled={reading || left <= 0} onClick={() => file.current?.click()} data-loot-upload>{reading ? "Reading…" : "Read a screenshot"}</button>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void readImage(e.target.files[0]).then(() => (e.target.value = ""))} data-loot-file />
            <span className="text-xs text-text-muted" data-loot-left>{left > 0 ? `Or paste one here with Ctrl+V. ${left} of ${data.reads.perMonth} reads left this month.` : t(`Your alliance has used its ${data.reads.perMonth} screenshot reads this month; they start again on the 1st.`)}</span>
          </>
        ) : (
          <span className="text-xs text-text-muted">Reading screenshots is not switched on for this service.</span>
        )}
      </div>
      {note && <p className="text-sm text-text-muted" data-loot-read-note>{note}</p>}
      {rows.length > 0 && (
        <div className="flex flex-col gap-2" data-loot-review>
          {readId !== null && <p className="text-sm text-text-muted">{t("Check what was read. Untick anything that is not a drop, fix names and amounts, choose who got an item if you know. Nothing is added until you confirm.")}</p>}
          {data.pools.length > 0 && rows.some((r) => r.userId !== "") && (
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-text-muted">Items given out are paid with</span>
              <select className="field w-auto" value={poolId} onChange={(e) => setPoolId(e.target.value ? Number(e.target.value) : "")} aria-label="Which set of points pays" data-loot-batch-pool>
                {data.pools.map((p) => (
                  <option key={p.id} value={p.id}>{`${p.name}${p.clanTag ? ` [${p.clanTag}]` : ""}${p.spending === "council" ? t(" (loot council, no cost)") : ""}`}</option>
                ))}
                {data.canRecord && <option value="">{t("Nothing: just record who got it")}</option>}
              </select>
            </label>
          )}
          <datalist id={`loot-items-${opId}`}>
            {data.items.map((i) => (
              <option key={i.id} value={i.name} />
            ))}
          </datalist>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted">
                <th className="py-1 pr-2 font-normal" />
                <th className="py-1 pr-2 font-normal">Item</th>
                <th className="py-1 pr-2 font-normal">How many</th>
                <th className="py-1 pr-2 font-normal">Given to (if known)</th>
                {pool?.spending === "price" && <th className="py-1 font-normal">Cost</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-line" data-loot-row={r.key}>
                  <td className="py-1 pr-2"><input type="checkbox" checked={r.include} onChange={(e) => set(r.key, { include: e.target.checked })} aria-label="Add this drop" data-loot-include /></td>
                  <td className="py-1 pr-2">
                    <input className={`field w-full ${r.sure ? "" : "border-gold"}`} list={`loot-items-${opId}`} maxLength={64} value={r.name} onChange={(e) => set(r.key, { name: e.target.value, sure: true })} aria-label="Item" data-loot-name />
                    {!r.sure && <span className="text-[11px] text-gold" data-loot-unsure>Not sure: check this one</span>}
                  </td>
                  <td className="py-1 pr-2"><input className="field w-20" type="number" min={1} value={r.quantity} onChange={(e) => set(r.key, { quantity: e.target.value })} aria-label="How many" data-loot-qty /></td>
                  <td className="py-1 pr-2">
                    <select className="field w-full" value={r.userId} onChange={(e) => set(r.key, { userId: e.target.value ? Number(e.target.value) : "", character: null })} aria-label="Given to" data-loot-row-to>
                      <option value="">{r.character ? `Not matched: ${r.character}` : "Not yet"}</option>
                      {data.people.map((p) => (
                        <option key={p.userId} value={p.userId}>{personLabel(p)}</option>
                      ))}
                    </select>
                  </td>
                  {pool?.spending === "price" && (
                    <td className="py-1">
                      {r.userId !== "" && <input className="field w-24" type="number" min={0} value={costs[r.key] ?? defaultCost(r)} onChange={(e) => setCosts((c) => ({ ...c, [r.key]: e.target.value }))} aria-label="Cost" data-loot-row-cost />}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn" disabled={act.busy || chosen.length === 0} onClick={save} data-loot-save>{`Add ${chosen.length} ${chosen.length === 1 ? "drop" : "drops"}`}</button>
            <button type="button" className="btn btn-quiet" onClick={() => (setRows([]), setReadId(null), setNote(null))}>Discard</button>
          </div>
        </div>
      )}
      {act.error && (
        <span className="flex flex-wrap items-baseline gap-2 text-sm text-danger" role="alert">
          {act.error}
          <button type="button" className="btn btn-quiet px-2 py-0 text-xs" onClick={act.clear} data-loot-dismiss>Dismiss</button>
        </span>
      )}
    </div>
  );
}

// ---- The loot history ----

/** Every drop of the alliance, newest first, by player or item. */
export function LootHistory() {
  const { tick, info } = useApp();
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(false);
  const [drops, setDrops] = useState<Drop[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const h = setTimeout(() => {
      rpc<{ drops: Drop[] }>("loot.log", { q: q || undefined, userId: mine ? info.user.id : undefined })
        .then((r) => live && (setDrops(r.drops), setError("")))
        .catch((e: Error) => live && setError(e.message));
    }, 250);
    return () => {
      live = false;
      clearTimeout(h);
    };
  }, [q, mine, tick, info.user.id]);
  return (
    <section className="panel flex flex-col gap-3 p-5" data-loot-history>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="title title-rule flex-1 text-sm text-gold">Loot</h2>
        <input className="field w-48" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an item" aria-label="Find an item" data-loot-find />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} data-loot-mine />
          Only mine
        </label>
      </div>
      {error && <p className="text-danger" role="alert">{error}</p>}
      {drops && drops.length === 0 && <p className="text-text-muted">{t("Nothing recorded yet. Loot is recorded on an operation's board.")}</p>}
      {drops && drops.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted">
                <th className="py-1 pr-3 font-normal">When</th>
                <th className="py-1 pr-3 font-normal">Item</th>
                <th className="py-1 pr-3 font-normal">{t("Operation")}</th>
                <th className="py-1 pr-3 font-normal">Went to</th>
                <th className="py-1 font-normal">Cost</th>
              </tr>
            </thead>
            <tbody>
              {drops.map((d) => (
                <tr key={d.id} className="border-t border-line" data-loot-history-row={d.id}>
                  <td className="py-1 pr-3 text-text-muted">{day(d.recordedAt)}</td>
                  <td className="py-1 pr-3">{qty(d)}</td>
                  <td className="py-1 pr-3 text-text-muted">{d.operation ?? ""}</td>
                  <td className="py-1 pr-3">
                    {d.state === "given" && d.recipient ? `${d.recipient.name}${d.recipient.character && d.recipient.character !== d.recipient.name ? ` (${d.recipient.character})` : ""}` : d.state === "kept" ? t("Kept for the guild") : d.state === "sold" ? "Sold" : <span className="text-text-muted">Not given out</span>}
                  </td>
                  <td className="py-1 text-text-muted">{d.cost !== null && d.pool ? `${d.cost} ${d.pool.name}` : d.method === "council" ? "Council" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---- The item list and prices ----

type ItemList = { items: { id: number; name: string; aliases: string | null; hidden: boolean; prices: Record<number, number> }[]; manageList: boolean; pools: { id: number; name: string; clanId: number | null; clanTag: string | null; spending: string }[] };

/** On the Alliance tab (and the Clan tab, for the clan's own points' prices). */
export function ItemsSection({ clanId }: { clanId: number | null }) {
  const { tick } = useApp();
  const [data, setData] = useState<ItemList | null>(null);
  const [again, setAgain] = useState(0);
  const reload = () => setAgain((n) => n + 1);
  useEffect(() => {
    let live = true;
    rpc<ItemList>("loot.items")
      .then((r) => live && setData(r))
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
  }, [tick, again]);
  if (!data) return null;
  // On the Clan tab, only the clan's own priced sets; on the Alliance tab, the alliance's.
  const pools = data.pools.filter((p) => p.spending === "price" && p.clanId === clanId);
  const manageList = clanId === null && data.manageList;
  if (!manageList && pools.length === 0) return null;
  return (
    <section className="panel flex flex-col gap-3 p-5" data-loot-items={clanId === null ? "alliance" : clanId}>
      <h2 className="title title-rule text-sm text-gold">
        {clanId === null ? "Items and prices" : t("Prices in the clan's points")}
        <Help text={t("Your own list of items worth recording, so names are spelled one way and screenshots are read right. Add other spellings players use, separated by commas. A price is what an item costs in a set of points that spends by price; leave it empty to enter the price, or the winning bid, each time. Nothing here comes from the game itself.")} />
      </h2>
      {manageList && <AddItem onAdded={reload} />}
      {data.items.length === 0 ? (
        <p className="text-sm text-text-muted">{manageList ? "No items yet. Add the ones worth recording." : t("The alliance has no item list yet.")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted">
                <th className="py-1 pr-3 font-normal">Item</th>
                <th className="py-1 pr-3 font-normal">Other spellings</th>
                {pools.map((p) => (
                  <th key={p.id} className="py-1 pr-3 font-normal">{`${p.name}${p.clanTag ? ` [${p.clanTag}]` : ""}`}</th>
                ))}
                {manageList && <th className="py-1 font-normal" />}
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <ItemRow key={`${it.id}-${it.name}-${it.aliases}-${it.hidden}`} it={it} pools={pools} manage={manageList} onChange={reload} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AddItem({ onAdded }: { onAdded: () => void }) {
  const act = useAct();
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const add = () => void act.run(() => rpc("loot.saveItem", { name, aliases })).then((ok) => ok && (setName(""), setAliases(""), onAdded()));
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => (e.preventDefault(), add())} data-loot-item-add>
      <input className="field w-56" maxLength={64} value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" aria-label="Item name" />
      <input className="field min-w-0 flex-1" maxLength={255} value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Other spellings, separated by commas (optional)" aria-label="Other spellings" />
      <button type="submit" className="btn text-sm" disabled={act.busy || !name.trim()}>Add the item</button>
      {act.error && <span className="w-full text-danger" role="alert">{act.error}</span>}
    </form>
  );
}

function ItemRow({ it, pools, manage, onChange }: { it: ItemList["items"][number]; pools: ItemList["pools"]; manage: boolean; onChange: () => void }) {
  const act = useAct();
  const [name, setName] = useState(it.name);
  const [aliases, setAliases] = useState(it.aliases ?? "");
  const changed = name !== it.name || aliases !== (it.aliases ?? "");
  const setPrice = (poolId: number, v: string) => {
    const price = v.trim() === "" ? null : Math.max(0, Math.trunc(Number(v) || 0));
    if ((it.prices[poolId] ?? null) === price) return;
    void act.run(() => rpc("loot.setPrice", { poolId, itemId: it.id, price })).then((ok) => ok && onChange());
  };
  return (
    <tr className={`border-t border-line ${it.hidden ? "opacity-50" : ""}`} data-loot-item={it.id}>
      <td className="py-1 pr-3">{manage ? <input className="field w-48" maxLength={64} value={name} onChange={(e) => setName(e.target.value)} aria-label="Item name" /> : it.name}</td>
      <td className="py-1 pr-3 text-text-muted">{manage ? <input className="field w-full" maxLength={255} value={aliases} onChange={(e) => setAliases(e.target.value)} aria-label="Other spellings" /> : it.aliases}</td>
      {pools.map((p) => (
        <td key={p.id} className="py-1 pr-3">
          <input className="field w-24" type="number" min={0} defaultValue={it.prices[p.id] ?? ""} onBlur={(e) => setPrice(p.id, e.target.value)} aria-label={`${it.name}: price in ${p.name}`} data-loot-price={p.id} />
        </td>
      ))}
      {manage && (
        <td className="py-1 whitespace-nowrap">
          {changed && <button type="button" className="btn text-xs" disabled={act.busy} onClick={() => void act.run(() => rpc("loot.saveItem", { id: it.id, name, aliases, hidden: it.hidden })).then((ok) => ok && onChange())}>Save</button>}
          <button type="button" className="btn btn-quiet text-xs" disabled={act.busy} onClick={() => void act.run(() => rpc("loot.saveItem", { id: it.id, name: it.name, aliases: it.aliases, hidden: !it.hidden })).then((ok) => ok && onChange())}>{it.hidden ? "Show" : "Hide"}</button>
          {act.error && <span className="block text-danger" role="alert">{act.error}</span>}
        </td>
      )}
    </tr>
  );
}
