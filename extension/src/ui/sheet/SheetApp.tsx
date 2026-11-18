import OBR from "@owlbear-rodeo/sdk";
import { useCallback, useEffect, useState } from "react";
import { CHANNEL_SHEET_HEARTBEAT } from "../../constants";
import type { RollMode } from "../../dice/dice";
import { performRoll } from "../../dice/rolls";
import { hpStatus, type ActorKind, type ActorSheet, type HitPoints } from "../../model/sheet";
import { useItem, useRole, useSelection } from "../../obr/hooks";
import { closeSheet } from "../../obr/popovers";
import { useRoomSettings, useLocalSettings } from "../../obr/settings";
import { getLink, updateLinks } from "../../obr/tokens";
import { onCachedSheetChange, getCachedSheet } from "../../store/cache";
import { loadSheet } from "../../store/sheets";
import { Avatar, Notice, Spinner, errorText } from "../common/ui";
import { CharacterView } from "./CharacterView";
import { MonsterView } from "./MonsterView";

function useInitialTarget() {
  const params = new URLSearchParams(window.location.search);
  const kind = params.get("kind");
  return {
    item: params.get("item"),
    kind: kind === "character" || kind === "monster" ? (kind as ActorKind) : null,
    id: Number(params.get("id")) || null,
  };
}

