import { describe, expect, it } from "vitest";
import { absolutizeDdbUrl, parseCampaignId, parseCharacterId, parseEncounterId, parseMonsterId } from "../src/ddb/ids";

describe("link parsing", () => {
  it("reads character ids from links people paste", () => {
    expect(parseCharacterId("12345678")).toBe(12345678);
    expect(parseCharacterId("https://www.dndbeyond.com/characters/12345678")).toBe(12345678);
    expect(parseCharacterId("https://www.dndbeyond.com/characters/12345678/AbC1d2")).toBe(12345678);
    expect(parseCharacterId("dndbeyond.com/profile/someone/characters/12345678")).toBe(12345678);
    expect(parseCharacterId("https://character-service.dndbeyond.com/character/v5/character/12345678")).toBe(12345678);
    expect(parseCharacterId("https://evil.example/characters/12345678")).toBeNull();
    expect(parseCharacterId("hello")).toBeNull();
  });

  it("reads monster, encounter and campaign ids", () => {
    expect(parseMonsterId("https://www.dndbeyond.com/monsters/16907-goblin")).toBe(16907);
    expect(parseMonsterId("16907")).toBe(16907);
    expect(parseEncounterId("https://www.dndbeyond.com/encounters/0b6d3a7e-1111-4222-8333-944455556666")).toBe(
      "0b6d3a7e-1111-4222-8333-944455556666",
    );
    expect(parseEncounterId("nope")).toBeNull();
    expect(parseCampaignId("https://www.dndbeyond.com/campaigns/1234567")).toBe(1234567);
  });

  it("makes D&D Beyond relative links absolute", () => {
    expect(absolutizeDdbUrl("/spells/fireball")).toBe("https://www.dndbeyond.com/spells/fireball");
    expect(absolutizeDdbUrl("//www.dndbeyond.com/x")).toBe("https://www.dndbeyond.com/x");
    expect(absolutizeDdbUrl("https://example.com/a")).toBe("https://example.com/a");
  });
});
