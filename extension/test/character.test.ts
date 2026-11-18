import { describe, expect, it } from "vitest";
import { parseCharacter, unwrapCharacterJson } from "../src/ddb/character";
import { dwarfFighter, multiclassCaster } from "./fixtures/characters";

describe("parseCharacter — armored fighter", () => {
  const sheet = parseCharacter({ success: true, data: dwarfFighter() });
  const ability = (key: string) => sheet.abilities.find((a) => a.key === key)!;
  const skill = (name: string) => sheet.skills.find((s) => s.name === name)!;

  it("reads identity", () => {
    expect(sheet.name).toBe("Brunhild Ironfist");
    expect(sheet.level).toBe(5);
    expect(sheet.classSummary).toBe("Fighter (Champion) 5");
    expect(sheet.race).toBe("Hill Dwarf");
    expect(sheet.background).toBe("Soldier");
    expect(sheet.campaign).toEqual({ id: 777, name: "Lost Mine" });
    expect(sheet.userId).toBe(9001);
    expect(sheet.accuracy).toBe("estimated");
  });

  it("applies racial and ASI bonuses to ability scores", () => {
    expect(sheet.abilities.map((a) => [a.key, a.score, a.mod])).toEqual([
      ["str", 17, 3],
      ["dex", 12, 1],
      ["con", 16, 3],
      ["int", 10, 0],
      ["wis", 14, 2],
      ["cha", 8, -1],
    ]);
    expect(sheet.proficiencyBonus).toBe(3);
  });

  it("computes hit points including per-level racial bonus", () => {
    expect(sheet.hp).toEqual({ current: 44, max: 54, temp: 3 });
    expect(sheet.hitDice).toBe("4/5d10");
  });

  it("computes AC from armor, shield, fighting style and attuned items only", () => {
    // 16 chain + 1 defense + 2 shield + 1 cloak (the ring isn't attuned)
    expect(sheet.ac).toBe(20);
    expect(sheet.acNote).toBe("Chain Mail, Shield");
  });

  it("computes saves with proficiency and item bonuses", () => {
    expect(ability("str").save).toBe(7);
    expect(ability("str").saveProficient).toBe(true);
    expect(ability("dex").save).toBe(2);
    expect(ability("con").save).toBe(7);
    expect(ability("cha").save).toBe(0);
  });

  it("computes skills, passives and initiative", () => {
    expect(skill("Athletics")).toMatchObject({ mod: 6, proficiency: "proficient" });
    expect(skill("Perception").mod).toBe(5);
    expect(skill("Stealth").mod).toBe(1);
    expect(sheet.passivePerception).toBe(15);
    expect(sheet.initiative).toBe(1);
  });

  it("reads speed, senses, defenses, languages and proficiencies", () => {
    expect(sheet.speeds).toEqual([{ type: "Walk", feet: 25 }]);
    expect(sheet.senses).toEqual([{ name: "Darkvision", value: "60 ft." }]);
    expect(sheet.defenses.resistances).toEqual(["Poison"]);
    expect(sheet.languages).toEqual(["Common", "Dwarvish"]);
    expect(sheet.proficiencies.armor).toEqual(["Heavy Armor", "Light Armor", "Medium Armor", "Shields"]);
    expect(sheet.proficiencies.weapons).toEqual(["Battleaxe", "Martial Weapons", "Simple Weapons"]);
    expect(sheet.proficiencies.tools).toEqual(["Smith's Tools"]);
  });

  it("builds weapon attacks", () => {
    const longsword = sheet.attacks.find((a) => a.name === "Longsword")!;
    expect(longsword).toMatchObject({ toHit: 6, damage: "1d8+3", damageType: "Slashing", range: "5 ft. reach" });
    expect(longsword.notes).toContain("Versatile (1d10)");
    expect(sheet.attacks.find((a) => a.name === "Unarmed Strike")).toMatchObject({ toHit: 6, damage: "4" });
  });

  it("reads actions with limited uses", () => {
    expect(sheet.actions).toEqual([
      expect.objectContaining({ name: "Second Wind", activation: "Bonus Action", uses: { max: 1, used: 0, reset: "Short Rest" } }),
    ]);
  });

  it("lists features available at the current level, skipping hidden ones", () => {
    expect(sheet.features.map((f) => `${f.source}: ${f.name}`)).toEqual([
      "Fighter: Second Wind",
      "Fighter: Extra Attack",
      "Hill Dwarf: Dwarven Resilience",
      "Soldier: Military Rank",
    ]);
  });

  it("reads conditions, inventory, currency and notes", () => {
    expect(sheet.conditions).toEqual(["Poisoned"]);
    expect(sheet.inspiration).toBe(true);
    expect(sheet.inventory).toHaveLength(7);
    expect(sheet.inventory.find((i) => i.name === "Cloak of Protection")).toMatchObject({ equipped: true, attuned: true });
    expect(sheet.currency.gp).toBe(50);
    expect(sheet.notes.map((n) => n.label)).toEqual(["Personality Traits", "Backstory"]);
  });

  it("prefers D&D Beyond's own computed numbers when a summary is supplied", () => {
    const withSummary = parseCharacter(dwarfFighter(), {
      armorClass: 21,
      hitPointInfo: { current: 40, maximum: 55, temp: 0 },
      passivePerception: 16,
      initiativeBonus: 4,
      speeds: [{ name: "Walking", distance: 30 }, { name: "Swimming", distance: 15 }],
      abilities: [{ name: "str", score: 18, modifier: 4, save: 8 }],
    });
    expect(withSummary.accuracy).toBe("ddb");
    expect(withSummary.ac).toBe(21);
    expect(withSummary.hp).toEqual({ current: 40, max: 55, temp: 0 });
    expect(withSummary.passivePerception).toBe(16);
    expect(withSummary.initiative).toBe(4);
    expect(withSummary.speeds).toEqual([{ type: "Walk", feet: 30 }, { type: "Swim", feet: 15 }]);
    expect(withSummary.abilities[0]).toMatchObject({ score: 18, mod: 4, save: 8 });
  });
});

