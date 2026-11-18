import { describe, expect, it } from "vitest";
import { critExpression, d20, isValidExpression, roll } from "../src/dice/dice";
import { applyDamage } from "../src/model/sheet";

/** Deterministic rng returning the given die faces for a d20 (or any die). */
function faces(...values: number[]) {
  let i = 0;
  return () => (values[i++ % values.length] - 1) / 20 + 0.0001;
}

describe("dice", () => {
  it("validates expressions", () => {
    expect(isValidExpression("1d20+5")).toBe(true);
    expect(isValidExpression("2d6 + 1d4 - 1")).toBe(true);
    expect(isValidExpression("d20")).toBe(true);
    expect(isValidExpression("1d20+")).toBe(false);
    expect(isValidExpression("alert(1)")).toBe(false);
  });

  it("rolls and totals terms", () => {
    const r = roll("1d20+5", "normal", faces(12));
    expect(r.total).toBe(17);
    expect(r.breakdown).toBe("[12] + 5");
  });

  it("subtracts negative terms", () => {
    expect(roll("1d20-2", "normal", faces(10)).total).toBe(8);
  });

  it("keeps the higher die with advantage and the lower with disadvantage", () => {
    expect(roll("1d20+1", "advantage", faces(4, 15)).total).toBe(16);
    expect(roll("1d20+1", "disadvantage", faces(4, 15)).total).toBe(5);
    expect(roll("1d20", "advantage", faces(4, 15)).breakdown).toBe("[~4~, 15]");
  });

  it("flags natural 20s and 1s", () => {
    expect(roll("1d20+3", "normal", faces(20)).critical).toBe("success");
    expect(roll("1d20+3", "normal", faces(1)).critical).toBe("failure");
    expect(roll("2d6", "normal", faces(1)).critical).toBeUndefined();
  });

  it("formats d20 rolls and doubles crit dice", () => {
    expect(d20(5)).toBe("1d20+5");
    expect(d20(-1)).toBe("1d20-1");
    expect(d20(0)).toBe("1d20");
    expect(critExpression("1d8+3")).toBe("2d8+3");
    expect(critExpression("2d6+1d4+2")).toBe("4d6+2d4+2");
  });

  it("applies damage to temp HP first and caps healing", () => {
    expect(applyDamage({ current: 10, max: 20, temp: 5 }, 8)).toEqual({ current: 7, max: 20, temp: 0 });
    expect(applyDamage({ current: 3, max: 20, temp: 0 }, 10)).toEqual({ current: 0, max: 20, temp: 0 });
    expect(applyDamage({ current: 15, max: 20, temp: 0 }, -10)).toEqual({ current: 20, max: 20, temp: 0 });
  });
});
