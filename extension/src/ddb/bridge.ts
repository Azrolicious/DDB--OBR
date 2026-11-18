/**
 * Client for the companion browser extension ("DDB-OBR Bridge", see /bridge).
 *
 * Owlbear Rodeo runs our pages in iframes on our own origin, so the browser will
 * not attach your dndbeyond.com login cookies to requests we make, and D&D
 * Beyond's APIs don't allow cross-origin calls anyway. The bridge extension's
 * content script runs inside our iframe and relays a fixed set of read-only
 * requests to its background worker, which talks to D&D Beyond with your
 * session. Your D&D Beyond token never reaches this page.
 */
import { BRIDGE_TAG } from "../constants";

export type BridgeOp =
  | "status"
  | "character"
  | "characterSummaries"
  | "encounters"
  | "encounter"
  | "monsters"
  | "config"
  | "campaignCharacters";

export interface BridgeStatus {
  installed: boolean;
  version?: string;
  loggedIn?: boolean;
  userId?: number;
  username?: string;
}

export class BridgeError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: number;
}

class BridgeClient {
  private pending = new Map<string, Pending>();
  private version: string | undefined;
  private helloWaiters: ((version: string) => void)[] = [];
  private missingSince = 0;

  constructor() {
    if (typeof window === "undefined") return;
    window.addEventListener("message", (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const msg = event.data;
      if (!msg || msg.tag !== BRIDGE_TAG || msg.dir !== "to-page") return;
      if (msg.type === "hello") {
        this.version = String(msg.version ?? "unknown");
        this.helloWaiters.splice(0).forEach((fn) => fn(this.version!));
        return;
      }
      if (msg.type === "response" && typeof msg.id === "string") {
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        window.clearTimeout(pending.timer);
        if (msg.ok) pending.resolve(msg.data);
        else pending.reject(new BridgeError(msg.error?.code ?? "error", msg.error?.message ?? "Bridge request failed"));
      }
    });
  }

  private post(payload: Record<string, unknown>) {
    window.postMessage({ tag: BRIDGE_TAG, dir: "to-ext", ...payload }, window.location.origin);
  }

  /** Resolves true when the companion extension answers within the timeout. */
  async detect(timeoutMs = 1200, force = false): Promise<boolean> {
    if (this.version) return true;
    // Don't make every call wait for a bridge that recently didn't answer.
    if (!force && Date.now() - this.missingSince < 15000) return false;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.missingSince = Date.now();
        resolve(false);
      }, timeoutMs);
      this.helloWaiters.push(() => {
        window.clearTimeout(timer);
        resolve(true);
      });
      this.post({ type: "ping" });
    });
  }

  get installedVersion(): string | undefined {
    return this.version;
  }

  async call<T>(op: BridgeOp, params: Record<string, unknown> = {}, timeoutMs = 30000): Promise<T> {
    if (!(await this.detect())) {
      throw new BridgeError(
        "not_installed",
        "The DDB-OBR Bridge browser extension isn't installed or isn't enabled for this site.",
      );
    }
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new BridgeError("timeout", "D&D Beyond took too long to respond."));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.post({ type: "request", id, op, params });
    });
  }

  async status(force = false): Promise<BridgeStatus> {
    if (!(await this.detect(1200, force))) return { installed: false };
    try {
      const s = await this.call<{ loggedIn: boolean; userId?: number; username?: string }>("status", {}, 15000);
      return { installed: true, version: this.version, ...s };
    } catch {
      return { installed: true, version: this.version, loggedIn: false };
    }
  }
}

export const bridge = new BridgeClient();
