/**
 * D&D Beyond's public "config" feed maps the numeric ids used in monster data
 * (sizes, senses, skills, challenge ratings...) to names. We cache it locally for
 * a week. Without it, monster stat blocks fall back to built-in tables where we
 * have them and show raw ids otherwise.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ConfigEntry {
  id: number;
  name?: string;
  [key: string]: any;
}

export interface DdbConfig {
  creatureSizes?: ConfigEntry[];
  monsterTypes?: ConfigEntry[];
  monsterSubTypes?: ConfigEntry[];
  alignments?: ConfigEntry[];
  movements?: ConfigEntry[];
  senses?: ConfigEntry[];
  abilitySkills?: ConfigEntry[];
  stats?: ConfigEntry[];
  damageAdjustments?: ConfigEntry[];
  conditions?: { definition?: ConfigEntry }[];
  languages?: ConfigEntry[];
  challengeRatings?: ConfigEntry[];
  sources?: ConfigEntry[];
}

const CACHE_KEY = "ddb-obr/config";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const KEEP: (keyof DdbConfig)[] = [
  "creatureSizes",
  "monsterTypes",
  "monsterSubTypes",
  "alignments",
  "movements",
  "senses",
  "abilitySkills",
  "stats",
  "damageAdjustments",
  "conditions",
  "languages",
  "challengeRatings",
  "sources",
];

/** Keeps only the lookup tables we use so the cached copy stays small. */
export function trimConfig(raw: any): DdbConfig {
  const out: DdbConfig = {};
  for (const key of KEEP) {
    if (Array.isArray(raw?.[key])) (out as any)[key] = raw[key];
  }
  return out;
}

export function readCachedConfig(): DdbConfig | null {
  try {
    const text = localStorage.getItem(CACHE_KEY);
    if (!text) return null;
    const parsed = JSON.parse(text);
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return parsed.config as DdbConfig;
  } catch {
    return null;
  }
}

export function writeCachedConfig(config: DdbConfig): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), config }));
  } catch {
    // Storage full or blocked: the config is a convenience, so ignore.
  }
}

export function lookup(config: DdbConfig | null, table: keyof DdbConfig, id: unknown): ConfigEntry | undefined {
  if (!config) return undefined;
  if (table === "conditions") {
    return config.conditions?.find((c) => c.definition?.id === id)?.definition;
  }
  return (config[table] as ConfigEntry[] | undefined)?.find((entry) => entry.id === id);
}