describe("parseCharacter — rules edge cases", () => {
  it("applies Jack of All Trades to unproficient skills and initiative", () => {
    const raw = dwarfFighter();
    raw.modifiers.class.push({ type: "half-proficiency", subType: "ability-checks", value: null });
    const sheet = parseCharacter(raw);
    expect(sheet.skills.find((s) => s.name === "Stealth")).toMatchObject({ mod: 2, proficiency: "half" });
    expect(sheet.skills.find((s) => s.name === "Athletics")!.mod).toBe(6);
    expect(sheet.initiative).toBe(2);
  });

  it("applies expertise", () => {
    const raw = dwarfFighter();
    raw.modifiers.class.push({ type: "expertise", subType: "athletics", value: null });
    expect(parseCharacter(raw).skills.find((s) => s.name === "Athletics")).toMatchObject({ mod: 9, proficiency: "expertise" });
  });

  it("uses unarmored defense when no armor is worn", () => {
    const raw = dwarfFighter();
    raw.inventory = raw.inventory.filter((i: { definition: { armorTypeId?: number } }) => !i.definition.armorTypeId);
    raw.modifiers.class.push({ type: "set", subType: "unarmored-armor-class", value: null, statId: 3 });
    const sheet = parseCharacter(raw);
    // 10 + DEX 1 + CON 3 + cloak 1
    expect(sheet.ac).toBe(15);
    expect(sheet.acNote).toBe("Unarmored Defense");
  });

  it("honours overrides set on the D&D Beyond sheet", () => {
    const raw = dwarfFighter();
    raw.overrideHitPoints = 99;
    raw.overrideStats[0].value = 20;
    raw.characterValues = [{ typeId: 1, value: 25 }];
    const sheet = parseCharacter(raw);
    expect(sheet.hp.max).toBe(99);
    expect(sheet.abilities[0].score).toBe(20);
    expect(sheet.ac).toBe(25);
  });

  it("ignores modifiers from unequipped items", () => {
    const raw = dwarfFighter();
    raw.inventory.find((i: { definition: { id: number } }) => i.definition.id === 2004).equipped = false;
    expect(parseCharacter(raw).ac).toBe(19);
  });

  it("rejects JSON that isn't a character", () => {
    expect(() => unwrapCharacterJson({ hello: "world" })).toThrow(/character JSON/);
  });
});

describe("parseCharacter — multiclass caster", () => {
  const sheet = parseCharacter(multiclassCaster());

  it("combines multiclass spell slots and tracks used slots", () => {
    expect(sheet.spellSlots).toEqual([
      { level: 1, max: 4, used: 1 },
      { level: 2, max: 3, used: 0 },
      { level: 3, max: 2, used: 0 },
    ]);
  });

  it("computes spell DCs and attack bonuses per class", () => {
    expect(sheet.spellcasting).toEqual([
      { source: "Wizard", ability: "int", saveDc: 14, attackBonus: 6 },
      { source: "Cleric", ability: "wis", saveDc: 13, attackBonus: 5 },
    ]);
  });

  it("lists class and granted spells with prepared flags", () => {
    expect(sheet.spells.map((s) => [s.name, s.level, s.prepared])).toEqual([
      ["Fire Bolt", 0, true],
      ["Guidance", 0, true],
      ["Light", 0, true],
      ["Bless", 1, true],
      ["Magic Missile", 1, true],
      ["Shield", 1, false],
    ]);
    const bolt = sheet.spells.find((s) => s.name === "Fire Bolt")!;
    expect(bolt).toMatchObject({ castingTime: "Action", range: "120 ft.", components: "V, S", duration: "Instantaneous", source: "Wizard" });
    expect(sheet.spells.find((s) => s.name === "Light")!.source).toBe("Race");
  });

  it("uses 10 + DEX without armor and computes HP from CON", () => {
    expect(sheet.ac).toBe(12);
    expect(sheet.hp.max).toBe(31);
    expect(sheet.abilities.find((a) => a.key === "int")!.save).toBe(6);
  });
});
