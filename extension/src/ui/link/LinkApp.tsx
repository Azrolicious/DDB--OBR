import OBR, { type Item } from "@owlbear-rodeo/sdk";
import { useEffect, useState } from "react";
import { bridge } from "../../ddb/bridge";
import { fetchMonsterSheets } from "../../ddb/client";
import { parseCharacterId, parseMonsterId } from "../../ddb/ids";
import type { ActorSheet } from "../../model/sheet";
import { closeLinkPicker, openSheetForItem } from "../../obr/popovers";
import { upsertRoster, useRoster } from "../../obr/roster";
import { useRoomSettings } from "../../obr/settings";
import { getLink, linkItems, unlinkItems } from "../../obr/tokens";
import { putCachedSheet } from "../../store/cache";
import { loadSheet } from "../../store/sheets";
import { Avatar, Notice, Spinner, useAsync } from "../common/ui";
import { useRole } from "../../obr/hooks";

export function LinkApp() {
  const ids = (new URLSearchParams(window.location.search).get("items") ?? "").split(",").filter(Boolean);
  const [items, setItems] = useState<Item[]>([]);
  const roster = useRoster();
  const room = useRoomSettings();
  const role = useRole();
  const [input, setInput] = useState("");
  const [rename, setRename] = useState(false);
  const [hasBridge, setHasBridge] = useState(false);
  const [busy, error, run] = useAsync();

  useEffect(() => {
    OBR.scene.items.getItems(ids).then(setItems).catch(() => {});
    bridge.detect().then(setHasBridge);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linkedCount = items.filter((i) => getLink(i)).length;

  const finish = async (sheet: ActorSheet) => {
    putCachedSheet(sheet);
    if (sheet.kind === "character") await upsertRoster(sheet);
    await linkItems(ids, sheet, room, rename);
    OBR.notification.show(`Linked to ${sheet.name}`, "SUCCESS");
    if (ids.length === 1) await openSheetForItem(ids[0]);
    await closeLinkPicker();
  };

  const linkCharacter = (ddbId: number) =>
    run(async () => {
      const sheet = await loadSheet("character", ddbId);
      await finish(sheet);
    });

  const linkFromInput = () =>
    run(async () => {
      const text = input.trim();
      if (/\/monsters\//.test(text)) {
        const id = parseMonsterId(text);
        if (!id) throw new Error("Couldn't read that monster link.");
        const [sheet] = await fetchMonsterSheets([id]);
        if (!sheet) throw new Error("D&D Beyond didn't return that monster.");
        await finish(sheet);
        return;
      }
      const id = parseCharacterId(text);
      if (!id) throw new Error("Paste a character link (…/characters/12345678) or a monster link (…/monsters/16907-goblin).");
      await finish(await loadSheet("character", id, { refresh: true }));
    });

  return (
    <div className="scroll">
      <div className="row">
        <span className="name grow">
          Link {ids.length === 1 ? `“${items[0]?.name || "token"}”` : `${ids.length} tokens`} to D&amp;D Beyond
        </span>
        <button className="btn ghost" onClick={() => closeLinkPicker()} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="section-title">Party characters</div>
      {!roster.length && <div className="small muted">No characters imported in this room yet — paste a link below.</div>}
      <div className="list">
        {roster.map((r) => (
          <button key={r.ddbId} className="actor-row" style={{ cursor: "pointer", textAlign: "left" }} disabled={busy} onClick={() => linkCharacter(r.ddbId)}>
            <Avatar url={r.avatarUrl} />
            <div className="grow">
              <div className="name">{r.name}</div>
              <div className="tiny muted">{r.summary}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="section-title">Or paste a link</div>
      <div className="stack">
        <input
          placeholder={role === "GM" ? "Character or monster link" : "dndbeyond.com/characters/12345678"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && input.trim() && linkFromInput()}
        />
        {role === "GM" && !hasBridge && (
          <div className="tiny muted">Monster links need the bridge extension.</div>
        )}
        <label className="check small">
          <input type="checkbox" checked={rename} onChange={(e) => setRename(e.target.checked)} />
          Rename the token{ids.length > 1 ? "s" : ""} to match
        </label>
        <div className="row">
          <button className="btn primary" disabled={busy || !input.trim()} onClick={linkFromInput}>
            {busy && <Spinner />} Link
          </button>
          <span className="grow" />
          {linkedCount > 0 && (
            <button
              className="btn ghost danger"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await unlinkItems(ids);
                  await closeLinkPicker();
                })
              }
            >
              Unlink
            </button>
          )}
        </div>
        {error && <Notice kind="error">{error}</Notice>}
      </div>
    </div>
  );
}
