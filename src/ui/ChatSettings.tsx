// The alliance's settings for the operations' text chat: who may write beyond
// those who may speak, and how long the lines are kept. For its admins.

import { useEffect, useState } from "react";
import { rpc } from "../api";
import { t } from "../words";
import { useAct } from "./app-context";

export type ChatSettingsData = { clanAll: boolean; operationAll: boolean; keepDays: number };

// t() where shown.
export const CHAT_SETTINGS_HELP = [
  "Operations have a text chat: a channel for each net, read by whoever is on that net.",
  "Writing follows speaking: everyone writes in their party, leaders on Command, a clan's leader and officers in the clan's channel, and the organisers to the whole operation.",
  "The two switches open the last two to every member. With hundreds of players, an operation-wide channel that everyone writes in moves fast: try it before a big event.",
  "Kept: how long an operation's lines stay after it has ended, for the players who were on those nets to read back on its board. They never outlive the operation itself, and a deleted account's lines go with it.",
  "Those who run an operation can remove any line they can read and switch a player's writing off for that operation; both are in the log, without what was written.",
].join("\n");

// t() where shown.
const KEEP: Record<number, string> = { 0: "Until the operation ends", 7: "7 days after it", 30: "30 days after it", 365: "As long as the operation's own record" };

export function ChatSettings({ settings, choices, onChange }: { settings: ChatSettingsData; choices: number[]; onChange: () => void }) {
  const act = useAct();
  // A switch shows its new position at once; the server's answer follows, and puts it back if it said no.
  const [asked, setAsked] = useState<Partial<ChatSettingsData>>({});
  useEffect(() => setAsked({}), [settings.clanAll, settings.operationAll, settings.keepDays]);
  const now = { ...settings, ...asked };
  const set = (patch: Partial<ChatSettingsData>) => {
    setAsked((a) => ({ ...a, ...patch }));
    void act.run(() => rpc("alliance.setChat", patch)).then((ok) => {
      if (!ok) setAsked({});
      onChange();
    });
  };
  return (
    <div className="flex flex-col gap-2" data-chat-settings>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={now.clanAll} disabled={act.busy} onChange={(e) => set({ clanAll: e.target.checked })} />
        {t("Members may write in their clan's channel")}
        <span className="text-xs text-text-muted">{t("Off: only the clan's leader and officers do.")}</span>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={now.operationAll} disabled={act.busy} onChange={(e) => set({ operationAll: e.target.checked })} />
        {t("Members may write to the whole operation")}
        <span className="text-xs text-text-muted">Off: only its event leader and deputies do.</span>
      </label>
      <label className="flex flex-wrap items-center gap-2 text-text-muted">
        Kept
        <select className="field w-auto" value={now.keepDays} disabled={act.busy} aria-label="How long chat is kept" onChange={(e) => set({ keepDays: Number(e.target.value) })}>
          {choices.map((d) => <option key={d} value={d}>{t(KEEP[d] ?? `${d} days after it`)}</option>)}
        </select>
      </label>
      {act.error && <p className="text-danger" role="alert">{act.error}</p>}
    </div>
  );
}
