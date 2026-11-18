import { describe, expect, it } from "vitest";
import type { DdbConfig } from "../src/ddb/config";
import { normalizeEncounter, parseMonster, summarizeEncounter } from "../src/ddb/monster";

// Ids in this config are made up for the test; real values come from D&D Beyond.
const config: DdbConfig = {
  challengeRatings: [{ id: 3, value: 0.25, proficiencyBonus: 2, xp: 50 }],
  abilitySkills: [{ id: 14, name: "Stealth", stat: 2 }],
  senses: [{ id: 1, name: "Darkvision" }],
  movements: [{ id: 1, name: "Walk" }, { id: 4, name: "Fly" }],
  creatureSizes: [{ id: 3, name: "Small" }],
  monsterTypes: [{ id: 10, name: "Humanoid" }],
  monsterSubTypes: [{ id: 20, name: "Goblinoid" }],
  alignments: [{ id: 7, name: "Neutral Evil" }],
  damageAdjustments: [{ id: 5, name: "Fire", type: 1 }, { id: 6, name: "Poison", type: 2 }],
  conditions: [{ definition: { id: 11, name: "Poisoned" } }],
  languages: [{ id: 1, name: "Common" }, { id: 2, name: "Goblin" }],
};

const goblin = {
  id: 16907,
  name: "Goblin",
  avatarUrl: "https://example.invalid/goblin.jpg",
  url: "https://www.dndbeyond.com/monsters/16907-goblin",
  sizeId: 3,
  typeId: 10,
  subTypes: [20],
  alignmentId: 7,
  armorClass: 15,
  armorClassDescription: "(leather armor, shield)",
  averageHitPoints: 7,
  hitPointDice: { diceString: "2d6" },
  movements: [{ movementId: 1, speed: 30 }],
  stats: [8, 14, 10, 10, 8, 8].map((value, i) => ({ statId: i + 1, value })),
  savingThrows: [{ statId: 2, bonusModifier: 0 }],
  skills: [{ skillId: 14, value: 6, additionalBonus: null }],
  senses: [{ senseId: 1, notes: "60 ft." }],
  passivePerception: 9,
  damageAdjustments: [5, 6],
  conditionImmunities: [11],
  languages: [{ languageId: 1 }, { languageId: 2 }],
  challengeRatingId: 3,
  actionsDescription: "<p><strong>Scimitar.</strong> +4 to hit, reach 5 ft. <em>Hit:</em> 5 (1d6 + 2) slashing damage.</p>",
  specialTraitsDescription: "<p><strong>Nimble Escape.</strong> Disengage or Hide as a bonus action.</p>",
  isReleased: true,
};

describe("parseMonster", () => {
  const sheet = parseMonster(goblin, config);

  it("reads the stat block", () => {
    expect(sheet).toMatchObject({
      kind: "monster",
      ddbId: 16907,
      name: "Goblin",
      ac: 15,
      acNote: "leather armor, shield",
      hp: { current: 7, max: 7, temp: 0 },
      hitDice: "2d6",
      initiative: 2,
      passivePerception: 9,
      challenge: "1/4",
      xp: 50,
      proficiencyBonus: 2,
      sizeCells: 1,
      meta: "Small Humanoid (Goblinoid), Neutral Evil",
      hasFullAccess: true,
    });
  });

  it("computes saves, skills, senses and defenses", () => {
    expect(sheet.abilities.find((a) => a.key === "dex")).toMatchObject({ score: 14, mod: 2, save: 4, saveProficient: true });
    expect(sheet.abilities.find((a) => a.key === "str")).toMatchObject({ mod: -1, save: -1 });
    expect(sheet.skills).toEqual([{ name: "Stealth", ability: "dex", mod: 6, proficiency: "proficient" }]);
    expect(sheet.senses).toEqual([{ name: "Darkvision", value: "60 ft." }]);
    expect(sheet.defenses).toEqual({ resistances: ["Fire"], immunities: ["Poison"], vulnerabilities: [], conditionImmunities: ["Poisoned"] });
    expect(sheet.languages).toEqual(["Common", "Goblin"]);
    expect(sheet.sections.map((s) => s.title)).toEqual(["Traits", "Actions"]);
  });

  it("works without the config feed", () => {
    const bare = parseMonster(goblin, null);
    expect(bare.challenge).toBe("?");
    expect(bare.speeds).toEqual([{ type: "Walk", feet: 30 }]);
    expect(bare.meta).toBe("Small");
  });

  it("maps creature size to token footprint and prefers an explicit initiative bonus", () => {
    expect(parseMonster({ ...goblin, sizeId: 5 }, config).sizeCells).toBe(2);
    expect(parseMonster({ ...goblin, sizeId: 7 }, config).sizeCells).toBe(4);
    expect(parseMonster({ ...goblin, initiativeBonus: 5 }, config).initiative).toBe(5);
  });
});

describe("encounters", () => {
  const raw = {
    id: "0B6D3A7E-1111-4222-8333-944455556666",
    name: "Goblin Ambush",
    campaign: { id: 777, name: "Lost Mine" },
    groups: [
      { id: "g2", name: "Reinforcements", order: 1 },
      { id: "g1", name: "Ambushers", order: 0 },
    ],
    monsters: [
      { id: 16907, quantity: 4, groupId: "g1", order: 0, uniqueId: "u1" },
      { id: 16908, quantity: 1, groupId: "g2", order: 1 },
      { id: null, quantity: 1 },
    ],
    players: [{ id: 101 }, { id: 202 }],
  };

  it("normalizes groups, monsters and players", () => {
    const enc = normalizeEncounter(raw);
    expect(enc.groups.map((g) => g.name)).toEqual(["Ambushers", "Reinforcements"]);
    expect(enc.monsters).toEqual([
      { key: "u1", monsterId: 16907, name: undefined, quantity: 4, groupId: "g1", order: 0 },
      { key: "g2:16908:1", monsterId: 16908, name: undefined, quantity: 1, groupId: "g2", order: 1 },
    ]);
    expect(enc.playerCharacterIds).toEqual([101, 202]);
    expect(enc.campaignId).toBe(777);
  });

  it("summarizes for the list view", () => {
    expect(summarizeEncounter(raw)).toMatchObject({ name: "Goblin Ambush", monsterCount: 5, campaignName: "Lost Mine" });
  });
});
