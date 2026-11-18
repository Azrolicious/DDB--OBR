/**
 * High-level D&D Beyond access. Prefers the companion bridge (works for private
 * characters, encounters and the monsters you own). Without it, we try D&D
 * Beyond's public endpoints directly, which only works where D&D Beyond allows
 * cross-origin requests; the UI also offers "paste JSON" as a last resort.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CharacterSheet, MonsterSheet } from "../model/sheet";
import { bridge, BridgeError } from "./bridge";
import { parseCharacter } from "./character";
import { readCachedConfig, trimConfig, writeCachedConfig, type DdbConfig } from "./config";
import {
  normalizeEncounter,
  parseMonster,
  summarizeEncounter,
  type EncounterDetail,
  type EncounterSummary,
} from "./monster";

const PUBLIC_CHARACTER_URL = (id: number) => `https://character-service.dndbeyond.com/character/v5/character/${id}`;
const PUBLIC_CONFIG_URL = "https://www.dndbeyond.com/api/config/json";

async function directJson(url: string): Promise<any> {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error(`D&D Beyond answered ${response.status}`);
  return response.json();
}

async function hasBridge(): Promise<boolean> {
  return bridge.detect();
}

export async function fetchCharacterSheet(id: number): Promise<CharacterSheet> {
  if (await hasBridge()) {
    const raw = await bridge.call<any>("character", { id });
    let summary: any;
    try {
      const found = await bridge.call<any[]>("characterSummaries", { ids: [id] });
      summary = Array.isArray(found) ? found.find((c) => Number(c?.characterId ?? c?.id) === id) : undefined;
    } catch {
      // The summary service only covers characters in campaigns you can see; the
      // locally computed values are a fine fallback.
    }
    return parseCharacter(raw, summary);
  }
  try {
    return parseCharacter(await directJson(PUBLIC_CHARACTER_URL(id)));
  } catch (error) {
    throw new BridgeError(
      "unavailable",
      "Couldn't reach D&D Beyond from here. Install the DDB-OBR Bridge browser extension, or use “Paste JSON”. " +
        `(${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

/**
 * D&D Beyond's computed summaries (HP, AC...) for many characters in one call.
 * Used by the background sync. Bridge only.
 */
export async function fetchCharacterSummaries(ids: number[]): Promise<Map<number, any>> {
  const found = await bridge.call<any[]>("characterSummaries", { ids });
  const map = new Map<number, any>();
  for (const c of Array.isArray(found) ? found : []) {
    const id = Number(c?.characterId ?? c?.id);
    if (Number.isFinite(id)) map.set(id, c);
  }
  return map;
}

let configPromise: Promise<DdbConfig | null> | null = null;

export function getConfig(): Promise<DdbConfig | null> {
  const cached = readCachedConfig();
  if (cached) return Promise.resolve(cached);
  if (!configPromise) {
    configPromise = (async () => {
      try {
        const raw = (await hasBridge()) ? await bridge.call<any>("config") : await directJson(PUBLIC_CONFIG_URL);
        const config = trimConfig(raw?.data ?? raw);
        writeCachedConfig(config);
        return config;
      } catch {
        return null;
      } finally {
        configPromise = null;
      }
    })();
  }
  return configPromise;
}

export async function fetchMonsterSheets(ids: number[]): Promise<MonsterSheet[]> {
  const unique = [...new Set(ids)].filter((id) => Number.isFinite(id));
  if (!unique.length) return [];
  const [config, raw] = await Promise.all([getConfig(), bridge.call<any[]>("monsters", { ids: unique })]);
  return (Array.isArray(raw) ? raw : []).map((m) => parseMonster(m, config));
}

export async function listEncounters(): Promise<EncounterSummary[]> {
  const raw = await bridge.call<any[]>("encounters");
  return (Array.isArray(raw) ? raw : [])
    .map(summarizeEncounter)
    .sort((a, b) => (b.modified ?? "").localeCompare(a.modified ?? "") || a.name.localeCompare(b.name));
}

export async function fetchEncounter(id: string): Promise<EncounterDetail> {
  return normalizeEncounter(await bridge.call<any>("encounter", { id }));
}

export interface CampaignCharacter {
  id: number;
  name: string;
  avatarUrl?: string;
  userName?: string;
}

export async function fetchCampaignCharacters(campaignId: number): Promise<CampaignCharacter[]> {
  const raw = await bridge.call<any[]>("campaignCharacters", { campaignId });
  return (Array.isArray(raw) ? raw : [])
    .map((c) => ({
      id: Number(c?.id ?? c?.characterId),
      name: String(c?.name ?? c?.characterName ?? "Character"),
      avatarUrl: c?.avatarUrl ?? undefined,
      userName: c?.userName ?? c?.username ?? undefined,
    }))
    .filter((c) => Number.isFinite(c.id) && c.id > 0);
}
