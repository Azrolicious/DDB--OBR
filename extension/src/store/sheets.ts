import { bridge } from "../ddb/bridge";
import { fetchCharacterSheet, fetchMonsterSheets } from "../ddb/client";
import type { ActorKind, ActorSheet } from "../model/sheet";
import { requestSheetFromPeers } from "../obr/peers";
import { getCachedSheet, putCachedSheet } from "./cache";

export interface LoadOptions {
  /** Ignore the cache and go to D&D Beyond (or peers). */
  refresh?: boolean;
  /** Cached sheets younger than this are used without refetching. */
  maxAgeMs?: number;
}

const inflight = new Map<string, Promise<ActorSheet>>();

async function fetchFromSource(kind: ActorKind, ddbId: number): Promise<ActorSheet> {
  if (kind === "character") return fetchCharacterSheet(ddbId);
  const [sheet] = await fetchMonsterSheets([ddbId]);
  if (!sheet) throw new Error("D&D Beyond didn't return that monster.");
  return sheet;
}

/**
 * Cache -> D&D Beyond (bridge or public endpoint) -> other players -> stale cache.
 */
export function loadSheet(kind: ActorKind, ddbId: number, options: LoadOptions = {}): Promise<ActorSheet> {
  const key = `${kind}/${ddbId}`;
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = (async () => {
    const cached = getCachedSheet(kind, ddbId);
    const maxAge = options.maxAgeMs ?? 10 * 60 * 1000;
    if (cached && !options.refresh && Date.now() - cached.fetchedAt < maxAge) return cached;

    let firstError: unknown;
    const canFetch = kind === "character" || (await bridge.detect());
    if (canFetch) {
      try {
        const sheet = await fetchFromSource(kind, ddbId);
        putCachedSheet(sheet);
        return sheet;
      } catch (error) {
        firstError = error;
      }
    }
    if (cached) return cached;
    const fromPeer = await requestSheetFromPeers(kind, ddbId);
    if (fromPeer) {
      putCachedSheet({ ...fromPeer, fetchedAt: Date.now() });
      return fromPeer;
    }
    throw firstError instanceof Error
      ? firstError
      : new Error("Nobody in the room has this sheet loaded and D&D Beyond isn't reachable from this browser.");
  })().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

export function saveImportedSheet(sheet: ActorSheet): void {
  putCachedSheet(sheet);
}