export function SheetApp() {
  const initial = useInitialTarget();
  const [itemId, setItemId] = useState<string | null>(initial.item);
  const item = useItem(itemId);
  const link = item ? getLink(item) : null;
  const kind = link?.kind ?? (itemId ? null : initial.kind);
  const ddbId = link?.ddbId ?? (itemId ? null : initial.id);

  const role = useRole();
  const room = useRoomSettings();
  const [local, setLocal] = useLocalSettings();
  const selection = useSelection();
  const [sheet, setSheet] = useState<ActorSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<RollMode>("normal");

  // Tell the background page we're open so it doesn't reload us on selection.
  useEffect(() => {
    const beat = () => OBR.broadcast.sendMessage(CHANNEL_SHEET_HEARTBEAT, {}, { destination: "LOCAL" }).catch(() => {});
    beat();
    const timer = window.setInterval(beat, 1500);
    return () => window.clearInterval(timer);
  }, []);

  // Follow the selection to other linked tokens.
  useEffect(() => {
    if (selection.length !== 1 || selection[0] === itemId || !local.openSheetOnSelect) return;
    OBR.scene.items
      .getItems(selection)
      .then(([picked]) => {
        const pickedLink = picked ? getLink(picked) : null;
        if (!pickedLink) return;
        if (pickedLink.kind === "monster" && role !== "GM" && !room.playersSeeMonsterSheets) return;
        setItemId(picked.id);
      })
      .catch(() => {});
  }, [selection, itemId, local.openSheetOnSelect, role, room.playersSeeMonsterSheets]);

  const load = useCallback(
    (refresh: boolean) => {
      if (!kind || !ddbId) return;
      setLoading(true);
      setError(null);
      loadSheet(kind, ddbId, { refresh })
        .then(setSheet)
        .catch((e) => setError(errorText(e)))
        .finally(() => setLoading(false));
    },
    [kind, ddbId],
  );

  useEffect(() => {
    setSheet(kind && ddbId ? getCachedSheet(kind, ddbId) : null);
    load(false);
  }, [kind, ddbId, load]);

  useEffect(
    () =>
      onCachedSheetChange((k, id) => {
        if (k === kind && id === ddbId) {
          const cached = getCachedSheet(k, id);
          if (cached) setSheet(cached);
        }
      }),
    [kind, ddbId],
  );

  const actorName = item?.name || sheet?.name || link?.name || "Unknown";
  const onRoll = useCallback(
    (expression: string, label: string) => {
      performRoll({ actor: actorName, label, expression, mode, actorKind: kind ?? undefined }).catch((e) =>
        OBR.notification.show(errorText(e), "ERROR"),
      );
      setMode("normal");
    },
    [actorName, mode, kind],
  );

  const hp: HitPoints | undefined = link?.hp ?? sheet?.hp;
  const onHpChange =
    item && link
      ? (next: HitPoints) => {
          updateLinks([item.id], room, (l) => ({ ...l, hp: next, updatedAt: Date.now() })).catch((e) =>
            OBR.notification.show(`Couldn't update HP: ${errorText(e)}`, "ERROR"),
          );
        }
      : undefined;

  const hiddenMonster = kind === "monster" && role !== "GM" && !room.playersSeeMonsterSheets;

  return (
    <>
      <div className="sheet-header">
        <Avatar url={item?.image?.url ?? sheet?.avatarUrl ?? link?.avatarUrl} size="lg" />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="name">{actorName}</div>
          {sheet?.kind === "character" && (
            <div className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {sheet.race} · {sheet.classSummary}
            </div>
          )}
          {sheet?.kind === "monster" && !hiddenMonster && <div className="small muted">{sheet.name !== actorName ? sheet.name : "Monster"}</div>}
          {!hiddenMonster && (
            <div className="row" style={{ marginTop: 4 }}>
              <div className="segmented" role="group" aria-label="Roll mode">
                {(["disadvantage", "normal", "advantage"] as RollMode[]).map((m) => (
                  <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)} title={`Next d20 roll with ${m}`}>
                    {m === "normal" ? "Normal" : m === "advantage" ? "Adv" : "Dis"}
                  </button>
                ))}
              </div>
              {loading && <Spinner />}
            </div>
          )}
        </div>
        <button
          className="btn ghost small"
          aria-pressed={local.openSheetOnSelect}
          onClick={() => setLocal({ openSheetOnSelect: !local.openSheetOnSelect })}
          title={
            local.openSheetOnSelect
              ? "Following selection: clicking a linked token shows its sheet. Click to stop."
              : "Not following selection. Click to show the sheet of whichever linked token you select."
          }
          style={{ opacity: local.openSheetOnSelect ? 1 : 0.45 }}
        >
          📌
        </button>
        <button className="btn ghost" onClick={() => closeSheet()} aria-label="Close sheet" title="Close">
          ✕
        </button>
      </div>

      {!kind || !ddbId ? (
        <div className="scroll">
          <div className="empty">
            {itemId ? "This token isn't linked to D&D Beyond anymore." : "Select a linked token to see its sheet."}
          </div>
        </div>
      ) : hiddenMonster ? (
        <div className="scroll">
          <div className="card center">
            <div style={{ fontSize: 18, fontWeight: 700 }}>{hp ? hpStatus(hp) : "Unknown"}</div>
            <div className="small muted">The GM keeps monster stat blocks hidden.</div>
          </div>
        </div>
      ) : !sheet ? (
        <div className="scroll">
          {error ? (
            <Notice kind="error">
              {error}
              <div style={{ marginTop: 6 }}>
                <button className="btn small" onClick={() => load(true)}>
                  Try again
                </button>
              </div>
            </Notice>
          ) : (
            <div className="empty">
              <Spinner /> Loading sheet…
            </div>
          )}
        </div>
      ) : sheet.kind === "character" ? (
        <CharacterView
          sheet={sheet}
          hp={hp ?? sheet.hp}
          conditions={link?.conditions?.length ? link.conditions : sheet.conditions}
          onHpChange={onHpChange}
          onRoll={onRoll}
        />
      ) : (
        <MonsterView sheet={sheet} hp={hp ?? sheet.hp} onHpChange={role === "GM" ? onHpChange : undefined} onRoll={onRoll} />
      )}

      {sheet && !hiddenMonster && (
        <div className="footer">
          <span className="grow">
            <span title={sheet.accuracy === "estimated" ? "Install the bridge for D&D Beyond's own numbers" : undefined}>
              {sheet.accuracy === "estimated" ? "⚠ Estimated · " : ""}
            </span>
            {new Date(sheet.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            {error ? ` · refresh failed` : ""}
          </span>
          <button className="btn small ghost" onClick={() => load(true)} disabled={loading}>
            Refresh
          </button>
          {sheet.url && (
            <a className="btn small ghost" href={sheet.url} target="_blank" rel="noopener noreferrer">
              D&amp;D Beyond ↗
            </a>
          )}
        </div>
      )}
    </>
  );
}
