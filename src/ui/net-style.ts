// Names and colours of the nets. Kept free of anything that starts voice, so
// the compact strip can use them too.
import type { NetKind } from "../settings";

export const NET_TEXT: Record<NetKind, string> = {
  broadcast: "text-net-broadcast",
  command: "text-net-command",
  clan: "text-net-clan",
  party: "text-net-party",
  reserve: "text-net-reserve",
  lounge: "text-text",
};

export const NET_NAME: Record<NetKind, string> = {
  broadcast: "Broadcast",
  command: "Command",
  clan: "Clan",
  party: "Party",
  reserve: "Reserve",
  lounge: "Lounge",
};
