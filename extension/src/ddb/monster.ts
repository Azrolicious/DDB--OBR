/**
 * D&D Beyond monster-service JSON -> MonsterSheet, and encounter-service JSON ->
 * a small normalized encounter shape.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AbilityScore, MonsterSheet, Sense, SkillScore, Speed, StatBlockSection } from "../model/sheet";
import { abilityMod } from "../model/sheet";
import { lookup, type DdbConfig } from "./config";
import { ABILITIES, SIZE_CELLS, abilityById } from "./rules";

type Raw = any;

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function list<T = Raw>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function formatChallenge(value: number): string {
  if (value === 0.125) return "1/8";
  if (value === 0.25) return "1/4";
  if (value === 0.5) return "1/2";
  return String(value);
}

/** Proficiency bonus by CR when the config feed is unavailable (SRD rule). */
function pbForChallenge(cr: number): number {
  return Math.max(2, Math.floor((Math.max(cr, 1) - 1) / 4) + 2);
}

const SECTION_FIELDS: [string, string][] = [
  ["specialTraitsDescription", "Traits"],
  ["actionsDescription", "Actions"],
  ["bonusActionsDescription", "Bonus Actions"],
  ["reactionsDescription", "Reactions"],
  ["legendaryActionsDescription", "Legendary Actions"],
  ["mythicActionsDescription", "Mythic Actions"],
  ["lairDescription", "Lair Actions"],
];

export function parseMonster(raw: Raw, config: DdbConfig | null): MonsterSheet {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "number") {
    throw new Error("That doesn't look like D&D Beyond monster data.");
  }
  const crEntry = lookup(config, "challengeRatings", raw.challengeRatingId);
  const crValue = crEntry ? num(crEntry.value) : NaN;
  const pb = crEntry?.proficiencyBonus ? num(crEntry.proficiencyBonus) : pbForChallenge(Number.isFinite(crValue) ? crValue : 1);

  const scores = Object.fromEntries(
    ABILITIES.map((a) => [a.key, num(list(raw.stats).find((s: Raw) => s.statId === a.id)?.value, 10)]),
  );
  const abilities: AbilityScore[] = ABILITIES.map((a) => {
    const score = scores[a.key];
    const save = list(raw.savingThrows).find((s: Raw) => s.statId === a.id);
    const mod = abilityMod(score);
    return {
      key: a.key,
      label: a.label,
      score,
      mod,
      saveProficient: !!save,
      save: save ? mod + pb + num(save.bonusModifier) : mod,
    };
  });

  const skills: SkillScore[] = list(raw.skills).map((s: Raw) => {
    const def = lookup(config, "abilitySkills", s.skillId);
    const ability = abilityById(def?.stat) ?? ABILITIES[0];
    return {
      name: def?.name ?? `Skill ${s.skillId}`,
      ability: ability.key,
      mod: num(s.value) + num(s.additionalBonus),
      proficiency: "proficient",
    };
  });
  skills.sort((a, b) => a.name.localeCompare(b.name));

  const speeds: Speed[] = list(raw.movements).map((m: Raw) => ({
    type: lookup(config, "movements", m.movementId)?.name ?? (m.movementId === 1 ? "Walk" : `Speed ${m.movementId}`),
    feet: num(m.speed),
  }));

  const senses: Sense[] = list(raw.senses).map((s: Raw) => ({
    name: lookup(config, "senses", s.senseId)?.name ?? `Sense ${s.senseId}`,
    value: String(s.notes ?? ""),
  }));

  const adjustments = list<number>(raw.damageAdjustments).map((id) => lookup(config, "damageAdjustments", id));
  const byType = (type: number) =>
    adjustments.filter((a) => a && num(a.type) === type).map((a) => String(a!.name));

  const languages = list(raw.languages).map((l: Raw) => {
    const name = lookup(config, "languages", l.languageId)?.name ?? `Language ${l.languageId}`;
    return l.notes ? `${name} ${l.notes}` : name;
  });
  if (raw.languageNote) languages.push(String(raw.languageNote));

  const size = SIZE_CELLS[num(raw.sizeId)];
  const sizeName = lookup(config, "creatureSizes", raw.sizeId)?.name ?? size?.name ?? "";
  const typeName = lookup(config, "monsterTypes", raw.typeId)?.name ?? "";
  const subTypes = list<number>(raw.subTypes)
    .map((id) => lookup(config, "monsterSubTypes", id)?.name)
    .filter(Boolean);
  const alignment = lookup(config, "alignments", raw.alignmentId)?.name ?? "";
  const meta = [
    [sizeName, typeName].filter(Boolean).join(" ") + (subTypes.length ? ` (${subTypes.join(", ")})` : ""),
    alignment,
  ]
    .filter(Boolean)
    .join(", ");

  const sections: StatBlockSection[] = SECTION_FIELDS.filter(([field]) => typeof raw[field] === "string" && raw[field].trim()).map(
    ([field, title]) => ({ title, html: raw[field] as string }),
  );

  const dex = abilityMod(scores.dex);
  return {
    kind: "monster",
    ddbId: raw.id,
    name: String(raw.name ?? "Monster"),
    avatarUrl: raw.avatarUrl || raw.largeAvatarUrl || raw.basicAvatarUrl || undefined,
    url: raw.url || `https://www.dndbeyond.com/monsters/${raw.id}`,
    fetchedAt: Date.now(),
    accuracy: "ddb",
    ac: num(raw.armorClass, 10),
    acNote: raw.armorClassDescription ? String(raw.armorClassDescription).replace(/^\(|\)$/g, "").trim() : undefined,
    hp: { current: num(raw.averageHitPoints, 1), max: num(raw.averageHitPoints, 1), temp: 0 },
    hitDice: raw.hitPointDice?.diceString ?? undefined,
    initiative: raw.initiativeBonus !== null && raw.initiativeBonus !== undefined ? num(raw.initiativeBonus) : dex,
    speeds,
    abilities,
    skills,
    senses,
    passivePerception: num(raw.passivePerception, 10 + abilityMod(scores.wis)),
    defenses: {
      resistances: byType(1),
      immunities: byType(2),
      vulnerabilities: byType(3),
      conditionImmunities: list<number>(raw.conditionImmunities)
        .map((id) => lookup(config, "conditions", id)?.name)
        .filter((n): n is string => !!n),
    },
    languages,
    sizeCells: size?.cells ?? 1,
    proficiencyBonus: pb,
    meta,
    challenge: Number.isFinite(crValue) ? formatChallenge(crValue) : "?",
    xp: crEntry?.xp ? num(crEntry.xp) : undefined,
    sections,
    isHomebrew: !!raw.isHomebrew,
    hasFullAccess: !!(raw.isReleased || raw.isHomebrew),
  };
}

