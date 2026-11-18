/**
 * The extension's own, normalized view of a D&D Beyond actor. Everything the UI
 * renders comes from these shapes, never from raw D&D Beyond JSON, so changes in
 * DDB's format only need fixing in the parsers under src/ddb/.
 */

export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";
export type ProficiencyLevel = "none" | "half" | "proficient" | "expertise";
export type ActorKind = "character" | "monster";

export interface AbilityScore {
  key: AbilityKey;
  label: string;
  score: number;
  mod: number;
  save: number;
  saveProficient: boolean;
}

export interface SkillScore {
  name: string;
  ability: AbilityKey;
  mod: number;
  proficiency: ProficiencyLevel;
}

export interface HitPoints {
  current: number;
  max: number;
  temp: number;
}

export interface Speed {
  type: string;
  feet: number;
}

export interface Sense {
  name: string;
  value: string;
}

export interface Attack {
  name: string;
  toHit?: number;
  damage?: string;
  damageType?: string;
  range?: string;
  notes?: string;
}

export interface LimitedUse {
  max: number;
  used: number;
  reset?: string;
}

export interface ActionEntry {
  name: string;
  activation?: string;
  /** HTML from D&D Beyond. Sanitize before rendering. */
  description: string;
  uses?: LimitedUse;
  source?: string;
}

export interface SpellEntry {
  name: string;
  level: number;
  school?: string;
  castingTime?: string;
  range?: string;
  components?: string;
  duration?: string;
  concentration: boolean;
  ritual: boolean;
  prepared: boolean;
  alwaysPrepared: boolean;
  source?: string;
  /** HTML from D&D Beyond. Sanitize before rendering. */
  description: string;
}

export interface SpellcastingInfo {
  source: string;
  ability: AbilityKey;
  saveDc: number;
  attackBonus: number;
}

export interface SpellSlotLevel {
  level: number;
  max: number;
  used: number;
  pact?: boolean;
}

export interface Feature {
  name: string;
  source: string;
  /** HTML from D&D Beyond. Sanitize before rendering. */
  description: string;
}

export interface InventoryEntry {
  name: string;
  quantity: number;
  equipped: boolean;
  attuned: boolean;
  weight?: number;
  magic?: boolean;
  rarity?: string;
}

export interface Defenses {
  resistances: string[];
  immunities: string[];
  vulnerabilities: string[];
  conditionImmunities: string[];
}

interface SheetBase {
  kind: ActorKind;
  ddbId: number;
  name: string;
  avatarUrl?: string;
  /** Link to the actor on dndbeyond.com. */
  url?: string;
  fetchedAt: number;
  /**
   * "ddb" when the headline numbers came straight from D&D Beyond's own
   * calculations, "estimated" when this extension had to compute them.
   */
  accuracy: "ddb" | "estimated";
  ac: number;
  acNote?: string;
  hp: HitPoints;
  initiative: number;
  speeds: Speed[];
  abilities: AbilityScore[];
  skills: SkillScore[];
  senses: Sense[];
  passivePerception: number;
  defenses: Defenses;
  languages: string[];
  /** Grid cells the token should cover (0.5 tiny, 1 medium, 2 large, ...). */
  sizeCells: number;
  proficiencyBonus: number;
}

export interface CharacterSheet extends SheetBase {
  kind: "character";
  level: number;
  classSummary: string;
  race: string;
  background?: string;
  userId?: number;
  campaign?: { id: number; name: string };
  passiveInsight: number;
  passiveInvestigation: number;
  inspiration: boolean;
  deathSaves: { successes: number; failures: number };
  conditions: string[];
  exhaustion: number;
  hitDice: string;
  attacks: Attack[];
  actions: ActionEntry[];
  spellcasting: SpellcastingInfo[];
  spellSlots: SpellSlotLevel[];
  spells: SpellEntry[];
  features: Feature[];
  inventory: InventoryEntry[];
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number };
  proficiencies: { armor: string[]; weapons: string[]; tools: string[] };
  notes: { label: string; text: string }[];
}

export interface StatBlockSection {
  title: string;
  /** HTML from D&D Beyond. Sanitize before rendering. */
  html: string;
}

export interface MonsterSheet extends SheetBase {
  kind: "monster";
  meta: string;
  challenge: string;
  xp?: number;
  hitDice?: string;
  sections: StatBlockSection[];
  isHomebrew: boolean;
  /** False when the user does not own the source book on D&D Beyond. */
  hasFullAccess: boolean;
}

export type ActorSheet = CharacterSheet | MonsterSheet;

/**
 * Compact summary stored in an Owlbear item's metadata. Kept deliberately small:
 * every client receives every item change, and Owlbear limits metadata size.
 * The full sheet is fetched or shared on demand (see store/sheets.ts).
 */
export interface ActorLink {
  v: 1;
  kind: ActorKind;
  ddbId: number;
  name: string;
  hp: HitPoints;
  /** Last HP value we saw on D&D Beyond; used to detect changes made there. */
  ddbHp?: HitPoints;
  ac: number;
  initiativeBonus: number;
  passivePerception: number;
  /** Rolled initiative for the combat tracker. */
  initiative?: number | null;
  conditions?: string[];
  avatarUrl?: string;
  updatedAt: number;
}

export function linkFromSheet(sheet: ActorSheet, previous?: ActorLink): ActorLink {
  return {
    v: 1,
    kind: sheet.kind,
    ddbId: sheet.ddbId,
    name: sheet.name,
    hp: previous?.kind === sheet.kind && sheet.kind === "monster" ? previous.hp : { ...sheet.hp },
    ddbHp: sheet.kind === "character" ? { ...sheet.hp } : undefined,
    ac: sheet.ac,
    initiativeBonus: sheet.initiative,
    passivePerception: sheet.passivePerception,
    initiative: previous?.initiative ?? null,
    conditions: sheet.kind === "character" ? sheet.conditions : previous?.conditions ?? [],
    avatarUrl: sheet.avatarUrl,
    updatedAt: Date.now(),
  };
}

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function hpStatus(hp: HitPoints): "Healthy" | "Injured" | "Bloodied" | "Down" {
  if (hp.current <= 0) return "Down";
  if (hp.current <= hp.max / 2) return "Bloodied";
  if (hp.current < hp.max) return "Injured";
  return "Healthy";
}

/** Damage (positive) or heal (negative) with temp HP absorbing damage first. */
export function applyDamage(hp: HitPoints, amount: number): HitPoints {
  if (amount >= 0) {
    const fromTemp = Math.min(hp.temp, amount);
    return { ...hp, temp: hp.temp - fromTemp, current: Math.max(0, hp.current - (amount - fromTemp)) };
  }
  return { ...hp, current: Math.min(hp.max, hp.current - amount) };
}

/**
 * A plain deep copy. Owlbear's updateItems() hands out Immer draft proxies, which
 * structuredClone() can't copy; JSON round-tripping reads through them safely.
 */
export function plain<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}
