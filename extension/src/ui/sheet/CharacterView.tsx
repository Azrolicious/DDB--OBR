import { useMemo, useState } from "react";
import { critExpression, d20 } from "../../dice/dice";
import type { CharacterSheet, HitPoints } from "../../model/sheet";
import { signed } from "../../model/sheet";
import { RichText } from "../common/RichText";
import { Tabs } from "../common/ui";
import {
  AbilityGrid,
  BigStats,
  DiceButton,
  HpControl,
  KeyValues,
  RollButton,
  SkillGrid,
  defenseRows,
  type RollFn,
} from "./parts";

type Tab = "main" | "actions" | "spells" | "features" | "gear" | "notes";

const LEVEL_NAMES = ["Cantrips", "1st Level", "2nd Level", "3rd Level", "4th Level", "5th Level", "6th Level", "7th Level", "8th Level", "9th Level"];

export function CharacterView({
  sheet,
  hp,
  conditions,
  onHpChange,
  onRoll,
}: {
  sheet: CharacterSheet;
  hp: HitPoints;
  conditions: string[];
  onHpChange?: (hp: HitPoints) => void;
  onRoll: RollFn;
}) {
  const [tab, setTab] = useState<Tab>("main");
  const tabs: { id: Tab; label: string }[] = [
    { id: "main", label: "Main" },
    { id: "actions", label: "Actions" },
    ...(sheet.spells.length || sheet.spellcasting.length ? [{ id: "spells" as Tab, label: "Spells" }] : []),
    { id: "features", label: "Features" },
    { id: "gear", label: "Gear" },
    ...(sheet.notes.length ? [{ id: "notes" as Tab, label: "Notes" }] : []),
  ];
  return (
    <>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="scroll">
        {tab === "main" && <MainTab sheet={sheet} hp={hp} conditions={conditions} onHpChange={onHpChange} onRoll={onRoll} />}
        {tab === "actions" && <ActionsTab sheet={sheet} onRoll={onRoll} />}
        {tab === "spells" && <SpellsTab sheet={sheet} onRoll={onRoll} />}
        {tab === "features" && <FeaturesTab sheet={sheet} onRoll={onRoll} />}
        {tab === "gear" && <GearTab sheet={sheet} />}
        {tab === "notes" && <NotesTab sheet={sheet} />}
      </div>
    </>
  );
}

function MainTab({
  sheet,
  hp,
  conditions,
  onHpChange,
  onRoll,
}: {
  sheet: CharacterSheet;
  hp: HitPoints;
  conditions: string[];
  onHpChange?: (hp: HitPoints) => void;
  onRoll: RollFn;
}) {
  return (
    <div className="stack">
      <HpControl hp={hp} onChange={onHpChange ? (next) => onHpChange(next) : undefined} readOnly={!onHpChange} />
      {(conditions.length > 0 || sheet.exhaustion > 0 || hp.current === 0) && (
        <div className="row wrap">
          {conditions.map((c) => (
            <span className="pill" key={c}>
              {c}
            </span>
          ))}
          {sheet.exhaustion > 0 && <span className="pill">Exhaustion {sheet.exhaustion}</span>}
          {hp.current === 0 && (
            <span className="pill">
              Death saves: {sheet.deathSaves.successes}✓ {sheet.deathSaves.failures}✗
              <button className="roll" onClick={() => onRoll("1d20", "Death save")}>
                roll
              </button>
            </span>
          )}
        </div>
      )}
      <BigStats sheet={sheet} onRoll={onRoll} />
      <AbilityGrid abilities={sheet.abilities} onRoll={onRoll} />
      <div className="section-title">Skills</div>
      <SkillGrid skills={sheet.skills} onRoll={onRoll} />
      <div className="section-title">Senses &amp; Defenses</div>
      <KeyValues
        rows={[
          ["Passive Perception", String(sheet.passivePerception)],
          ["Passive Insight", String(sheet.passiveInsight)],
          ["Passive Investigation", String(sheet.passiveInvestigation)],
          ["Senses", sheet.senses.map((s) => `${s.name} ${s.value}`).join(", ")],
          ["Speeds", sheet.speeds.map((s) => `${s.type} ${s.feet} ft.`).join(", ")],
          ["Hit Dice", sheet.hitDice],
          ...defenseRows(sheet),
        ]}
      />
      <div className="section-title">Proficiencies &amp; Languages</div>
      <KeyValues
        rows={[
          ["Armor", sheet.proficiencies.armor.join(", ")],
          ["Weapons", sheet.proficiencies.weapons.join(", ")],
          ["Tools", sheet.proficiencies.tools.join(", ")],
          ["Languages", sheet.languages.join(", ")],
        ]}
      />
    </div>
  );
}

