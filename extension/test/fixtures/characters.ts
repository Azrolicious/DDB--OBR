/**
 * Hand-written, synthetic characters in D&D Beyond's character-service v5 shape.
 * They only contain the fields our parser reads; real exports have many more.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const stats = (values: number[]) => values.map((value, i) => ({ id: i + 1, name: null, value }));
const empty = () => [1, 2, 3, 4, 5, 6].map((id) => ({ id, name: null, value: null }));
const mod = (type: string, subType: string, value: number | null, extra: Record<string, unknown> = {}) => ({
  type,
  subType,
  value,
  friendlySubtypeName: subType
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" "),
  ...extra,
});

/** Hill Dwarf Fighter 5 in chain mail and shield, with an attuned Cloak of Protection. */
export function dwarfFighter(): any {
  return {
    id: 101,
    userId: 9001,
    name: "Brunhild Ironfist",
    readonlyUrl: "https://www.dndbeyond.com/characters/101",
    decorations: { avatarUrl: "https://example.invalid/brunhild.png" },
    race: {
      fullName: "Hill Dwarf",
      baseName: "Dwarf",
      weightSpeeds: { normal: { walk: 25, fly: 0, swim: 0, climb: 0, burrow: 0 } },
      racialTraits: [
        { definition: { name: "Dwarven Resilience", description: "<p>Advantage on saves against poison.</p>" } },
        { definition: { name: "Hidden Trait", description: "", hideInSheet: true } },
      ],
    },
    classes: [
      {
        id: 1,
        level: 5,
        hitDiceUsed: 1,
        definition: { name: "Fighter", hitDice: 10, canCastSpells: false, spellCastingAbilityId: null },
        subclassDefinition: { name: "Champion" },
        classFeatures: [
          { definition: { id: 501, name: "Second Wind", requiredLevel: 1, description: "<p>Regain 1d10 + 5 HP.</p>" } },
          { definition: { id: 502, name: "Extra Attack", requiredLevel: 5, description: "<p>Attack twice.</p>" } },
          { definition: { id: 503, name: "Indomitable", requiredLevel: 9, description: "<p>Reroll a save.</p>" } },
        ],
      },
    ],
    stats: stats([15, 12, 14, 10, 13, 8]),
    bonusStats: empty(),
    overrideStats: empty(),
    baseHitPoints: 34,
    bonusHitPoints: null,
    overrideHitPoints: null,
    removedHitPoints: 10,
    temporaryHitPoints: 3,
    inspiration: true,
    deathSaves: { failCount: 0, successCount: 0 },
    conditions: [{ id: 11, level: null }],
    currencies: { cp: 1, sp: 2, ep: 0, gp: 50, pp: 0 },
    traits: { personalityTraits: "Stubborn.", ideals: null },
    notes: { backstory: "Forged in the mountain.", allies: null },
    background: { definition: { name: "Soldier", featureName: "Military Rank", featureDescription: "<p>Soldiers defer to you.</p>" } },
    campaign: { id: 777, name: "Lost Mine" },
    characterValues: [],
    inventory: [
      { id: 1, equipped: true, quantity: 1, isAttuned: false, definition: { id: 2001, name: "Chain Mail", filterType: "Armor", armorTypeId: 3, armorClass: 16, weight: 55 } },
      { id: 2, equipped: true, quantity: 1, isAttuned: false, definition: { id: 2002, name: "Shield", filterType: "Armor", armorTypeId: 4, armorClass: 2, weight: 6 } },
      {
        id: 3,
        equipped: true,
        quantity: 1,
        isAttuned: false,
        definition: {
          id: 2003,
          name: "Longsword",
          filterType: "Weapon",
          categoryId: 2,
          type: "Longsword",
          attackType: 1,
          range: 5,
          longRange: 5,
          damage: { diceString: "1d8" },
          damageType: "Slashing",
          properties: [{ name: "Versatile", notes: "1d10" }],
          grantedModifiers: [],
        },
      },
      { id: 4, equipped: true, quantity: 1, isAttuned: true, definition: { id: 2004, name: "Cloak of Protection", canAttune: true, magic: true } },
      { id: 5, equipped: true, quantity: 1, isAttuned: false, definition: { id: 2005, name: "Ring of Protection", canAttune: true, magic: true } },
      { id: 6, equipped: false, quantity: 10, isAttuned: false, definition: { id: 2006, name: "Rations", weight: 2 } },
    ],
    customItems: [{ name: "Lucky Pebble", quantity: 1 }],
    modifiers: {
      race: [
        mod("bonus", "constitution-score", 2),
        mod("bonus", "wisdom-score", 1),
        mod("bonus", "hit-points-per-level", 1),
        mod("set-base", "darkvision", 60),
        mod("resistance", "poison", null),
        mod("language", "common", null),
        mod("language", "dwarvish", null),
        mod("proficiency", "battleaxe", null),
        mod("proficiency", "smiths-tools", null, { friendlySubtypeName: "Smith's Tools" }),
      ],
      class: [
        mod("bonus", "strength-score", 2),
        mod("proficiency", "strength-saving-throws", null),
        mod("proficiency", "constitution-saving-throws", null),
        mod("proficiency", "athletics", null),
        mod("proficiency", "perception", null),
        mod("proficiency", "light-armor", null),
        mod("proficiency", "medium-armor", null),
        mod("proficiency", "heavy-armor", null),
        mod("proficiency", "shields", null),
        mod("proficiency", "simple-weapons", null),
        mod("proficiency", "martial-weapons", null),
        mod("bonus", "armored-armor-class", 1),
      ],
      background: [],
      feat: [],
      item: [
        mod("bonus", "armor-class", 1, { componentId: 2004, requiresAttunement: true }),
        mod("bonus", "saving-throws", 1, { componentId: 2004, requiresAttunement: true }),
        mod("bonus", "armor-class", 1, { componentId: 2005, requiresAttunement: true }),
      ],
      condition: [],
    },
    actions: {
      class: [
        {
          name: "Second Wind",
          description: "<p>Regain 1d10 + 5 hit points.</p>",
          activation: { activationType: 3, activationTime: 1 },
          limitedUse: { maxUses: 1, numberUsed: 0, resetType: 1 },
        },
      ],
      race: [],
    },
    feats: [],
    spells: { race: [], class: [], item: [], feat: [] },
    classSpells: [],
    spellSlots: [],
    pactMagic: [],
  };
}

