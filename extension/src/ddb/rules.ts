import type { AbilityKey } from "../model/sheet";

/** D&D Beyond stat ids 1-6, in order. */
export const ABILITIES: { id: number; key: AbilityKey; label: string; slug: string }[] = [
  { id: 1, key: "str", label: "Strength", slug: "strength" },
  { id: 2, key: "dex", label: "Dexterity", slug: "dexterity" },
  { id: 3, key: "con", label: "Constitution", slug: "constitution" },
  { id: 4, key: "int", label: "Intelligence", slug: "intelligence" },
  { id: 5, key: "wis", label: "Wisdom", slug: "wisdom" },
  { id: 6, key: "cha", label: "Charisma", slug: "charisma" },
];

export function abilityById(id: number | null | undefined) {
  return ABILITIES.find((a) => a.id === id);
}

export const SKILLS: { name: string; slug: string; ability: AbilityKey }[] = [
  { name: "Acrobatics", slug: "acrobatics", ability: "dex" },
  { name: "Animal Handling", slug: "animal-handling", ability: "wis" },
  { name: "Arcana", slug: "arcana", ability: "int" },
  { name: "Athletics", slug: "athletics", ability: "str" },
  { name: "Deception", slug: "deception", ability: "cha" },
  { name: "History", slug: "history", ability: "int" },
  { name: "Insight", slug: "insight", ability: "wis" },
  { name: "Intimidation", slug: "intimidation", ability: "cha" },
  { name: "Investigation", slug: "investigation", ability: "int" },
  { name: "Medicine", slug: "medicine", ability: "wis" },
  { name: "Nature", slug: "nature", ability: "int" },
  { name: "Perception", slug: "perception", ability: "wis" },
  { name: "Performance", slug: "performance", ability: "cha" },
  { name: "Persuasion", slug: "persuasion", ability: "cha" },
  { name: "Religion", slug: "religion", ability: "int" },
  { name: "Sleight of Hand", slug: "sleight-of-hand", ability: "dex" },
  { name: "Stealth", slug: "stealth", ability: "dex" },
  { name: "Survival", slug: "survival", ability: "wis" },
];

/** D&D Beyond condition ids (used when the config feed is unavailable). */
export const CONDITIONS: Record<number, string> = {
  1: "Blinded",
  2: "Charmed",
  3: "Deafened",
  4: "Exhaustion",
  5: "Frightened",
  6: "Grappled",
  7: "Incapacitated",
  8: "Invisible",
  9: "Paralyzed",
  10: "Petrified",
  11: "Poisoned",
  12: "Prone",
  13: "Restrained",
  14: "Stunned",
  15: "Unconscious",
};

export const CONDITION_SLUGS = new Set(
  Object.values(CONDITIONS).map((c) => c.toLowerCase()),
);

/** D&D Beyond creature size ids -> token footprint in grid cells. */
export const SIZE_CELLS: Record<number, { name: string; cells: number }> = {
  2: { name: "Tiny", cells: 0.5 },
  3: { name: "Small", cells: 1 },
  4: { name: "Medium", cells: 1 },
  5: { name: "Large", cells: 2 },
  6: { name: "Huge", cells: 3 },
  7: { name: "Gargantuan", cells: 4 },
};

/** Multiclass spellcaster table (SRD), indexed by caster level 0-20. */
export const CASTER_SLOTS: number[][] = [
  [],
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

export const ACTIVATION_TYPES: Record<number, string> = {
  1: "Action",
  2: "No Action",
  3: "Bonus Action",
  4: "Reaction",
  5: "Special",
  6: "Minute",
  7: "Hour",
  8: "Special",
};

export const RESET_TYPES: Record<number, string> = {
  1: "Short Rest",
  2: "Long Rest",
  3: "Dawn",
  4: "Other",
};

export const SPELL_COMPONENTS: Record<number, string> = { 1: "V", 2: "S", 3: "M" };

export function proficiencyBonusForLevel(level: number): number {
  return Math.floor((Math.max(1, level) - 1) / 4) + 2;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
