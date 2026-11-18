/**
 * The room's party list: characters someone has imported into this room. Kept in
 * room metadata (shared, persistent, but limited to ~16 kB), so entries are tiny.
 */
import OBR from "@owlbear-rodeo/sdk";
import { useEffect, useState } from "react";
import { ROSTER_KEY } from "../constants";
import type { CharacterSheet } from "../model/sheet";

export interface RosterEntry {
  ddbId: number;
  name: string;
  avatarUrl?: string;
  summary?: string;
  /** Owlbear player id of whoever imported it (players can remove their own). */
  addedBy?: string;
}

export function readRoster(metadata: Record<string, unknown>): RosterEntry[] {
  const value = metadata[ROSTER_KEY];
  return Array.isArray(value) ? (value as RosterEntry[]).filter((e) => typeof e?.ddbId === "number") : [];
}

export async function upsertRoster(sheet: CharacterSheet): Promise<void> {
  const roster = readRoster(await OBR.room.getMetadata());
  const entry: RosterEntry = {
    ddbId: sheet.ddbId,
    name: sheet.name,
    // Data URLs or huge URLs would eat the room's metadata budget.
    avatarUrl: sheet.avatarUrl && sheet.avatarUrl.length < 300 ? sheet.avatarUrl : undefined,
    summary: `Lv ${sheet.level} ${sheet.race} ${sheet.classSummary}`.slice(0, 80),
    addedBy: roster.find((e) => e.ddbId === sheet.ddbId)?.addedBy ?? OBR.player.id,
  };
  const next = [...roster.filter((e) => e.ddbId !== sheet.ddbId), entry].sort((a, b) => a.name.localeCompare(b.name));
  await OBR.room.setMetadata({ [ROSTER_KEY]: next });
}

export async function removeFromRoster(ddbId: number): Promise<void> {
  const roster = readRoster(await OBR.room.getMetadata());
  await OBR.room.setMetadata({ [ROSTER_KEY]: roster.filter((e) => e.ddbId !== ddbId) });
}

export function useRoster(): RosterEntry[] {
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  useEffect(() => {
    OBR.room.getMetadata().then((m) => setRoster(readRoster(m))).catch(() => {});
    return OBR.room.onMetadataChange((m) => setRoster(readRoster(m)));
  }, []);
  return roster;
}
