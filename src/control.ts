// The control channel: one WebSocket to the backend that tells this client
// which rooms it belongs in. The client never decides that for itself.

import type { NetKind } from "./settings";

export type NetGrant = { net: NetKind; label: string; room: string; speak: boolean; token: string };
export type OpInfo = { id: number; name: string; state: "planned" | "live" | "ended" };
export type NetSet = {
  url: string;
  operation: OpInfo | null;
  operations: OpInfo[];
  /** True when these are lounge rooms, not an operation's nets. */
  lounge: boolean;
  nets: NetGrant[];
  notice?: { kind: "moved" | "leader"; party: string | null };
  /** Parties whose leader has dropped out, where this player is asked to pick a new one. */
  leaderLost?: LeaderLost[];
};
export type LeaderLost = { partyId: number; party: string; leader: string; members: { id: number; name: string; here: boolean }[] };
export type Me = { id: number; name: string; classTag: string | null; nameSet: boolean; isAdmin: boolean };
export type ControlState = "connecting" | "online" | "offline";
/** Why the server ended the session for good. */
export type Ended = "replaced" | "signed_out";

export class ControlClient {
  private ws: WebSocket | null = null;
  private retry = 0;
  private retryTimer: number | undefined;
  private pingTimer: number | undefined;
  private stopped = false;

  onState: (s: ControlState) => void = () => {};
  onHello: (me: Me) => void = () => {};
  onNetSet: (set: NetSet) => void = () => {};
  onEnded: (why: Ended) => void = () => {};
  /** Something in the roster changed; any open roster screen should reload. */
  onChanged: () => void = () => {};

  /** `token` is the desktop session token; the browser passes null and is recognised by its cookie. */
  constructor(private url: string, private token: string | null) {}

  start() {
    this.stopped = false;
    this.open();
  }

  stop() {
    this.stopped = true;
    window.clearTimeout(this.retryTimer);
    window.clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
  }

  /** Choose where to be: an operation, the lounge, or "auto" to let the server decide. */
  select(target: number | "lounge" | "auto") {
    this.send({ type: "select", operationId: typeof target === "number" ? target : null, lounge: target === "lounge" });
  }

  /** Ask for fresh tokens, after a room could not reconnect with the ones we hold. */
  refresh() {
    this.send({ type: "refresh" });
  }

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private open() {
    this.onState("connecting");
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      if (this.token) ws.send(JSON.stringify({ type: "auth", token: this.token }));
    };
    ws.onmessage = (e) => {
      let msg: { type?: string } & Record<string, unknown>;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg.type === "hello") {
        this.retry = 0;
        this.onState("online");
        this.onHello(msg.user as Me);
      } else if (msg.type === "netset") {
        this.onNetSet(msg as unknown as NetSet);
      } else if (msg.type === "changed") {
        this.onChanged();
      } else if (msg.type === "replaced" || msg.type === "signed_out") {
        this.stopped = true;
        this.onEnded(msg.type);
      }
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      window.clearInterval(this.pingTimer);
      if (this.stopped) return;
      // The browser fallback has no token to be refused with a message, so a
      // refusal shows up as the close code.
      if (e.code === 4003) {
        this.stopped = true;
        return this.onEnded("signed_out");
      }
      if (e.code === 4001) {
        this.stopped = true;
        return this.onEnded("replaced");
      }
      // A dropped connection is retried quietly. Voice keeps running meanwhile.
      this.onState("offline");
      const delay = Math.min(10_000, 500 * 2 ** this.retry++);
      this.retryTimer = window.setTimeout(() => this.open(), delay);
    };
    ws.onerror = () => {};
    window.clearInterval(this.pingTimer);
    this.pingTimer = window.setInterval(() => this.send({ type: "ping" }), 30_000);
  }
}