function ActionsTab({ sheet, onRoll }: { sheet: CharacterSheet; onRoll: RollFn }) {
  const groups = useMemo(() => {
    const map = new Map<string, typeof sheet.actions>();
    for (const a of sheet.actions) {
      const key = a.activation ?? "Other";
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return [...map.entries()];
  }, [sheet.actions]);
  return (
    <div>
      <div className="section-title">Attacks</div>
      {sheet.attacks.map((attack, i) => (
        <div className="attack" key={`${attack.name}-${i}`}>
          <div>
            <div style={{ fontWeight: 600 }}>{attack.name}</div>
            <div className="tiny muted">
              {[attack.range, attack.damageType, attack.notes].filter(Boolean).join(" · ")}
            </div>
          </div>
          {attack.toHit !== undefined ? (
            <button className="roll" onClick={() => onRoll(d20(attack.toHit!), `${attack.name} (to hit)`)}>
              {signed(attack.toHit)}
            </button>
          ) : (
            <span />
          )}
          {attack.damage ? (
            <span className="row" style={{ gap: 0 }}>
              <DiceButton expression={attack.damage} label={`${attack.name} (damage)`} onRoll={onRoll} />
              {/\d*d\d+/.test(attack.damage) && (
                <button
                  className="roll tiny"
                  title="Critical hit: double the dice"
                  onClick={() => onRoll(critExpression(attack.damage!), `${attack.name} (crit damage)`)}
                >
                  crit
                </button>
              )}
            </span>
          ) : (
            <span />
          )}
        </div>
      ))}
      <div className="tiny muted" style={{ marginTop: 6 }}>
        Attack bonuses are worked out from your equipped weapons. Check D&amp;D Beyond for unusual features.
      </div>
      {groups.map(([activation, actions]) => (
        <div key={activation}>
          <div className="section-title">{activation}</div>
          {actions.map((a, i) => (
            <details className="entry" key={`${a.name}-${i}`}>
              <summary>
                <span className="grow" style={{ fontWeight: 600 }}>
                  {a.name}
                </span>
                {a.uses && (
                  <span className="chip" title={a.uses.reset ? `Resets on ${a.uses.reset}` : undefined}>
                    {a.uses.max - a.uses.used}/{a.uses.max}
                  </span>
                )}
                <span className="tiny muted">{a.source}</span>
              </summary>
              <div className="body">
                <RichText html={a.description} onRoll={onRoll} />
              </div>
            </details>
          ))}
        </div>
      ))}
    </div>
  );
}

function SpellsTab({ sheet, onRoll }: { sheet: CharacterSheet; onRoll: RollFn }) {
  const [preparedOnly, setPreparedOnly] = useState(true);
  const spells = sheet.spells.filter((s) => !preparedOnly || s.prepared);
  const byLevel = new Map<number, typeof spells>();
  for (const s of spells) byLevel.set(s.level, [...(byLevel.get(s.level) ?? []), s]);
  return (
    <div>
      {sheet.spellcasting.map((c) => (
        <div className="row" key={c.source} style={{ marginBottom: 4 }}>
          <span className="grow" style={{ fontWeight: 600 }}>
            {c.source} <span className="muted small">({c.ability.toUpperCase()})</span>
          </span>
          <span className="chip">Save DC {c.saveDc}</span>
          <span className="chip">
            Attack <RollButton mod={c.attackBonus} label={`${c.source} spell attack`} onRoll={onRoll} />
          </span>
        </div>
      ))}
      {sheet.spellSlots.length > 0 && (
        <>
          <div className="section-title">Spell Slots</div>
          <div className="stack" style={{ gap: 3 }}>
            {sheet.spellSlots.map((slot) => (
              <div className="row" key={`${slot.level}-${slot.pact ? "p" : "s"}`}>
                <span style={{ width: 92 }} className="small">
                  {slot.pact ? "Pact " : ""}
                  {LEVEL_NAMES[slot.level]}
                </span>
                <span className="slots" title={`${slot.max - slot.used} of ${slot.max} left`}>
                  {Array.from({ length: slot.max }, (_, i) => (
                    <span key={i} className={`slot ${i < slot.max - slot.used ? "free" : "used"}`} />
                  ))}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      <label className="check small" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={preparedOnly} onChange={(e) => setPreparedOnly(e.target.checked)} />
        Prepared &amp; known spells only
      </label>
      {[...byLevel.entries()].map(([level, list]) => (
        <div key={level}>
          <div className="section-title">{LEVEL_NAMES[level] ?? `Level ${level}`}</div>
          {list.map((s, i) => (
            <details className="entry" key={`${s.name}-${s.source}-${i}`}>
              <summary>
                <span className="grow" style={{ fontWeight: 600, opacity: s.prepared ? 1 : 0.55 }}>
                  {s.name}
                  {s.concentration && <span className="chip" title="Concentration" style={{ marginLeft: 4 }}>C</span>}
                  {s.ritual && <span className="chip" title="Ritual" style={{ marginLeft: 4 }}>R</span>}
                </span>
                <span className="tiny muted">{s.castingTime}</span>
              </summary>
              <div className="body">
                <div className="tiny muted" style={{ marginBottom: 4 }}>
                  {[s.school, s.range, s.components, s.duration, s.source].filter(Boolean).join(" · ")}
                </div>
                <RichText html={s.description} onRoll={onRoll} />
              </div>
            </details>
          ))}
        </div>
      ))}
      {!spells.length && <div className="empty">No spells to show.</div>}
    </div>
  );
}

function FeaturesTab({ sheet, onRoll }: { sheet: CharacterSheet; onRoll: RollFn }) {
  const sources = [...new Set(sheet.features.map((f) => f.source))];
  return (
    <div>
      {sources.map((source) => (
        <div key={source}>
          <div className="section-title">{source}</div>
          {sheet.features
            .filter((f) => f.source === source)
            .map((f, i) => (
              <details className="entry" key={`${f.name}-${i}`}>
                <summary>
                  <span style={{ fontWeight: 600 }}>{f.name}</span>
                </summary>
                <div className="body">
                  <RichText html={f.description} onRoll={onRoll} />
                </div>
              </details>
            ))}
        </div>
      ))}
      {!sheet.features.length && <div className="empty">No features found.</div>}
    </div>
  );
}

function GearTab({ sheet }: { sheet: CharacterSheet }) {
  const c = sheet.currency;
  return (
    <div>
      <div className="row wrap">
        {(["pp", "gp", "ep", "sp", "cp"] as const).map((k) => (
          <span className="chip" key={k}>
            {c[k]} {k}
          </span>
        ))}
      </div>
      <div className="section-title">Inventory</div>
      {sheet.inventory.map((item, i) => (
        <div className="row entry" key={`${item.name}-${i}`}>
          <span className="grow">
            {item.name}
            {item.quantity > 1 && <span className="muted"> ×{item.quantity}</span>}
          </span>
          {item.attuned && <span className="chip">Attuned</span>}
          {item.equipped && <span className="chip">Equipped</span>}
          {item.weight !== undefined && <span className="tiny muted">{item.weight} lb</span>}
        </div>
      ))}
      {!sheet.inventory.length && <div className="empty">Inventory is empty.</div>}
    </div>
  );
}

function NotesTab({ sheet }: { sheet: CharacterSheet }) {
  return (
    <div>
      {sheet.notes.map((n) => (
        <div key={n.label}>
          <div className="section-title">{n.label}</div>
          <div className="small" style={{ whiteSpace: "pre-wrap" }}>
            {n.text}
          </div>
        </div>
      ))}
    </div>
  );
}
