// Setting up Discord announcements: a clan's leader for the clan's channel,
// an alliance admin for the alliance's. The server posts there when an
// operation is created, changed, cancelled or started.
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
    t("A message names the operation, its start (shown to each reader in their own time zone), the clans and the event leader. Nobody is pinged."),
  ].join("\n");

/** `clanId` null: the alliance's own channel. */
export function DiscordSetup({ clanId, connected, onChange }: { clanId: number | null; connected: boolean; onChange: () => void }) {
  const act = useAct();
  const [url, setUrl] = useState("");
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
      {act.error && <p className="text-danger" role="alert">{act.error}</p>}
      {said && <p className="text-net-party" role="status">{said}</p>}
    </div>
  );
}
