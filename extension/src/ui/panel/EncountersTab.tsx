import OBR from "@owlbear-rodeo/sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { EXT_ID } from "../../constants";
import type { BridgeStatus } from "../../ddb/bridge";
import { fetchEncounter, fetchMonsterSheets, listEncounters } from "../../ddb/client";
import { parseEncounterId, parseMonsterId } from "../../ddb/ids";
import type { EncounterDetail, EncounterSummary } from "../../ddb/monster";
import { isValidExpression, roll } from "../../dice/dice";
import type { MonsterSheet } from "../../model/sheet";
import { useLinkedItems } from "../../obr/hooks";
import { useRoomSettings, type RoomSettings } from "../../obr/settings";
import { getLink, pickArtFromLibrary, placeTokens, type PlaceSpec, type TokenArt } from "../../obr/tokens";
import { putCachedSheet } from "../../store/cache";
import { Avatar, Notice, Spinner, useAsync } from "../common/ui";

const SYNC_KEY = `${EXT_ID}/encounter-sync`;
const WATCH_SECONDS = 30;

interface SyncState {
  encounterId: string;
  placed: Record<string, number>;
}

async function readSync(): Promise<SyncState | null> {
  const value = (await OBR.scene.getMetadata())[SYNC_KEY] as SyncState | undefined;
  return value?.encounterId ? value : null;
}

function withHp(sheet: MonsterSheet, rollHp: boolean): MonsterSheet {
  if (!rollHp || !sheet.hitDice) return sheet;
  const expression = sheet.hitDice.replace(/\s+/g, "");
  if (!isValidExpression(expression)) return sheet;
  const value = Math.max(1, roll(expression).total);
  return { ...sheet, hp: { current: value, max: value, temp: 0 } };
}

function buildSpecs(
  rows: { sheet: MonsterSheet; count: number }[],
  existingNames: string[],
  art: Record<number, TokenArt>,
  hidden: boolean,
  rollHp: boolean,
): PlaceSpec[] {
  const specs: PlaceSpec[] = [];
  const counters = new Map<string, number>();
  for (const { sheet, count } of rows) {
    let n = counters.get(sheet.name) ?? existingNames.filter((name) => name.startsWith(`${sheet.name} `)).length;
    for (let i = 0; i < count; i++) {
      n += 1;
      specs.push({ sheet: withHp(sheet, rollHp), name: `${sheet.name} ${n}`, art: art[sheet.ddbId], visible: !hidden });
    }
    counters.set(sheet.name, n);
  }
  return specs;
}

