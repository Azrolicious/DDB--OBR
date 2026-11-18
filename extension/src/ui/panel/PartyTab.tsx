import OBR from "@owlbear-rodeo/sdk";
import { useMemo, useState } from "react";
import type { BridgeStatus } from "../../ddb/bridge";
import { parseCharacter } from "../../ddb/character";
import { fetchCampaignCharacters } from "../../ddb/client";
import { parseCampaignId, parseCharacterId } from "../../ddb/ids";
import type { CharacterSheet } from "../../model/sheet";
import { useLinkedItems, useSelection } from "../../obr/hooks";
import { openSheetForActor, openSheetForItem } from "../../obr/popovers";
import { removeFromRoster, upsertRoster, useRoster, type RosterEntry } from "../../obr/roster";
import { useRoomSettings } from "../../obr/settings";
import { getLink, linkItems, pickArtFromLibrary, placeTokens } from "../../obr/tokens";
import { getCachedSheet, removeCachedSheet } from "../../store/cache";
import { loadSheet, saveImportedSheet } from "../../store/sheets";
import { Avatar, HpBar, Notice, Spinner, useAsync } from "../common/ui";

export function PartyTab({ role, bridgeStatus }: { role: "GM" | "PLAYER"; bridgeStatus: BridgeStatus | null }) {
  const roster = useRoster();
  const room = useRoomSettings();
  const linked = useLinkedItems();
  const selection = useSelection();
  const [input, setInput] = useState("");
  const [pasteMode, setPasteMode] = useState(false);
  const [json, setJson] = useState("");
  const [campaignInput, setCampaignInput] = useState("");
  const [busy, error, run, clearError] = useAsync();
  const [message, setMessage] = useState<string | null>(null);

  const bridgeReady = !!bridgeStatus?.installed && !!bridgeStatus.loggedIn;
  const tokensFor = (id: number) => linked.filter((i) => getLink(i)?.kind === "character" && getLink(i)?.ddbId === id);

  const hasSelection = selection.length > 0;
  const knownCampaign = useMemo(() => {
    for (const r of roster) {
      const s = getCachedSheet("character", r.ddbId);
      if (s?.kind === "character" && s.campaign) return s.campaign;
    }
    return undefined;
  }, [roster]);

  const importSheet = async (sheet: CharacterSheet) => {
    saveImportedSheet(sheet);
    await upsertRoster(sheet);
    setMessage(`Imported ${sheet.name}${sheet.accuracy === "estimated" ? " (numbers computed locally)" : ""}.`);
  };

  const onImport = () =>
    run(async () => {
      setMessage(null);
      if (pasteMode) {
        const sheet = parseCharacter(JSON.parse(json));
        await importSheet(sheet);
        setJson("");
        return;
      }
      const id = parseCharacterId(input);
      if (!id) throw new Error("Paste a D&D Beyond character link (…/characters/12345678) or its number.");
      const sheet = await loadSheet("character", id, { refresh: true });
      if (sheet.kind !== "character") throw new Error("That isn't a character.");
      await importSheet(sheet);
      setInput("");
    });

  const onImportCampaign = () =>
    run(async () => {
      setMessage(null);
      const campaignId = parseCampaignId(campaignInput) ?? knownCampaign?.id ?? null;
      if (!campaignId) throw new Error("Paste your campaign link (dndbeyond.com/campaigns/1234567).");
      const characters = await fetchCampaignCharacters(campaignId);
      if (!characters.length) throw new Error("No active characters found in that campaign.");
      let ok = 0;
      for (const c of characters) {
        try {
          const sheet = await loadSheet("character", c.id, { refresh: true });
          if (sheet.kind === "character") {
            saveImportedSheet(sheet);
            await upsertRoster(sheet);
            ok += 1;
          }
        } catch {
          /* skip characters we can't read */
        }
      }
      setMessage(`Imported ${ok} of ${characters.length} campaign characters.`);
    });

  const place = (entry: RosterEntry, chooseArt: boolean) =>
    run(async () => {
      const sheet = await loadSheet("character", entry.ddbId);
      const art = chooseArt ? await pickArtFromLibrary(sheet.name) : undefined;
      if (chooseArt && !art) return;
      await placeTokens([{ sheet, name: sheet.name, art: art ?? undefined }], room);
      OBR.notification.show(`Placed ${sheet.name}`, "SUCCESS");
    });

  const linkSelected = (entry: RosterEntry) =>
    run(async () => {
      const items = await OBR.scene.items.getItems(selection);
      const images = items.filter((i) => i.type === "IMAGE");
      if (!images.length) throw new Error("Select a token on the map first.");
      const sheet = await loadSheet("character", entry.ddbId);
      await linkItems(
        images.map((i) => i.id),
        sheet,
        room,
        false,
      );
      OBR.notification.show(`Linked ${images.length} token${images.length > 1 ? "s" : ""} to ${sheet.name}`, "SUCCESS");
    });

  const refresh = (entry: RosterEntry) =>
    run(async () => {
      const sheet = await loadSheet("character", entry.ddbId, { refresh: true });
      if (sheet.kind === "character") await upsertRoster(sheet);
      setMessage(`Refreshed ${sheet.name}.`);
    });

  const remove = (entry: RosterEntry) =>
    run(async () => {
      await removeFromRoster(entry.ddbId);
      removeCachedSheet("character", entry.ddbId);
    });

  const canRemove = (entry: RosterEntry) => role === "GM" || entry.addedBy === OBR.player.id;

  return (
    <div className="scroll">
      <div className="section-title">Import a character</div>
      <div className="stack">
        {pasteMode ? (
          <>
            <textarea
              rows={5}
              placeholder="Paste the JSON from character-service.dndbeyond.com/character/v5/character/<id>"
              value={json}
              onChange={(e) => setJson(e.target.value)}
            />
            <div className="tiny muted">
              Open <code>https://character-service.dndbeyond.com/character/v5/character/&lt;id&gt;</code> in a browser tab
              (the character must be set to Public), copy everything and paste it here.
            </div>
          </>
        ) : (
          <input
            placeholder="dndbeyond.com/characters/12345678"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              clearError();
            }}
            onKeyDown={(e) => e.key === "Enter" && onImport()}
          />
        )}
        <div className="row">
          <button className="btn primary" onClick={onImport} disabled={busy || (pasteMode ? !json.trim() : !input.trim())}>
            {busy ? <Spinner /> : null} Import
          </button>
          <button className="btn ghost small" onClick={() => setPasteMode(!pasteMode)}>
            {pasteMode ? "Use a link instead" : "Paste JSON instead"}
          </button>
        </div>
        {!bridgeReady && !pasteMode && (
          <div className="tiny muted">
            Without the bridge extension only <em>public</em> characters can be imported, and only if D&amp;D Beyond allows it
            from this site. If importing fails, use “Paste JSON”.
          </div>
        )}
        {error && <Notice kind="error">{error}</Notice>}
        {message && !error && <Notice kind="ok">{message}</Notice>}
      </div>

      {role === "GM" && bridgeReady && (
        <>
          <div className="section-title">Import a whole campaign</div>
          <div className="row">
            <input
              className="grow"
              placeholder={knownCampaign ? `${knownCampaign.name} (from your party)` : "dndbeyond.com/campaigns/1234567"}
              value={campaignInput}
              onChange={(e) => setCampaignInput(e.target.value)}
            />
            <button className="btn" disabled={busy} onClick={onImportCampaign}>
              Import party
            </button>
          </div>
        </>
      )}

      <div className="section-title">
        Party <span className="muted">({roster.length})</span>
      </div>
      {!roster.length && (
        <div className="empty">
          No characters yet. Import one above, or right-click a token → <strong>Link to D&amp;D Beyond</strong>.
        </div>
      )}
      <div className="list">
        {roster.map((entry) => {
          const tokens = tokensFor(entry.ddbId);
          const hp = tokens[0] ? getLink(tokens[0])!.hp : getCachedSheet("character", entry.ddbId)?.hp;
          return (
            <div className="actor-row" key={entry.ddbId}>
              <Avatar url={entry.avatarUrl} />
              <div className="grow">
                <div className="row">
                  <span className="name grow">{entry.name}</span>
                  {hp && (
                    <span className="small">
                      {hp.current}/{hp.max}
                      {hp.temp ? <span className="muted"> +{hp.temp}</span> : null}
                    </span>
                  )}
                </div>
                <div className="tiny muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {entry.summary}
                </div>
                {hp && <HpBar hp={hp} />}
                <div className="row wrap" style={{ marginTop: 5, gap: 4 }}>
                  <button
                    className="btn small"
                    onClick={() => (tokens[0] ? openSheetForItem(tokens[0].id) : openSheetForActor("character", entry.ddbId))}
                  >
                    Sheet
                  </button>
                  <button className="btn small" disabled={busy} onClick={() => place(entry, false)} title="Add a token with the D&D Beyond portrait">
                    Place
                  </button>
                  <button className="btn small" disabled={busy} onClick={() => place(entry, true)} title="Add a token using art from your Owlbear uploads">
                    My art
                  </button>
                  <button
                    className="btn small"
                    disabled={busy || !hasSelection}
                    onClick={() => linkSelected(entry)}
                    title="Link the token(s) you have selected on the map to this character"
                  >
                    Link
                  </button>
                  <button className="btn small ghost" disabled={busy} onClick={() => refresh(entry)} title="Re-download from D&D Beyond">
                    ↻
                  </button>
                  {canRemove(entry) && (
                    <button className="btn small ghost danger" disabled={busy} onClick={() => remove(entry)} title="Remove from this room">
                      ✕
                    </button>
                  )}
                </div>
                {tokens.length > 0 && <div className="tiny muted" style={{ marginTop: 3 }}>{tokens.length} token(s) in this scene</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