const slotTable = (rows: Record<number, number[]>) => {
  const table: number[][] = Array.from({ length: 21 }, () => [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  for (const [level, slots] of Object.entries(rows)) slots.forEach((n, i) => (table[Number(level)][i] = n));
  return table;
};

/** Wizard 3 / Cleric 2 multiclass, no armor. */
export function multiclassCaster(): any {
  const spell = (name: string, level: number, extra: Record<string, unknown> = {}) => ({
    prepared: false,
    alwaysPrepared: false,
    definition: {
      name,
      level,
      school: "Evocation",
      activation: { activationType: 1, activationTime: 1 },
      range: { origin: "Ranged", rangeValue: 120 },
      duration: { durationType: "Instantaneous" },
      components: [1, 2],
      concentration: false,
      ritual: false,
      description: `<p>${name} deals 3d6 fire damage.</p>`,
    },
    ...extra,
  });
  return {
    id: 202,
    name: "Elowen",
    decorations: {},
    race: { fullName: "High Elf", weightSpeeds: { normal: { walk: 30 } }, racialTraits: [] },
    classes: [
      {
        id: 11,
        level: 3,
        hitDiceUsed: 0,
        definition: {
          name: "Wizard",
          hitDice: 6,
          canCastSpells: true,
          spellCastingAbilityId: 4,
          spellRules: { multiClassSpellSlotDivisor: 1, levelSpellSlots: slotTable({ 3: [4, 2] }) },
        },
        classFeatures: [],
      },
      {
        id: 12,
        level: 2,
        hitDiceUsed: 0,
        definition: {
          name: "Cleric",
          hitDice: 8,
          canCastSpells: true,
          spellCastingAbilityId: 5,
          spellRules: { multiClassSpellSlotDivisor: 1, levelSpellSlots: slotTable({ 2: [3] }) },
        },
        classFeatures: [],
      },
    ],
    stats: [
      { id: 1, value: 8 },
      { id: 2, value: 14 },
      { id: 3, value: 13 },
      { id: 4, value: 16 },
      { id: 5, value: 14 },
      { id: 6, value: 10 },
    ],
    bonusStats: [],
    overrideStats: [],
    baseHitPoints: 26,
    removedHitPoints: 0,
    temporaryHitPoints: 0,
    inventory: [],
    modifiers: { race: [], class: [mod("proficiency", "intelligence-saving-throws", null), mod("proficiency", "wisdom-saving-throws", null)] },
    actions: {},
    classSpells: [
      { characterClassId: 11, spells: [spell("Fire Bolt", 0), spell("Magic Missile", 1, { prepared: true }), spell("Shield", 1)] },
      { characterClassId: 12, spells: [spell("Guidance", 0), spell("Bless", 1, { alwaysPrepared: true })] },
    ],
    spells: { race: [spell("Light", 0)] },
    spellSlots: [
      { level: 1, used: 1, available: 0 },
      { level: 2, used: 0, available: 0 },
    ],
    pactMagic: [],
    conditions: [],
    characterValues: [],
  };
}