export function EncountersTab({ bridgeStatus }: { bridgeStatus: BridgeStatus | null }) {
  const room = useRoomSettings();
  const linked = useLinkedItems();
  const [encounters, setEncounters] = useState<EncounterSummary[] | null>(null);
  const [detail, setDetail] = useState<EncounterDetail | null>(null);
  const [monsters, setMonsters] = useState<Map<number, MonsterSheet>>(new Map());
  const [art, setArt] = useState<Record<number, TokenArt>>({});
  const [hidden, setHidden] = useState(true);
  const [rollHp, setRollHp] = useState(false);
  const [watch, setWatch] = useState(false);
  const [filter, setFilter] = useState("");
  const [quickMonster, setQuickMonster] = useState("");
  const [busy, error, run] = useAsync();
  const [message, setMessage] = useState<string | null>(null);
  const ready = !!bridgeStatus?.installed && !!bridgeStatus.loggedIn;
  const existingNames = linked.filter((i) => getLink(i)?.kind === "monster").map((i) => i.name);

  // The watch timer outlives renders, so it reads the latest values through a ref.
  const latest = useRef<{ room: RoomSettings; monsters: Map<number, MonsterSheet>; art: Record<number, TokenArt>; hidden: boolean; rollHp: boolean; existingNames: string[] }>(null!);
  latest.current = { room, monsters, art, hidden, rollHp, existingNames };

  const loadList = () =>
    run(async () => {
      setEncounters(await listEncounters());
    });

  useEffect(() => {
    if (ready && !encounters) loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const openEncounter = (id: string) =>
    run(async () => {
      setMessage(null);
      const enc = await fetchEncounter(id);
      const sheets = await fetchMonsterSheets(enc.monsters.map((m) => m.monsterId));
      sheets.forEach(putCachedSheet);
      setMonsters(new Map(sheets.map((s) => [s.ddbId, s])));
      setDetail(enc);
      const sync = await readSync();
      setWatch(sync?.encounterId === enc.id && watch);
    });

  const placeRows = async (enc: EncounterDetail, counts: Record<string, number>) => {
    const now = latest.current;
    const rows = enc.monsters
      .filter((m) => counts[m.key] > 0 && now.monsters.has(m.monsterId))
      .map((m) => ({ sheet: now.monsters.get(m.monsterId)!, count: counts[m.key] }));
    const specs = buildSpecs(rows, now.existingNames, now.art, now.hidden, now.rollHp);
    await placeTokens(specs, now.room);
    return specs.length;
  };

  const addAll = () =>
    run(async () => {
      if (!detail) return;
      const counts = Object.fromEntries(detail.monsters.map((m) => [m.key, m.quantity]));
      const placed = await placeRows(detail, counts);
      await OBR.scene.setMetadata({ [SYNC_KEY]: { encounterId: detail.id, placed: counts } satisfies SyncState });
      setMessage(`Placed ${placed} token${placed === 1 ? "" : "s"}${hidden ? " (hidden from players — reveal them when ready)" : ""}.`);
    });

  const addOne = (monsterId: number) =>
    run(async () => {
      const sheet = monsters.get(monsterId);
      if (!sheet) return;
      await placeTokens(buildSpecs([{ sheet, count: 1 }], existingNames, art, hidden, rollHp), room);
    });

  const chooseArt = (sheet: MonsterSheet) =>
    run(async () => {
      const picked = await pickArtFromLibrary(sheet.name);
      if (picked) setArt((a) => ({ ...a, [sheet.ddbId]: picked }));
    });

  const addQuickMonster = () =>
    run(async () => {
      const id = parseMonsterId(quickMonster);
      if (!id) throw new Error("Paste a monster link like dndbeyond.com/monsters/16907-goblin");
      const [sheet] = await fetchMonsterSheets([id]);
      if (!sheet) throw new Error("D&D Beyond didn't return that monster.");
      putCachedSheet(sheet);
      await placeTokens(buildSpecs([{ sheet, count: 1 }], existingNames, art, hidden, rollHp), room);
      setQuickMonster("");
    });

  // "Watch" mode: pick up monsters added to the encounter on D&D Beyond.
  useEffect(() => {
    if (!watch || !detail) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const enc = await fetchEncounter(detail.id);
        const sync = (await readSync()) ?? { encounterId: enc.id, placed: {} };
        if (sync.encounterId !== enc.id) return;
        const known = latest.current.monsters;
        const missing = enc.monsters.filter((m) => !known.has(m.monsterId)).map((m) => m.monsterId);
        if (missing.length) {
          const extra = await fetchMonsterSheets(missing);
          extra.forEach(putCachedSheet);
          const merged = new Map(known);
          extra.forEach((sheet) => merged.set(sheet.ddbId, sheet));
          latest.current.monsters = merged;
          setMonsters(merged);
        }
        const diff: Record<string, number> = {};
        for (const m of enc.monsters) diff[m.key] = Math.max(0, m.quantity - (sync.placed[m.key] ?? 0));
        if (Object.values(diff).some((n) => n > 0) && !cancelled) {
          const placed = await placeRows(enc, diff);
          const next = { ...sync.placed };
          for (const m of enc.monsters) next[m.key] = Math.max(next[m.key] ?? 0, m.quantity);
          await OBR.scene.setMetadata({ [SYNC_KEY]: { encounterId: enc.id, placed: next } satisfies SyncState });
          OBR.notification.show(`Added ${placed} new monster token(s) from “${enc.name}”`, "INFO");
        }
        if (!cancelled) setDetail(enc);
      } catch (e) {
        console.warn("[DDB-OBR] encounter watch failed", e);
      }
    };
    const timer = window.setInterval(tick, WATCH_SECONDS * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch, detail?.id]);

  const shown = useMemo(
    () => (encounters ?? []).filter((e) => !filter || e.name.toLowerCase().includes(filter.toLowerCase())),
    [encounters, filter],
  );

  if (!ready) {
    return (
      <div className="scroll">
        <Notice>
          Pulling encounters needs the <strong>DDB-OBR Bridge</strong> browser extension and a D&amp;D Beyond login in this
          browser. See the Settings tab for setup.
        </Notice>
      </div>
    );
  }

  const totalMonsters = detail?.monsters.reduce((n, m) => n + m.quantity, 0) ?? 0;

  return (
    <div className="scroll">
      {!detail ? (
        <>
          <div className="row">
            <input className="grow" placeholder="Search, or paste an encounter link" value={filter} onChange={(e) => setFilter(e.target.value)} />
            {parseEncounterId(filter) ? (
              <button className="btn primary" disabled={busy} onClick={() => openEncounter(parseEncounterId(filter)!)}>
                Open
              </button>
            ) : (
              <button className="btn" disabled={busy} onClick={loadList} title="Reload your encounters">
                {busy ? <Spinner /> : "↻"}
              </button>
            )}
          </div>
          {error && <div style={{ marginTop: 8 }}><Notice kind="error">{error}</Notice></div>}
          <div className="section-title">Your D&amp;D Beyond encounters</div>
          {encounters === null && busy && (
            <div className="empty">
              <Spinner /> Loading…
            </div>
          )}
          {encounters && !shown.length && <div className="empty">No encounters found. Build one at dndbeyond.com/encounter-builder.</div>}
          <div className="list">
            {shown.map((e) => (
              <button key={e.id} className="actor-row" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => openEncounter(e.id)} disabled={busy}>
                <div className="grow">
                  <div className="name">{e.name}</div>
                  <div className="tiny muted">
                    {e.monsterCount} monster{e.monsterCount === 1 ? "" : "s"}
                    {e.campaignName ? ` · ${e.campaignName}` : ""}
                  </div>
                </div>
                <span className="muted">›</span>
              </button>
            ))}
          </div>
          <div className="section-title">Quick add a monster</div>
          <div className="row">
            <input className="grow" placeholder="dndbeyond.com/monsters/16907-goblin" value={quickMonster} onChange={(e) => setQuickMonster(e.target.value)} />
            <button className="btn" disabled={busy || !quickMonster.trim()} onClick={addQuickMonster}>
              Add
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="row">
            <button className="btn small ghost" onClick={() => { setDetail(null); setWatch(false); }}>
              ‹ Back
            </button>
            <span className="name grow">{detail.name}</span>
            {busy && <Spinner />}
          </div>
          {detail.campaignName && <div className="tiny muted">{detail.campaignName}</div>}
          {error && <div style={{ marginTop: 8 }}><Notice kind="error">{error}</Notice></div>}
          {message && !error && <div style={{ marginTop: 8 }}><Notice kind="ok">{message}</Notice></div>}

          {(detail.groups.length ? detail.groups : [{ id: "_", name: undefined, order: 0 }]).map((group) => {
            const rows = detail.monsters.filter((m) => (detail.groups.length ? m.groupId === group.id : true));
            if (!rows.length) return null;
            return (
              <div key={group.id}>
                <div className="section-title">{group.name || "Monsters"}</div>
                <div className="list">
                  {rows.map((m) => {
                    const sheet = monsters.get(m.monsterId);
                    return (
                      <div className="actor-row" key={m.key}>
                        <Avatar url={art[m.monsterId]?.url ?? sheet?.avatarUrl} />
                        <div className="grow">
                          <div className="row">
                            <span className="name grow">{sheet?.name ?? m.name ?? `Monster ${m.monsterId}`}</span>
                            <span className="chip">×{m.quantity}</span>
                          </div>
                          {sheet && (
                            <div className="stat-chips">
                              <span className="chip">CR {sheet.challenge}</span>
                              <span className="chip">AC {sheet.ac}</span>
                              <span className="chip">HP {sheet.hp.max}</span>
                              <span className="chip">Init {sheet.initiative >= 0 ? "+" : ""}{sheet.initiative}</span>
                            </div>
                          )}
                          {sheet && (
                            <div className="row" style={{ marginTop: 4, gap: 4 }}>
                              <button className="btn small" disabled={busy} onClick={() => addOne(m.monsterId)}>
                                + 1
                              </button>
                              <button className="btn small" disabled={busy} onClick={() => chooseArt(sheet)} title="Use art from your Owlbear uploads for this monster">
                                {art[m.monsterId] ? "Change art" : "Use my art"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="section-title">Options</div>
          <label className="check">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
            <span>Place hidden (only you can see them until revealed)</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={rollHp} onChange={(e) => setRollHp(e.target.checked)} />
            <span>Roll hit points instead of using the average</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={watch} onChange={(e) => setWatch(e.target.checked)} />
            <span>
              Watch this encounter: monsters you add on D&amp;D Beyond appear here automatically (checks every {WATCH_SECONDS}s while
              this panel is open)
            </span>
          </label>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary grow" disabled={busy || !totalMonsters} onClick={addAll}>
              Add {totalMonsters} token{totalMonsters === 1 ? "" : "s"} to scene
            </button>
          </div>
          {detail.playerCharacterIds.length > 0 && (
            <div className="tiny muted" style={{ marginTop: 8 }}>
              This encounter includes {detail.playerCharacterIds.length} player character(s). Import them from the Party tab
              (“Import a whole campaign”) to link their tokens.
            </div>
          )}
        </>
      )}
    </div>
  );
}
