/**
 * Full sheets cached in localStorage. All of our iframes (action panel, sheet
 * popover, background) share one origin, so they share this cache, and the
 * browser's "storage" event tells the other iframes when a sheet changes.
 */
import type { ActorKind, ActorSheet } from "../model/sheet";

const PREFIX = "ddb-obr/sheet/";
const INDEX_KEY = "ddb-obr/sheet-index";
const MAX_ENTRIES = 60;

export function sheetKey(kind: ActorKind, id: number): string {
  return `${PREFIX}${kind}/${id}`;
}

function readIndex(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(index: string[]) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    /* ignore */
  }
}

export function getCachedSheet(kind: ActorKind, id: number): ActorSheet | null {
  try {
    const text = localStorage.getItem(sheetKey(kind, id));
    return text ? (JSON.parse(text) as ActorSheet) : null;
  } catch {
    return null;
  }
}

export function putCachedSheet(sheet: ActorSheet): void {
  const key = sheetKey(sheet.kind, sheet.ddbId);
  const text = JSON.stringify(sheet);
  let index = readIndex().filter((k) => k !== key);
  index.push(key);
  // Evict least recently written sheets until it fits.
  for (let attempt = 0; attempt < 20; attempt++) {
    while (index.length > MAX_ENTRIES) {
      const oldest = index.shift()!;
      localStorage.removeItem(oldest);
    }
    try {
      localStorage.setItem(key, text);
      writeIndex(index);
      return;
    } catch {
      if (index.length <= 1) return;
      const oldest = index.shift()!;
      try {
        localStorage.removeItem(oldest);
      } catch {
        /* ignore */
      }
    }
  }
}

export function removeCachedSheet(kind: ActorKind, id: number): void {
  const key = sheetKey(kind, id);
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  writeIndex(readIndex().filter((k) => k !== key));
}

export function clearSheetCache(): void {
  for (const key of readIndex()) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  writeIndex([]);
}

/** Calls back when another iframe of ours updates a cached sheet. */
export function onCachedSheetChange(callback: (kind: ActorKind, id: number) => void): () => void {
  const handler = (event: StorageEvent) => {
    if (!event.key?.startsWith(PREFIX)) return;
    const [kind, id] = event.key.slice(PREFIX.length).split("/");
    if ((kind === "character" || kind === "monster") && id) callback(kind, Number(id));
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
