import type { HitPoints, MonsterSheet } from "../../model/sheet";
import { signed } from "../../model/sheet";
import { RichText } from "../common/RichText";
import { AbilityGrid, BigStats, DiceButton, HpControl, KeyValues, RollButton, defenseRows, type RollFn } from "./parts";

export function MonsterView({
  sheet,
  hp,
  onHpChange,
  onRoll,
}: {
  sheet: MonsterSheet;
  hp: HitPoints;
  onHpChange?: (hp: HitPoints) => void;
  onRoll: RollFn;
}) {
  const saves = sheet.abilities.filter((a) => a.saveProficient);
  return (
    <div className="scroll">
      <div className="stack">
        {sheet.meta && <div className="stat-block-meta">{sheet.meta}</div>}
        {!sheet.hasFullAccess && (
          <div className="notice small">
            D&amp;D Beyond only shares this monster's basic stats with your account (you may not own its source book).
          </div>
        )}
        <HpControl hp={hp} onChange={onHpChange ? (next) => onHpChange(next) : undefined} readOnly={!onHpChange} />
        {sheet.hitDice && (
          <div className="row small muted">
            Hit dice <DiceButton expression={sheet.hitDice.replace(/\s+/g, "")} label="Hit points" onRoll={onRoll} text={sheet.hitDice} />
            <span className="grow" />
            CR {sheet.challenge}
            {sheet.xp !== undefined && ` · ${sheet.xp.toLocaleString()} XP`}
          </div>
        )}
        <BigStats sheet={sheet} onRoll={onRoll} />
        <AbilityGrid abilities={sheet.abilities} onRoll={onRoll} />
        {(saves.length > 0 || sheet.skills.length > 0) && (
          <div className="stack" style={{ gap: 4 }}>
            {saves.length > 0 && (
              <div className="row wrap small">
                <strong>Saves</strong>
                {saves.map((a) => (
                  <span key={a.key}>
                    {a.key.toUpperCase()} <RollButton mod={a.save} label={`${a.label} save`} onRoll={onRoll} />
                  </span>
                ))}
              </div>
            )}
            {sheet.skills.length > 0 && (
              <div className="row wrap small">
                <strong>Skills</strong>
                {sheet.skills.map((s) => (
                  <span key={s.name}>
                    {s.name} <RollButton mod={s.mod} label={s.name} onRoll={onRoll} />
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <KeyValues
          rows={[
            ["Speed", sheet.speeds.map((s) => `${s.type === "Walk" ? "" : `${s.type} `}${s.feet} ft.`).join(", ")],
            [
              "Senses",
              [...sheet.senses.map((s) => `${s.name} ${s.value}`.trim()), `Passive Perception ${sheet.passivePerception}`].join(", "),
            ],
            ["Languages", sheet.languages.join(", ") || "—"],
            ["Proficiency", signed(sheet.proficiencyBonus)],
            ...defenseRows(sheet),
          ]}
        />
        {sheet.sections.map((section) => (
          <div key={section.title}>
            <div className="section-title">{section.title}</div>
            <RichText html={section.html} onRoll={onRoll} />
          </div>
        ))}
      </div>
    </div>
  );
}