// ---------------------------------------------------------------- encounters

export interface EncounterSummary {
  id: string;
  name: string;
  campaignName?: string;
  monsterCount: number;
  modified?: string;
}

export interface EncounterMonster {
  /** Stable key for this row, used to track what has already been placed. */
  key: string;
  monsterId: number;
  name?: string;
  quantity: number;
  groupId?: string;
  order: number;
}

export interface EncounterGroup {
  id: string;
  name?: string;
  order: number;
}

export interface EncounterDetail {
  id: string;
  name: string;
  campaignId?: number;
  campaignName?: string;
  groups: EncounterGroup[];
  monsters: EncounterMonster[];
  playerCharacterIds: number[];
}

function monsterRows(raw: Raw): EncounterMonster[] {
  return list(raw?.monsters)
    .filter((m: Raw) => m?.id !== null && m?.id !== undefined && Number(m.id) > 0)
    .map((m: Raw, index: number) => ({
      key: String(m.uniqueId ?? `${m.groupId ?? "g"}:${m.id}:${index}`),
      monsterId: Number(m.id),
      name: m.name ?? undefined,
      quantity: Math.max(1, num(m.quantity, 1)),
      groupId: m.groupId ?? undefined,
      order: num(m.order, index),
    }));
}

export function summarizeEncounter(raw: Raw): EncounterSummary {
  return {
    id: String(raw.id),
    name: String(raw.name || "Untitled encounter"),
    campaignName: raw.campaign?.name ?? undefined,
    monsterCount: monsterRows(raw).reduce((n, m) => n + m.quantity, 0),
    modified: raw.dateModified ?? raw.lastModified ?? raw.modifiedDate ?? undefined,
  };
}

export function normalizeEncounter(raw: Raw): EncounterDetail {
  if (!raw || typeof raw !== "object" || !raw.id) throw new Error("Encounter data was empty.");
  return {
    id: String(raw.id),
    name: String(raw.name || "Untitled encounter"),
    campaignId: raw.campaign?.id ?? raw.campaignId ?? undefined,
    campaignName: raw.campaign?.name ?? undefined,
    groups: list(raw.groups)
      .map((g: Raw, index: number) => ({ id: String(g.id), name: g.name ?? undefined, order: num(g.order, index) }))
      .sort((a, b) => a.order - b.order),
    monsters: monsterRows(raw).sort((a, b) => a.order - b.order),
    playerCharacterIds: list(raw.players)
      .map((p: Raw) => Number(p?.id ?? p?.characterId))
      .filter((id) => Number.isFinite(id) && id > 0),
  };
}
