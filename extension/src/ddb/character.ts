/**
 * D&D Beyond character JSON (character-service v5) -> CharacterSheet.
 *
 * D&D Beyond stores a character as raw choices plus "modifiers" granted by race,
 * class, background, feats and items; the numbers you see on the sheet are
 * computed by their front end. This module re-derives the common numbers (ability
 * scores, HP, AC, saves, skills, attacks, spell DCs, slots). Edge cases exist, so
 * when the companion bridge is installed we prefer D&D Beyond's own computed
 * values (the "summary" argument), and mark the sheet "estimated" otherwise.
 *
 * DDB JSON is untyped and changes over time, so this file reads it defensively.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  AbilityKey,
  AbilityScore,
  ActionEntry,
  Attack,
  CharacterSheet,
  Feature,
  InventoryEntry,
  ProficiencyLevel,
  Sense,
  SkillScore,
  Speed,
  SpellEntry,
  SpellSlotLevel,
  SpellcastingInfo,
} from "../model/sheet";
import { abilityMod } from "../model/sheet";
import { characterUrl } from "./ids";
import {
  ABILITIES,
  ACTIVATION_TYPES,
  CASTER_SLOTS,
  CONDITIONS,
  CONDITION_SLUGS,
  RESET_TYPES,
  SKILLS,
  SPELL_COMPONENTS,
  abilityById,
  proficiencyBonusForLevel,
  slugify,
} from "./rules";

type Raw = any;

const SPEED_NAMES: Record<string, string> = {
  Walking: "Walk",
  Flying: "Fly",
  Swimming: "Swim",
  Climbing: "Climb",
  Burrowing: "Burrow",
};

/** SRD weapon names as D&D Beyond slugs, used to sort proficiencies into "weapons". */
const WEAPON_SLUGS = new Set(
  [
    "club", "dagger", "greatclub", "handaxe", "javelin", "light hammer", "mace", "quarterstaff", "sickle", "spear",
    "light crossbow", "dart", "shortbow", "sling", "battleaxe", "flail", "glaive", "greataxe", "greatsword",
    "halberd", "lance", "longsword", "maul", "morningstar", "pike", "rapier", "scimitar", "shortsword", "trident",
    "war pick", "warhammer", "whip", "blowgun", "hand crossbow", "heavy crossbow", "longbow", "net",
  ].flatMap((w) => [slugify(w), slugify(`${w}s`)]),
);

interface Mod {
  type: string;
  subType: string;
  value: number | null;
  statId: number | null;
  friendlySubtypeName?: string;
  componentId?: number;
  source: string;
}

