import { useState } from "react";
import { d20 } from "../../dice/dice";
import type { AbilityScore, ActorSheet, HitPoints, SkillScore } from "../../model/sheet";
import { signed } from "../../model/sheet";

export type RollFn = (expression: string, label: string) => void;

export function RollButton({ mod, label, onRoll, big }: { mod: number; label: string; onRoll: RollFn; big?: boolean }) {
  return (
    <button className={`roll ${big ? "big" : ""}`} title={`Roll ${label}`} onClick={() => onRoll(d20(mod), label)}>
      {signed(mod)}
    </button>
  );
}

export function DiceButton({ expression, label, onRoll, text }: { expression: string; label: string; onRoll: RollFn; text?: string }) {
  return (
    <button className="roll" title={`Roll ${expression}`} onClick={() => onRoll(expression, label)}>
      {text ?? expression}
    </button>
  );
}

export function BigStats({ sheet, onRoll }: { sheet: ActorSheet; onRoll: RollFn }) {
  const walk = sheet.speeds.find((s) => s.type === "Walk")?.feet ?? sheet.speeds[0]?.feet ?? 0;
  const otherSpeeds = sheet.speeds.filter((s) => s.type !== "Walk");
  return (
    <div className="big-stats">
      <div className="big-stat" title={sheet.acNote}>
        <div className="label">Armor Class</div>
        <div className="value">{sheet.ac}</div>
      </div>
      <div className="big-stat">
        <div className="label">Initiative</div>
        <div className="value">
          <RollButton big mod={sheet.initiative} label="Initiative" onRoll={onRoll} />
        </div>
      </div>
      <div className="big-stat" title={otherSpeeds.map((s) => `${s.type} ${s.feet} ft.`).join(", ")}>
        <div className="label">Speed</div>
        <div className="value">
          {walk}
          <span className="small muted"> ft{otherSpeeds.length ? "+" : ""}</span>
        </div>
      </div>
      <div className="big-stat">
        <div className="label">Prof. Bonus</div>
        <div className="value">{signed(sheet.proficiencyBonus)}</div>
      </div>
    </div>
  );
}

export function AbilityGrid({ abilities, onRoll }: { abilities: AbilityScore[]; onRoll: RollFn }) {
  return (
    <div className="abilities">
      {abilities.map((a) => (
        <div className="ability" key={a.key}>
          <div className="label">{a.key.toUpperCase()}</div>
          <RollButton big mod={a.mod} label={`${a.label} check`} onRoll={onRoll} />
          <div className="score">{a.score}</div>
          <div className="save-row" title={a.saveProficient ? "Proficient save" : "Saving throw"}>
            save
            <button className="roll" onClick={() => onRoll(d20(a.save), `${a.label} save`)}>
              {a.saveProficient ? "●" : ""}
              {signed(a.save)}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkillGrid({ skills, onRoll }: { skills: SkillScore[]; onRoll: RollFn }) {
  return (
    <div className="skills">
      {skills.map((s) => (
        <div className="skill" key={s.name}>
          <span>
            <span className={`prof-dot ${s.proficiency}`} title={s.proficiency} />
            {s.name}
            <span className="abbr">{s.ability}</span>
          </span>
          <RollButton mod={s.mod} label={s.name} onRoll={onRoll} />
        </div>
      ))}
    </div>
  );
}

export function HpControl({
  hp,
  onChange,
  readOnly,
}: {
  hp: HitPoints;
  onChange?: (next: HitPoints, kind: "damage" | "heal" | "temp" | "set") => void;
  readOnly?: boolean;
}) {
  const [amount, setAmount] = useState("");
  const value = Math.abs(Math.floor(Number(amount)));
  const valid = amount.trim() !== "" && Number.isFinite(value);
  const apply = (kind: "damage" | "heal" | "temp") => {
    if (!valid || !onChange) return;
    if (kind === "temp") onChange({ ...hp, temp: value }, kind);
    else if (kind === "heal") onChange({ ...hp, current: Math.min(hp.max, hp.current + value) }, kind);
    else {
      const fromTemp = Math.min(hp.temp, value);
      onChange({ ...hp, temp: hp.temp - fromTemp, current: Math.max(0, hp.current - (value - fromTemp)) }, kind);
    }
    setAmount("");
  };
  return (
    <div className="card">
      <div className="hp-box">
        <div className="grow">
          <div className="tiny muted">HIT POINTS</div>
          <div className="hp-numbers">
            {hp.current}
            <span className="muted small"> / {hp.max}</span>
            {hp.temp > 0 && <span className="temp">+{hp.temp} temp</span>}
          </div>
        </div>
        {!readOnly && onChange && (
          <div className="stack" style={{ gap: 4 }}>
            <div className="row">
              <input
                className="hp-input"
                inputMode="numeric"
                placeholder="#"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && apply("damage")}
                aria-label="Amount"
              />
              <button className="btn small" disabled={!valid} onClick={() => apply("damage")}>
                Damage
              </button>
            </div>
            <div className="row">
              <button className="btn small grow" disabled={!valid} onClick={() => apply("heal")}>
                Heal
              </button>
              <button className="btn small grow" disabled={!valid} onClick={() => apply("temp")}>
                Temp
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function KeyValues({ rows }: { rows: [string, string | undefined | null][] }) {
  const shown = rows.filter(([, v]) => v && v.trim());
  if (!shown.length) return null;
  return (
    <dl className="kv">
      {shown.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function defenseRows(sheet: ActorSheet): [string, string][] {
  return [
    ["Resistances", sheet.defenses.resistances.join(", ")],
    ["Immunities", sheet.defenses.immunities.join(", ")],
    ["Vulnerabilities", sheet.defenses.vulnerabilities.join(", ")],
    ["Condition Imm.", sheet.defenses.conditionImmunities.join(", ")],
  ];
}
