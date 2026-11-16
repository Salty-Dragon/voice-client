// Calls to the backend's app API. The desktop app proves who it is with its
// session token; the browser version, served from the site, with the site's cookie.

import { getToken } from "./auth";
import { SERVER } from "./config";

const API: string = import.meta.env.VITE_API_URL ?? SERVER;

/** A refusal from the server, with a message meant for the player. */
export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function rpc<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API}/api/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: token ? "omit" : "same-origin",
      body: JSON.stringify({ method, params }),
    });
  } catch {
    throw new ApiError("The server could not be reached.", 0);
  }
  const body = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
  if (!res.ok) throw new ApiError(body.error ?? `The server said ${res.status}.`, res.status);
  return body.result as T;
}

// ---- Shapes returned by the API (mirrors of the backend's types) ----

export type ClanRole = "leader" | "officer" | "member";
export type Membership = { clanId: number; name: string; tag: string; role: ClanRole; status: "pending" | "active" | "removed" };
export type Info = {
  user: {
    id: number;
    name: string;
    nameSet: boolean;
    classTag: string | null;
    /** App admin: runs the install. */
    isAdmin: boolean;
    isAllianceAdmin: boolean;
    /** App admin or alliance admin: may manage clans, operations and bans. */
    runsAlliance: boolean;
  };
  membership: Membership | null;
  /** Join requests waiting on this player as a clan leader or officer. */
  pendingApprovals: number;
};
export type ClanSummary = { id: number; name: string; tag: string; leaderName: string | null; members: number };
export type ClanMember = { userId: number; name: string; classTag: string | null; role: ClanRole; status: "pending" | "active" };
export type ClanView = { clan: { id: number; name: string; tag: string }; myRole: ClanRole | null; members: ClanMember[]; onlineIds: number[] };

export type OpState = "planned" | "live" | "ended";
export type OpSummary = { id: number; name: string; startsAt: string | null; state: OpState; leaderName: string };
export type Person = { userId: number; name: string; classTag: string | null; clanId: number | null; clanTag: string | null; clanRole: ClanRole | null };
export type Party = { id: number; name: string; leaderId: number | null; memberIds: number[] };
export type OpView = {
  id: number;
  name: string;
  startsAt: string | null;
  state: OpState;
  eventLeaderId: number;
  deputyIds: number[];
  clans: { id: number; name: string; tag: string }[];
  parties: Party[];
  people: Person[];
  reserveIds: number[];
};
export type OpPerms = { isOrganiser: boolean; leadClanIds: number[]; canView: boolean; canEditParties: boolean };
export type OpDetail = { op: OpView; perms: OpPerms; canRunOp: boolean; onlineIds: number[] };
export type OpOptions = { clans: ClanSummary[]; users: { id: number; name: string; clanTag: string | null }[] };
export type AllianceUser = { id: number; name: string; clanTag: string | null; banned: boolean; isAdmin: boolean; isAllianceAdmin: boolean };
export type AllianceView = { clans: ClanSummary[]; users: AllianceUser[] };