/** Unwraps `{ success, data }` envelopes and validates the basic shape. */
export function unwrapCharacterJson(input: unknown): Raw {
  let raw: Raw = input;
  if (raw && typeof raw === "object" && "data" in raw && raw.data && typeof raw.data === "object") {
    raw = raw.data;
  }
  if (!raw || typeof raw !== "object" || typeof raw.id !== "number" || !Array.isArray(raw.stats)) {
    throw new Error("That doesn't look like D&D Beyond character JSON (missing id/stats).");
  }
  return raw;
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function list<T = Raw>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** Gathers every modifier that currently applies (item modifiers need the item equipped/attuned). */
function collectModifiers(raw: Raw): Mod[] {
  const out: Mod[] = [];
  const inventory = list(raw.inventory);
  const groups = raw.modifiers && typeof raw.modifiers === "object" ? raw.modifiers : {};
  for (const [source, mods] of Object.entries(groups)) {
    for (const m of list(mods)) {
      if (!m || typeof m.type !== "string") continue;
      if (source === "item") {
        const item = inventory.find((i: Raw) => i?.definition?.id === m.componentId);
        if (!item || !item.equipped) continue;
        const needsAttunement = m.requiresAttunement ?? item.definition?.canAttune ?? false;
        if (needsAttunement && !item.isAttuned) continue;
      }
      out.push({
        type: m.type,
        subType: String(m.subType ?? ""),
        value: m.value ?? m.fixedValue ?? null,
        statId: m.statId ?? null,
        friendlySubtypeName: m.friendlySubtypeName,
        componentId: m.componentId,
        source,
      });
    }
  }
  return out;
}

class ModifierSet {
  constructor(
    private mods: Mod[],
    private abilityMods: () => Record<AbilityKey, number>,
  ) {}

  find(type: string, subType?: string): Mod[] {
    return this.mods.filter((m) => m.type === type && (subType === undefined || m.subType === subType));
  }

  has(type: string, subType: string): boolean {
    return this.mods.some((m) => m.type === type && m.subType === subType);
  }

  /** A modifier's numeric value; some modifiers add an ability modifier instead of a number. */
  valueOf(m: Mod): number {
    if (m.value !== null && m.value !== undefined) return num(m.value);
    const ability = abilityById(m.statId);
    return ability ? this.abilityMods()[ability.key] : 0;
  }

  bonus(...subTypes: string[]): number {
    return sum(this.mods.filter((m) => m.type === "bonus" && subTypes.includes(m.subType)).map((m) => this.valueOf(m)));
  }

  all(): Mod[] {
    return this.mods;
  }
}

function classLevelForComponent(raw: Raw, componentId: number | undefined): number | null {
  if (componentId === undefined) return null;
  for (const cls of list(raw.classes)) {
    if (list(cls.classFeatures).some((f: Raw) => f?.definition?.id === componentId)) return num(cls.level, 0);
  }
  return null;
}

function computeAbilities(raw: Raw, mods: Mod[]): Record<AbilityKey, number> {
  const scores = {} as Record<AbilityKey, number>;
  for (const ability of ABILITIES) {
    const base = num(list(raw.stats).find((s: Raw) => s.id === ability.id)?.value, 10);
    const bonus = num(list(raw.bonusStats).find((s: Raw) => s.id === ability.id)?.value, 0);
    const override = list(raw.overrideStats).find((s: Raw) => s.id === ability.id)?.value;
    const slug = `${ability.slug}-score`;
    const modBonus = sum(mods.filter((m) => m.type === "bonus" && m.subType === slug).map((m) => num(m.value)));
    const setTo = Math.max(0, ...mods.filter((m) => m.type === "set" && m.subType === slug).map((m) => num(m.value)));
    const total = base + bonus + modBonus;
    scores[ability.key] = override !== null && override !== undefined ? num(override, total) : Math.max(total, setTo);
  }
  return scores;
}

function proficiencyFor(set: ModifierSet, slug: string, abilitySlug: string): ProficiencyLevel {
  if (set.has("expertise", slug)) return "expertise";
  if (set.has("proficiency", slug)) return "proficient";
  if (
    set.has("half-proficiency", slug) ||
    set.has("half-proficiency", "ability-checks") ||
    set.has("half-proficiency-round-up", slug) ||
    set.has("half-proficiency-round-up", `${abilitySlug}-ability-checks`)
  ) {
    return "half";
  }
  return "none";
}

function proficiencyAmount(level: ProficiencyLevel, pb: number, roundUp = false): number {
  switch (level) {
    case "expertise":
      return pb * 2;
    case "proficient":
      return pb;
    case "half":
      return roundUp ? Math.ceil(pb / 2) : Math.floor(pb / 2);
    default:
      return 0;
  }
}

function computeArmorClass(raw: Raw, set: ModifierSet, mods: Record<AbilityKey, number>): { ac: number; note: string } {
  const equipped = list(raw.inventory).filter((i: Raw) => i?.equipped && i.definition);
  const armor = equipped.find((i: Raw) => [1, 2, 3].includes(num(i.definition.armorTypeId)));
  const shield = equipped.find((i: Raw) => num(i.definition.armorTypeId) === 4);
  let ac: number;
  let note: string;
  if (armor) {
    const type = num(armor.definition.armorTypeId);
    const dex = type === 1 ? mods.dex : type === 2 ? Math.min(mods.dex, 2) : 0;
    ac = num(armor.definition.armorClass, 10) + dex + set.bonus("armored-armor-class");
    note = armor.definition.name;
  } else {
    const dex = set.has("ignore", "unarmored-dex-ac-bonus") ? 0 : mods.dex;
    const options = set
      .find("set", "unarmored-armor-class")
      .map((m) => 10 + dex + (abilityById(m.statId) ? mods[abilityById(m.statId)!.key] : 0) + num(m.value));
    ac = Math.max(10 + dex, ...options) + set.bonus("unarmored-armor-class");
    note = options.length ? "Unarmored Defense" : "Unarmored";
  }
  if (shield) {
    ac += num(shield.definition.armorClass, 2);
    note += ", Shield";
  }
  ac += set.bonus("armor-class");

  // Manual adjustments made on the DDB sheet. typeId 1 = override, 2 = magic bonus, 3 = misc bonus.
  const values = list(raw.characterValues);
  const override = values.find((v: Raw) => v.typeId === 1 && v.value !== null);
  if (override) return { ac: num(override.value, ac), note: "Override" };
  ac += sum(values.filter((v: Raw) => (v.typeId === 2 || v.typeId === 3) && v.value !== null).map((v: Raw) => num(v.value)));
  return { ac, note };
}

function computeSpeeds(raw: Raw, set: ModifierSet, wearingArmor: boolean): Speed[] {
  const base = raw.race?.weightSpeeds?.normal ?? {};
  let walk = num(base.walk, 30);
  const setWalk = set.find("set", "innate-speed-walking").map((m) => num(m.value));
  if (setWalk.length) walk = Math.max(walk, ...setWalk);
  walk += set.bonus("speed", "speed-walking");
  if (!wearingArmor) walk += set.bonus("unarmored-movement");

  const speeds: Speed[] = [{ type: "Walk", feet: walk }];
  const others: [string, string][] = [
    ["Fly", "fly"],
    ["Swim", "swim"],
    ["Climb", "climb"],
    ["Burrow", "burrow"],
  ];
  for (const [label, key] of others) {
    let feet = num(base[key], 0);
    const subType = `innate-speed-${key === "fly" ? "flying" : key === "swim" ? "swimming" : key === "climb" ? "climbing" : "burrowing"}`;
    for (const m of set.find("set", subType)) feet = Math.max(feet, m.value === null ? walk : num(m.value));
    if (feet > 0) speeds.push({ type: label, feet: feet + set.bonus(`speed-${key === "fly" ? "flying" : key}`) });
  }
  return speeds;
}

function computeSenses(set: ModifierSet): Sense[] {
  const senses = new Map<string, number>();
  for (const m of set.all()) {
    if (m.type !== "set-base" && m.type !== "sense") continue;
    if (!["darkvision", "blindsight", "tremorsense", "truesight"].includes(m.subType)) continue;
    senses.set(m.subType, Math.max(senses.get(m.subType) ?? 0, num(m.value)));
  }
  return [...senses.entries()]
    .filter(([, feet]) => feet > 0)
    .map(([name, feet]) => ({ name: name[0].toUpperCase() + name.slice(1), value: `${feet} ft.` }));
}

function spellSlotsFor(raw: Raw): SpellSlotLevel[] {
  const casters = list(raw.classes).filter(
    (c: Raw) => c.definition?.canCastSpells || c.subclassDefinition?.canCastSpells,
  );
  const usedSlots = list(raw.spellSlots);
  const slots: SpellSlotLevel[] = [];
  const nonPact = casters.filter((c: Raw) => c.definition?.name !== "Warlock");

  let table: number[] = [];
  if (nonPact.length === 1) {
    const c = nonPact[0];
    const rules = c.definition?.spellRules ?? c.subclassDefinition?.spellRules;
    table = list<number>(list(rules?.levelSpellSlots)[num(c.level)]);
  } else if (nonPact.length > 1) {
    let casterLevel = 0;
    for (const c of nonPact) {
      const rules = c.definition?.spellRules ?? c.subclassDefinition?.spellRules;
      const divisor = num(rules?.multiClassSpellSlotDivisor, 1) || 1;
      const lvl = num(c.level) / divisor;
      casterLevel += c.definition?.name === "Artificer" ? Math.ceil(lvl) : Math.floor(lvl);
    }
    table = CASTER_SLOTS[Math.min(20, casterLevel)] ?? [];
  }
  table.forEach((max, index) => {
    if (max > 0) {
      const level = index + 1;
      slots.push({ level, max, used: num(usedSlots.find((s: Raw) => s.level === level)?.used) });
    }
  });
  if (!slots.length) {
    // Fall back to DDB's own "available" counts when present.
    for (const s of usedSlots) {
      if (num(s.available) > 0) slots.push({ level: num(s.level), max: num(s.available), used: num(s.used) });
    }
  }

  const warlock = casters.find((c: Raw) => c.definition?.name === "Warlock");
  if (warlock) {
    const row = list<number>(list(warlock.definition?.spellRules?.levelSpellSlots)[num(warlock.level)]);
    const level = row.findIndex((n) => n > 0) + 1;
    if (level > 0) {
      const used = num(list(raw.pactMagic).find((p: Raw) => p.level === level)?.used);
      slots.push({ level, max: row[level - 1], used, pact: true });
    }
  }
  return slots;
}

function describeRange(range: Raw): string | undefined {
  if (!range) return undefined;
  const origin = range.origin as string | undefined;
  let text = origin === "Ranged" ? `${num(range.rangeValue)} ft.` : origin ?? "";
  if (range.aoeType && range.aoeValue) text += ` (${range.aoeValue} ft. ${String(range.aoeType).toLowerCase()})`;
  return text || undefined;
}

function describeDuration(duration: Raw): string | undefined {
  if (!duration) return undefined;
  if (duration.durationType === "Instantaneous" || duration.durationType === "Special") return duration.durationType;
  if (duration.durationType === "Until Dispelled") return "Until dispelled";
  const interval = num(duration.durationInterval, 0);
  const unit = duration.durationUnit ? String(duration.durationUnit).toLowerCase() : "";
  const amount = interval && unit ? `${interval} ${unit}${interval > 1 ? "s" : ""}` : duration.durationType ?? "";
  return duration.durationType === "Concentration" ? `Concentration, up to ${amount}` : amount || undefined;
}

function describeActivation(activation: Raw): string | undefined {
  if (!activation) return undefined;
  const type = ACTIVATION_TYPES[num(activation.activationType)];
  if (!type) return undefined;
  const time = num(activation.activationTime, 1);
  if (type === "Minute" || type === "Hour") return `${time} ${type.toLowerCase()}${time > 1 ? "s" : ""}`;
  return time > 1 ? `${time} ${type}s` : type;
}

function parseSpell(entry: Raw, source: string, forcePrepared: boolean): SpellEntry | null {
  const def = entry?.definition;
  if (!def?.name) return null;
  const components = list<number>(def.components)
    .map((c) => SPELL_COMPONENTS[c])
    .filter(Boolean)
    .join(", ");
  const level = num(def.level);
  return {
    name: def.name,
    level,
    school: def.school,
    castingTime: describeActivation(def.activation),
    range: describeRange(def.range),
    components: components + (def.componentsDescription ? ` (${def.componentsDescription})` : ""),
    duration: describeDuration(def.duration),
    concentration: !!def.concentration,
    ritual: !!def.ritual,
    prepared: forcePrepared || level === 0 || !!entry.prepared || !!entry.alwaysPrepared,
    alwaysPrepared: forcePrepared || !!entry.alwaysPrepared,
    source,
    description: String(def.description ?? ""),
  };
}

function weaponProficient(set: ModifierSet, def: Raw): boolean {
  const candidates = [
    def.categoryId === 1 ? "simple-weapons" : def.categoryId === 2 ? "martial-weapons" : "",
    def.type ? slugify(String(def.type)) : "",
    def.name ? slugify(String(def.name)) : "",
  ].filter(Boolean);
  return set.all().some((m) => m.type === "proficiency" && candidates.includes(m.subType));
}

function computeAttacks(raw: Raw, set: ModifierSet, mods: Record<AbilityKey, number>, pb: number): Attack[] {
  const attacks: Attack[] = [];
  const isMonk = list(raw.classes).some((c: Raw) => c.definition?.name === "Monk");
  const weapons = list(raw.inventory).filter((i: Raw) => i?.definition?.filterType === "Weapon");
  const equipped = weapons.filter((i: Raw) => i.equipped);
  for (const item of equipped.length ? equipped : weapons) {
    const def = item.definition;
    const props = list(def.properties).map((p: Raw) => String(p?.name ?? ""));
    const ranged = num(def.attackType) === 2;
    let ability = ranged ? mods.dex : mods.str;
    if (props.includes("Finesse") || (isMonk && def.isMonkWeapon)) ability = Math.max(mods.str, mods.dex);
    const magic = sum(
      list(def.grantedModifiers)
        .filter((m: Raw) => m.type === "bonus" && m.subType === "magic")
        .map((m: Raw) => num(m.value)),
    );
    const toHit =
      ability +
      (weaponProficient(set, def) ? pb : 0) +
      magic +
      set.bonus(ranged ? "ranged-weapon-attacks" : "melee-weapon-attacks", "weapon-attacks");
    const damageBonus = ability + magic + set.bonus(ranged ? "ranged-weapon-damage" : "melee-weapon-damage");
    const dice = def.damage?.diceString ?? (def.fixedDamage ? String(def.fixedDamage) : undefined);
    const versatile = list(def.properties).find((p: Raw) => p?.name === "Versatile")?.notes;
    const thrown = props.includes("Thrown");
    attacks.push({
      name: def.name + (equipped.length ? "" : " (not equipped)"),
      toHit,
      damage: dice ? `${dice}${damageBonus ? (damageBonus > 0 ? `+${damageBonus}` : `${damageBonus}`) : ""}` : undefined,
      damageType: def.damageType ?? undefined,
      range:
        ranged || thrown
          ? `${num(def.range, 5)}/${num(def.longRange, num(def.range, 5))} ft.`
          : `${props.includes("Reach") ? 10 : 5} ft. reach`,
      notes: [versatile ? `Versatile (${versatile})` : "", ...props.filter((p) => p !== "Versatile")]
        .filter(Boolean)
        .join(", "),
    });
  }
  const unarmed = 1 + mods.str;
  attacks.push({
    name: "Unarmed Strike",
    toHit: mods.str + pb + set.bonus("melee-weapon-attacks"),
    damage: `${Math.max(1, unarmed)}`,
    damageType: "Bludgeoning",
    range: "5 ft. reach",
  });
  return attacks;
}

function computeActions(raw: Raw, mods: Record<AbilityKey, number>, pb: number): ActionEntry[] {
  const entries: ActionEntry[] = [];
  const groups = raw.actions && typeof raw.actions === "object" ? raw.actions : {};
  for (const [source, actions] of Object.entries(groups)) {
    for (const a of list(actions)) {
      if (!a?.name) continue;
      const limited = a.limitedUse;
      let uses: ActionEntry["uses"];
      if (limited) {
        let max = num(limited.maxUses, 0);
        const stat = abilityById(limited.statModifierUsesId);
        if (stat) max += mods[stat.key];
        if (limited.useProficiencyBonus) max += pb;
        if (max > 0) {
          uses = { max, used: num(limited.numberUsed), reset: RESET_TYPES[num(limited.resetType)] };
        }
      }
      entries.push({
        name: a.name,
        activation: describeActivation(a.activation),
        description: String(a.description ?? a.snippet ?? ""),
        uses,
        source: source[0].toUpperCase() + source.slice(1),
      });
    }
  }
  return entries;
}

function computeFeatures(raw: Raw): Feature[] {
  const features: Feature[] = [];
  for (const cls of list(raw.classes)) {
    const className = cls.definition?.name ?? "Class";
    for (const f of list(cls.classFeatures)) {
      const def = f?.definition;
      if (!def?.name || def.hideInSheet) continue;
      if (num(def.requiredLevel, 1) > num(cls.level, 1)) continue;
      features.push({ name: def.name, source: className, description: String(def.description ?? def.snippet ?? "") });
    }
  }
  for (const t of list(raw.race?.racialTraits)) {
    const def = t?.definition;
    if (!def?.name || def.hideInSheet) continue;
    features.push({ name: def.name, source: raw.race?.fullName ?? "Species", description: String(def.description ?? "") });
  }
  for (const feat of list(raw.feats)) {
    const def = feat?.definition;
    if (!def?.name) continue;
    features.push({ name: def.name, source: "Feat", description: String(def.description ?? def.snippet ?? "") });
  }
  const bg = raw.background?.definition ?? raw.background?.customBackground;
  if (bg?.featureName) {
    features.push({ name: bg.featureName, source: bg.name ?? "Background", description: String(bg.featureDescription ?? "") });
  }
  // DDB repeats some features per level; keep the first occurrence.
  const seen = new Set<string>();
  return features.filter((f) => {
    const key = `${f.source}|${f.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function computeInventory(raw: Raw): InventoryEntry[] {
  const items: InventoryEntry[] = list(raw.inventory)
    .filter((i: Raw) => i?.definition?.name)
    .map((i: Raw) => ({
      name: i.definition.name,
      quantity: num(i.quantity, 1),
      equipped: !!i.equipped,
      attuned: !!i.isAttuned,
      weight: i.definition.weight ? num(i.definition.weight) : undefined,
      magic: !!i.definition.magic,
      rarity: i.definition.rarity,
    }));
  for (const c of list(raw.customItems)) {
    if (c?.name) items.push({ name: c.name, quantity: num(c.quantity, 1), equipped: false, attuned: false, weight: c.weight ?? undefined });
  }
  return items;
}

/**
 * Overlay for D&D Beyond's computed "short character" data
 * (character-service-scds /v2/characters). Only available through the bridge.
 */
function applySummary(sheet: CharacterSheet, summary: Raw): CharacterSheet {
  if (!summary || typeof summary !== "object") return sheet;
  const s = { ...sheet };
  if (Number.isFinite(summary.armorClass)) s.ac = summary.armorClass;
  const hp = summary.hitPointInfo;
  if (hp && Number.isFinite(hp.maximum)) {
    s.hp = { current: num(hp.current, s.hp.current), max: num(hp.maximum), temp: num(hp.temp) };
  }
  if (Array.isArray(summary.abilities)) {
    s.abilities = s.abilities.map((a) => {
      const match = summary.abilities.find((x: Raw) => x?.name === a.key);
      return match ? { ...a, score: num(match.score, a.score), mod: num(match.modifier, a.mod), save: num(match.save, a.save) } : a;
    });
  }
  if (Number.isFinite(summary.passivePerception)) s.passivePerception = summary.passivePerception;
  if (Number.isFinite(summary.passiveInsight)) s.passiveInsight = summary.passiveInsight;
  if (Number.isFinite(summary.passiveInvestigation)) s.passiveInvestigation = summary.passiveInvestigation;
  if (Number.isFinite(summary.proficiencyBonus)) s.proficiencyBonus = summary.proficiencyBonus;
  if (Number.isFinite(summary.initiativeBonus)) s.initiative = summary.initiativeBonus;
  if (Array.isArray(summary.speeds) && summary.speeds.length) {
    s.speeds = summary.speeds
      .filter((x: Raw) => num(x?.distance) > 0)
      .map((x: Raw) => ({ type: SPEED_NAMES[String(x.name)] ?? String(x.name ?? "Walk"), feet: num(x.distance) }));
  }
  if (Array.isArray(summary.senses) && summary.senses.length) {
    s.senses = summary.senses.map((x: Raw) => ({ name: String(x.name), value: String(x.distance ?? "") }));
  }
  const dcs = summary.castingInfo?.saveDcs;
  if (Array.isArray(dcs) && dcs.length && s.spellcasting.length) {
    s.spellcasting = s.spellcasting.map((c) => {
      const match = dcs.find((d: Raw) => list(d.sources).some((src: Raw) => String(src).includes(c.source)));
      return match ? { ...c, saveDc: num(match.value, c.saveDc) } : c;
    });
  }
  s.accuracy = "ddb";
  return s;
}

export function parseCharacter(input: unknown, summary?: unknown): CharacterSheet {
  const raw = unwrapCharacterJson(input);
  const modList = collectModifiers(raw);
  const scores = computeAbilities(raw, modList);
  const mods = Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, abilityMod(v)])) as Record<AbilityKey, number>;
  const set = new ModifierSet(modList, () => mods);

  const classes = list(raw.classes);
  const level = Math.max(1, sum(classes.map((c: Raw) => num(c.level))));
  const pb = proficiencyBonusForLevel(level);

  const abilities: AbilityScore[] = ABILITIES.map((a) => {
    const proficient = set.has("proficiency", `${a.slug}-saving-throws`);
    return {
      key: a.key,
      label: a.label,
      score: scores[a.key],
      mod: mods[a.key],
      saveProficient: proficient,
      save: mods[a.key] + (proficient ? pb : 0) + set.bonus("saving-throws", `${a.slug}-saving-throws`),
    };
  });

  const skills: SkillScore[] = SKILLS.map((skill) => {
    const abilitySlug = ABILITIES.find((a) => a.key === skill.ability)!.slug;
    const proficiency = proficiencyFor(set, skill.slug, abilitySlug);
    const roundUp = set.has("half-proficiency-round-up", `${abilitySlug}-ability-checks`);
    return {
      name: skill.name,
      ability: skill.ability,
      proficiency,
      mod:
        mods[skill.ability] +
        proficiencyAmount(proficiency, pb, roundUp) +
        set.bonus(skill.slug, "ability-checks", `${abilitySlug}-ability-checks`),
    };
  });
  const skillMod = (name: string) => skills.find((s) => s.name === name)?.mod ?? 0;

  // Hit points
  let perLevel = 0;
  for (const m of set.find("bonus", "hit-points-per-level")) {
    perLevel += set.valueOf(m) * (m.source === "class" ? classLevelForComponent(raw, m.componentId) ?? level : level);
  }
  const computedMax =
    num(raw.baseHitPoints) + num(raw.bonusHitPoints) + mods.con * level + perLevel + set.bonus("hit-points");
  const maxHp = raw.overrideHitPoints ? num(raw.overrideHitPoints) : Math.max(1, computedMax);
  const hp = {
    current: Math.max(0, maxHp - num(raw.removedHitPoints)),
    max: maxHp,
    temp: num(raw.temporaryHitPoints),
  };

  const wearingArmor = list(raw.inventory).some(
    (i: Raw) => i?.equipped && [1, 2, 3].includes(num(i.definition?.armorTypeId)),
  );
  const { ac, note: acNote } = computeArmorClass(raw, set, mods);

  const initProf = set.has("proficiency", "initiative")
    ? pb
    : set.has("half-proficiency", "initiative") || set.has("half-proficiency", "ability-checks")
      ? Math.floor(pb / 2)
      : 0;
  const initiative = mods.dex + initProf + set.bonus("initiative", "ability-checks", "dexterity-ability-checks");

  // Defenses, languages, proficiencies
  const named = (type: string) => set.find(type).map((m) => m.friendlySubtypeName ?? m.subType);
  const immunityMods = set.find("immunity");
  const defenses = {
    resistances: uniq(named("resistance")),
    vulnerabilities: uniq(named("vulnerability")),
    immunities: uniq(immunityMods.filter((m) => !CONDITION_SLUGS.has(m.subType)).map((m) => m.friendlySubtypeName ?? m.subType)),
    conditionImmunities: uniq(
      immunityMods.filter((m) => CONDITION_SLUGS.has(m.subType)).map((m) => m.friendlySubtypeName ?? m.subType),
    ),
  };
  const skillSlugs = new Set(SKILLS.map((s) => s.slug));
  const profMods = set
    .find("proficiency")
    .filter((m) => !skillSlugs.has(m.subType) && !m.subType.endsWith("-saving-throws") && m.subType !== "initiative");
  const armorProfs = profMods.filter((m) => /armor|shields/.test(m.subType));
  const weaponProfs = profMods.filter((m) => /weapons$/.test(m.subType) || WEAPON_SLUGS.has(m.subType));
  const toolProfs = profMods.filter((m) => !armorProfs.includes(m) && !weaponProfs.includes(m));
  const label = (m: Mod) => m.friendlySubtypeName ?? m.subType;

  // Spellcasting
  const spellcasting: SpellcastingInfo[] = [];
  for (const cls of classes) {
    const abilityId = cls.subclassDefinition?.spellCastingAbilityId ?? cls.definition?.spellCastingAbilityId;
    const ability = abilityById(abilityId);
    if (!ability || !(cls.definition?.canCastSpells || cls.subclassDefinition?.canCastSpells)) continue;
    spellcasting.push({
      source: cls.definition?.name ?? "Class",
      ability: ability.key,
      saveDc: 8 + pb + mods[ability.key] + set.bonus("spell-save-dc"),
      attackBonus: pb + mods[ability.key] + set.bonus("spell-attacks"),
    });
  }

  const spells: SpellEntry[] = [];
  for (const group of list(raw.classSpells)) {
    const cls = classes.find((c: Raw) => c.id === group.characterClassId);
    for (const entry of list(group.spells)) {
      const spell = parseSpell(entry, cls?.definition?.name ?? "Class", false);
      if (spell) spells.push(spell);
    }
  }
  const granted = raw.spells && typeof raw.spells === "object" ? raw.spells : {};
  for (const [source, entries] of Object.entries(granted)) {
    for (const entry of list(entries)) {
      const spell = parseSpell(entry, source[0].toUpperCase() + source.slice(1), true);
      if (spell) spells.push(spell);
    }
  }
  spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  const conditions = list(raw.conditions)
    .map((c: Raw) => CONDITIONS[num(c.id)])
    .filter((c): c is string => !!c && c !== "Exhaustion");
  const exhaustion = num(list(raw.conditions).find((c: Raw) => num(c.id) === 4)?.level, 0);

  const hitDice = classes
    .map((c: Raw) => `${num(c.level) - num(c.hitDiceUsed)}/${num(c.level)}d${num(c.definition?.hitDice, 8)}`)
    .join(" + ");

  const notes: { label: string; text: string }[] = [];
  const traitLabels: Record<string, string> = {
    personalityTraits: "Personality Traits",
    ideals: "Ideals",
    bonds: "Bonds",
    flaws: "Flaws",
    appearance: "Appearance",
  };
  for (const [key, labelText] of Object.entries(traitLabels)) {
    if (raw.traits?.[key]) notes.push({ label: labelText, text: String(raw.traits[key]) });
  }
  const noteLabels: Record<string, string> = {
    backstory: "Backstory",
    allies: "Allies",
    enemies: "Enemies",
    organizations: "Organizations",
    personalPossessions: "Possessions",
    otherHoldings: "Other Holdings",
    otherNotes: "Other Notes",
  };
  for (const [key, labelText] of Object.entries(noteLabels)) {
    if (raw.notes?.[key]) notes.push({ label: labelText, text: String(raw.notes[key]) });
  }

  const campaign = raw.campaign?.id ? { id: num(raw.campaign.id), name: String(raw.campaign.name ?? "Campaign") } : undefined;

  const sheet: CharacterSheet = {
    kind: "character",
    ddbId: raw.id,
    name: String(raw.name ?? "Unnamed Character"),
    avatarUrl: raw.decorations?.avatarUrl || raw.avatarUrl || undefined,
    url: raw.readonlyUrl || characterUrl(raw.id),
    fetchedAt: Date.now(),
    accuracy: "estimated",
    ac,
    acNote,
    hp,
    initiative,
    speeds: computeSpeeds(raw, set, wearingArmor),
    abilities,
    skills,
    senses: computeSenses(set),
    passivePerception: 10 + skillMod("Perception") + set.bonus("passive-perception"),
    passiveInsight: 10 + skillMod("Insight") + set.bonus("passive-insight"),
    passiveInvestigation: 10 + skillMod("Investigation") + set.bonus("passive-investigation"),
    defenses,
    languages: uniq(named("language")),
    sizeCells: 1,
    proficiencyBonus: pb,
    level,
    classSummary: classes
      .map((c: Raw) => `${c.definition?.name ?? "?"}${c.subclassDefinition?.name ? ` (${c.subclassDefinition.name})` : ""} ${num(c.level)}`)
      .join(" / "),
    race: String(raw.race?.fullName ?? raw.race?.baseName ?? ""),
    background: raw.background?.definition?.name ?? raw.background?.customBackground?.name ?? undefined,
    userId: raw.userId ?? undefined,
    campaign,
    inspiration: !!raw.inspiration,
    deathSaves: { successes: num(raw.deathSaves?.successCount), failures: num(raw.deathSaves?.failCount) },
    conditions,
    exhaustion,
    hitDice,
    attacks: computeAttacks(raw, set, mods, pb),
    actions: computeActions(raw, mods, pb),
    spellcasting,
    spellSlots: spellSlotsFor(raw),
    spells,
    features: computeFeatures(raw),
    inventory: computeInventory(raw),
    currency: {
      cp: num(raw.currencies?.cp),
      sp: num(raw.currencies?.sp),
      ep: num(raw.currencies?.ep),
      gp: num(raw.currencies?.gp),
      pp: num(raw.currencies?.pp),
    },
    proficiencies: {
      armor: uniq(armorProfs.map(label)),
      weapons: uniq(weaponProfs.map(label)),
      tools: uniq(toolProfs.map(label)),
    },
    notes,
  };
  return summary ? applySummary(sheet, summary) : sheet;
}
