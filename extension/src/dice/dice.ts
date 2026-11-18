/**
 * A tiny dice roller: "1d20+5", "2d6 + 1d4 - 1", "d20". The first d20 term can be
 * rolled with advantage or disadvantage.
 */

export type RollMode = "normal" | "advantage" | "disadvantage";

export interface DiceTerm {
  type: "dice";
  sign: 1 | -1;
  count: number;
  sides: number;
  rolls: number[];
  /** Indexes into rolls that were dropped (advantage/disadvantage). */
  dropped: number[];
}

export interface FlatTerm {
  type: "flat";
  sign: 1 | -1;
  value: number;
}

export interface RollResult {
  expression: string;
  mode: RollMode;
  total: number;
  terms: (DiceTerm | FlatTerm)[];
  breakdown: string;
  /** Natural 20 / natural 1 on the kept d20, if any. */
  critical?: "success" | "failure";
}

const TERM_RE = /([+-]?)\s*(\d*)d(\d+)|([+-]?)\s*(\d+)/gi;

export function isValidExpression(expression: string): boolean {
  const compact = expression.replace(/\s+/g, "");
  return /^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/i.test(compact);
}

export function roll(expression: string, mode: RollMode = "normal", rng: () => number = Math.random): RollResult {
  if (!isValidExpression(expression)) throw new Error(`Can't roll “${expression}”`);
  const terms: (DiceTerm | FlatTerm)[] = [];
  let usedMode = false;
  const die = (sides: number) => 1 + Math.floor(rng() * sides);
  for (const match of expression.matchAll(TERM_RE)) {
    if (match[3]) {
      const sign = match[1] === "-" ? -1 : 1;
      const count = Math.min(100, Math.max(1, Number(match[2] || 1)));
      const sides = Math.min(1000, Math.max(1, Number(match[3])));
      const rolls: number[] = [];
      const dropped: number[] = [];
      if (!usedMode && mode !== "normal" && sides === 20 && count === 1) {
        usedMode = true;
        const a = die(20);
        const b = die(20);
        rolls.push(a, b);
        const keepFirst = mode === "advantage" ? a >= b : a <= b;
        dropped.push(keepFirst ? 1 : 0);
      } else {
        for (let i = 0; i < count; i++) rolls.push(die(sides));
      }
      terms.push({ type: "dice", sign, count, sides, rolls, dropped });
    } else if (match[5]) {
      terms.push({ type: "flat", sign: match[4] === "-" ? -1 : 1, value: Number(match[5]) });
    }
  }
  let total = 0;
  let critical: RollResult["critical"];
  const parts: string[] = [];
  terms.forEach((term, index) => {
    const prefix = index === 0 ? (term.sign < 0 ? "-" : "") : term.sign < 0 ? " - " : " + ";
    if (term.type === "dice") {
      const kept = term.rolls.filter((_, i) => !term.dropped.includes(i));
      total += term.sign * kept.reduce((a, b) => a + b, 0);
      const shown = term.rolls.map((r, i) => (term.dropped.includes(i) ? `~${r}~` : `${r}`)).join(", ");
      parts.push(`${prefix}[${shown}]`);
      if (term.sides === 20 && kept.length === 1 && critical === undefined) {
        if (kept[0] === 20) critical = "success";
        else if (kept[0] === 1) critical = "failure";
      }
    } else {
      total += term.sign * term.value;
      parts.push(`${prefix}${term.value}`);
    }
  });
  return { expression, mode, total, terms, breakdown: parts.join(""), critical };
}

/** "1d20+5" for a modifier of 5, "1d20-1" for -1. */
export function d20(mod: number): string {
  return mod === 0 ? "1d20" : `1d20${mod > 0 ? "+" : ""}${mod}`;
}

/** Doubles the dice of a damage expression for critical hits: "1d8+3" -> "2d8+3". */
export function critExpression(expression: string): string {
  return expression.replace(/(\d*)d(\d+)/gi, (_, count, sides) => `${Number(count || 1) * 2}d${sides}`);
}
