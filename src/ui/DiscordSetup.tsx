// Setting up Discord announcements: a clan's leader for the clan's channel,
// an alliance admin for the alliance's. The server posts there when an
// operation is created, changed, cancelled or started, and a reminder some
// time before it starts. A channel can have a role that those messages ping.
//
// What is pasted is a channel webhook's address, which is a secret: the
// server keeps it and only ever tells the app whether one is set.

import { t } from "../words";
import { useState } from "react";
import { rpc } from "../api";
import { ConfirmButton, useAct } from "./app-context";

export const DISCORD_HELP = (what: string) =>
  [
    `Posts a message in a Discord channel when ${what} is created, changed, cancelled or started, so players who do not have the app open still hear about it.`,
    "To set it up: in Discord, open the channel's settings (the cog beside its name), then Integrations, Webhooks, New Webhook, and Copy Webhook URL. Paste that address here. You need the Manage Webhooks permission on the Discord server.",
    "A first message is posted at once, so you can see it arrive.",
    "The address is a secret: anyone who has it can post in that channel. The app stores it and never shows it again. To stop, disconnect here or delete the webhook in Discord.",
    t("A message names the operation, its start (shown to each reader in their own time zone), the clans and the event leader."),
    t("A reminder is posted some time before an operation starts. An alliance admin chooses how long before, for the whole alliance, or switches it off."),
    t("Nobody is pinged unless you choose a role here. That role is then pinged when an operation is announced, by the reminder, when it starts and if it is cancelled; not by a change of detail. Type @everyone or @here, or paste a role's ID: in Discord, switch on Developer Mode under Settings, Advanced, then right-click the role in the server's settings and choose Copy Role ID. If the ping does not light up, allow the role to be mentioned in its settings."),
  ].join("\n");

/** A stored role the way a leader typed it. */
const shown = (role: string | null | undefined) => (!role ? "" : role === "everyone" || role === "here" ? `@${role}` : role);
const LEAD: Record<number, string> = { 0: "Off", 15: "15 minutes before", 30: "30 minutes before", 60: "1 hour before", 120: "2 hours before" };

/** `clanId` null: the alliance's own channel. */
export function DiscordSetup({
  clanId,
  connected,
  role,
  remind,
  onChange,
}: {
  clanId: number | null;
  connected: boolean;
  /** The role this channel's announcements ping, if one is chosen. */
  role?: string | null;
  /** The alliance's reminder: minutes before the start (0: off) and what can be chosen. Only on the alliance's own channel. */
  remind?: { minutes: number; choices: number[] };
  onChange: () => void;
}) {
  const act = useAct();
  const [url, setUrl] = useState("");
  const [ping, setPing] = useState<string | null>(null);
  const typed = ping ?? shown(role);
  const saveRole = (text: string, done: string) => {
    setSaid("");
    void act.run(() => rpc("discord.setRole", { clanId, role: text })).then((ok) => {
      if (!ok) return;
      setPing(null);
      setSaid(done);
      onChange();
    });
  };
  const [said, setSaid] = useState("");
  const set = (text: string, done: string) => {
    setSaid("");
    void act
      .run(() => rpc(clanId === null ? "alliance.setDiscord" : "clan.setDiscord", { clanId, url: text }))
      .then((ok) => {
        if (!ok) return;
        setUrl("");
        setSaid(done);
        onChange();
      });
  };
  return (
    <div className="flex flex-col gap-2" data-discord-setup>
      <p className={connected ? "text-net-party" : "text-text-muted"}>{connected ? t("Connected: operations are announced in a Discord channel.") : "Not set up."}</p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          set(url, "Connected. A first message has been posted in the channel.");
        }}
      >
        {/* Typed like a password: it is one, and this screen may be on a stream. */}
        <input
          type="password"
          autoComplete="off"
          className="field max-w-md flex-1"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={connected ? "Paste another webhook address to replace it" : "Paste the channel's webhook address"}
          aria-label="Discord webhook address"
        />
        <button className="btn text-sm" disabled={act.busy || url.trim().length < 20}>{connected ? "Replace" : "Connect"}</button>
        {connected && (
          <>
            <button
              type="button"
              className="btn btn-quiet text-sm"
              disabled={act.busy}
              onClick={() => {
                setSaid("");
                void act.run(() => rpc("discord.test", { clanId })).then((ok) => ok && setSaid("Test message sent. Check the channel."));
              }}
            >
              Send a test message
            </button>
            <ConfirmButton confirm="Stop announcing?" disabled={act.busy} onConfirm={() => set("", "Disconnected. Nothing more is posted.")}>Disconnect</ConfirmButton>
          </>
        )}
      </form>
      {connected && (
        <form
          className="flex flex-wrap items-center gap-2"
          data-discord-role
          onSubmit={(e) => {
            e.preventDefault();
            saveRole(typed, typed.trim() ? "Saved. The channel has been told who will be pinged." : "Saved. Nobody is pinged.");
          }}
        >
          <label className="flex flex-wrap items-center gap-2 text-text-muted">
            Ping
            <input className="field w-56" value={typed} onChange={(e) => setPing(e.target.value)} placeholder="nobody" autoComplete="off" maxLength={40} aria-label="Role to ping" />
          </label>
          <button className="btn btn-quiet text-sm" disabled={act.busy || typed.trim() === shown(role)}>Save</button>
          <span className="text-xs text-text-muted">A role&apos;s ID, @everyone or @here. Empty: nobody.</span>
        </form>
      )}
      {remind && (
        <label className="flex flex-wrap items-center gap-2 text-text-muted" data-discord-remind>
          Reminder
          <select
            className="field"
            value={remind.minutes}
            disabled={act.busy}
            aria-label="Reminder before the start"
            onChange={(e) => {
              const minutes = Number(e.target.value);
              setSaid("");
              void act.run(() => rpc("alliance.setReminder", { minutes })).then((ok) => {
                if (!ok) return;
                setSaid(minutes ? t("Saved. Every channel of the alliance is reminded before an operation starts.") : "Saved. No reminders are posted.");
                onChange();
              });
            }}
          >
            {remind.choices.map((m) => <option key={m} value={m}>{LEAD[m] ?? `${m} minutes before`}</option>)}
          </select>
          <span className="text-xs">{t("Posted in the alliance's channel and in each clan's own, for the operations it takes part in.")}</span>
        </label>
      )}
      {act.error && <p className="text-danger" role="alert">{act.error}</p>}
      {said && <p className="text-net-party" role="status">{said}</p>}
    </div>
  );
}
