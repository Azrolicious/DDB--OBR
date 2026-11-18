import OBR, { type Image } from "@owlbear-rodeo/sdk";
import { useState } from "react";
import { hpStatus, type HitPoints } from "../../model/sheet";
import { advanceTurn, clearInitiative, rollInitiative, setCombat, sortByInitiative, useCombat } from "../../obr/combat";
import { useLinkedItems } from "../../obr/hooks";
import { openSheetForItem } from "../../obr/popovers";
import { useRoomSettings } from "../../obr/settings";
import { applyDamage, getLink, updateLinks } from "../../obr/tokens";
import { Avatar, HpBar, Notice, useAsync } from "../common/ui";

export function CombatTab({ role }: { role: "GM" | "PLAYER" }) {
  const items = useLinkedItems();
  const combat = useCombat();
  const room = useRoomSettings();
  const [busy, error, run] = useAsync();
  const isGm = role === "GM";
  const visible = items.filter((i) => isGm || i.visible);
  const ordered = sortByInitiative(visible);
  const monsters = visible.filter((i) => getLink(i)?.kind === "monster");
  const unrolled = visible.filter((i) => getLink(i)?.initiative === null || getLink(i)?.initiative === undefined);

  const setInitiative = (item: Image, value: string) => {
    const n = value.trim() === "" ? null : Math.round(Number(value));
    if (n !== null && !Number.isFinite(n)) return;
    run(() => updateLinks([item.id], room, (l) => ({ ...l, initiative: n })));
  };

  const changeHp = (item: Image, amount: number) =>
    run(() => updateLinks([item.id], room, (l) => ({ ...l, hp: applyDamage(l.hp, amount), updatedAt: Date.now() })));

  const focus = async (item: Image) => {
    await OBR.player.select([item.id]);
    const bounds = await OBR.scene.items.getItemBounds([item.id]);
    await OBR.viewport.animateToBounds({
      ...bounds,
      min: { x: bounds.min.x - 300, y: bounds.min.y - 300 },
      max: { x: bounds.max.x + 300, y: bounds.max.y + 300 },
      width: bounds.width + 600,
      height: bounds.height + 600,
    });
  };

  return (
    <div className="scroll">
      {isGm && (
        <div className="row wrap" style={{ marginBottom: 8 }}>
          <button className="btn primary" disabled={busy || !visible.length} onClick={() => run(() => rollInitiative(visible, room))}>
            Roll all
          </button>
          <button className="btn" disabled={busy || !monsters.length} onClick={() => run(() => rollInitiative(monsters, room))}>
            Roll monsters
          </button>
          <button className="btn" disabled={busy || !unrolled.length} onClick={() => run(() => rollInitiative(unrolled, room))} title="Roll only for tokens without initiative">
            Roll missing
          </button>
          <button className="btn ghost danger" disabled={busy} onClick={() => run(() => clearInitiative(items))}>
            Clear
          </button>
        </div>
      )}
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="grow" style={{ fontWeight: 600 }}>
          {combat.round > 0 ? `Round ${combat.round}` : "Not started"}
        </span>
        {isGm && (
          <>
            <button className="btn small" disabled={busy} onClick={() => run(() => advanceTurn(ordered, combat, -1, room))}>
              ‹ Prev
            </button>
            <button className="btn small primary" disabled={busy} onClick={() => run(() => advanceTurn(ordered, combat, 1, room))}>
              {combat.round > 0 ? "Next turn ›" : "Start ›"}
            </button>
            {combat.round > 0 && (
              <button className="btn small ghost" onClick={() => run(() => setCombat({ round: 0, activeId: null }))}>
                End
              </button>
            )}
          </>
        )}
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {!visible.length && (
        <div className="empty">
          No linked tokens in this scene. Import characters in the Party tab, add monsters from Encounters, or right-click a token →
          Link to D&amp;D Beyond.
        </div>
      )}
      <div className="list">
        {ordered.map((item) => (
          <CombatRow
            key={item.id}
            item={item}
            active={combat.activeId === item.id}
            isGm={isGm}
            hideHp={!isGm && getLink(item)!.kind === "monster" && room.hideMonsterHp}
            onInitiative={(v) => setInitiative(item, v)}
            onHp={(amount) => changeHp(item, amount)}
            onFocus={() => focus(item)}
            onSheet={() => openSheetForItem(item.id)}
            canSeeSheet={isGm || getLink(item)!.kind === "character" || room.playersSeeMonsterSheets}
          />
        ))}
      </div>
      <div className="tiny muted" style={{ marginTop: 10 }}>
        Initiative is stored on each token, so everyone sees the same order.
        {room.mirrorInitiative ? " It's also mirrored to Owlbear's Initiative Tracker." : ""}
      </div>
    </div>
  );
}

function CombatRow({
  item,
  active,
  isGm,
  hideHp,
  canSeeSheet,
  onInitiative,
  onHp,
  onFocus,
  onSheet,
}: {
  item: Image;
  active: boolean;
  isGm: boolean;
  hideHp: boolean;
  canSeeSheet: boolean;
  onInitiative: (value: string) => void;
  onHp: (amount: number) => void;
  onFocus: () => void;
  onSheet: () => void;
}) {
  const link = getLink(item)!;
  const [init, setInit] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const hp: HitPoints = link.hp;
  const value = Math.abs(Math.floor(Number(amount)));
  const canEdit = isGm || link.kind === "character";
  return (
    <div className={`actor-row ${active ? "active" : ""}`} style={{ opacity: item.visible ? 1 : 0.6 }}>
      <input
        className="init-input"
        aria-label="Initiative"
        readOnly={!canEdit}
        value={init ?? (link.initiative ?? "").toString()}
        placeholder="–"
        onFocus={() => setInit((link.initiative ?? "").toString())}
        onChange={(e) => setInit(e.target.value.replace(/[^0-9-]/g, ""))}
        onBlur={() => {
          if (init !== null && init !== (link.initiative ?? "").toString()) onInitiative(init);
          setInit(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <button className="btn ghost" style={{ padding: 0, borderRadius: "50%" }} onClick={onFocus} title="Select and centre on this token">
        <Avatar url={item.image.url} />
      </button>
      <div className="grow">
        <div className="row">
          <span className="name grow" title={item.name}>
            {item.name || link.name}
            {!item.visible && <span className="tiny muted"> (hidden)</span>}
          </span>
          {hideHp ? (
            <span className="small muted">{hpStatus(hp)}</span>
          ) : (
            <span className="small">
              {hp.current}/{hp.max}
              {hp.temp ? <span className="muted"> +{hp.temp}</span> : null}
            </span>
          )}
        </div>
        {!hideHp && <HpBar hp={hp} />}
        <div className="row" style={{ marginTop: 4, gap: 4 }}>
          {!hideHp && <span className="chip">AC {link.ac}</span>}
          {link.conditions?.slice(0, 3).map((c) => (
            <span className="chip" key={c}>
              {c}
            </span>
          ))}
          <span className="grow" />
          {canEdit && !hideHp && (
            <>
              <input
                style={{ width: 44, padding: "2px 4px", textAlign: "center" }}
                inputMode="numeric"
                placeholder="#"
                value={amount}
                aria-label="HP change"
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
              />
              <button className="btn small" disabled={!amount} onClick={() => { onHp(value); setAmount(""); }} title="Damage">
                −
              </button>
              <button className="btn small" disabled={!amount} onClick={() => { onHp(-value); setAmount(""); }} title="Heal">
                +
              </button>
            </>
          )}
          {canSeeSheet && (
            <button className="btn small ghost" onClick={onSheet} title="Open sheet">
              📄
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
