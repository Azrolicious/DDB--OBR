/**
 * Always-loaded background page: context menus, opening the sheet when a linked
 * token is selected, answering other players' sheet requests, showing shared
 * rolls, and syncing HP/AC from D&D Beyond.
 */
import OBR from "@owlbear-rodeo/sdk";
import { ACTOR_KEY, CHANNEL_SHEET_HEARTBEAT, CONTEXT_LINK, CONTEXT_OPEN_SHEET } from "../constants";
import { listenForRemoteRolls } from "../dice/rolls";
import { serveSheetsToPeers } from "../obr/peers";
import { openLinkPicker, openSheetForItem } from "../obr/popovers";
import { DEFAULT_ROOM_SETTINGS, getLocalSettings, readRoomSettings, type RoomSettings } from "../obr/settings";
import { startSync } from "../obr/sync";
import { getLink } from "../obr/tokens";

const BASE = import.meta.env.BASE_URL;
const hasLink = { key: ["metadata", ACTOR_KEY], value: undefined, operator: "!=" as const };

OBR.onReady(async () => {
  let role: "GM" | "PLAYER" = await OBR.player.getRole();
  let settings: RoomSettings = DEFAULT_ROOM_SETTINGS;
  let lastSelection = "";
  let sheetHeartbeat = 0;
  OBR.broadcast.onMessage(CHANNEL_SHEET_HEARTBEAT, () => (sheetHeartbeat = Date.now()));

  OBR.room.getMetadata().then((m) => (settings = readRoomSettings(m))).catch(() => {});
  OBR.room.onMetadataChange((m) => (settings = readRoomSettings(m)));

  await OBR.contextMenu.create({
    id: CONTEXT_OPEN_SHEET,
    icons: [
      {
        icon: `${BASE}sheet.svg`,
        label: "Open D&D Beyond Sheet",
        filter: { max: 1, every: [hasLink] },
      },
    ],
    onClick(context) {
      const item = context.items[0];
      if (item) openSheetForItem(item.id);
    },
  });

  await OBR.contextMenu.create({
    id: CONTEXT_LINK,
    icons: [
      {
        icon: `${BASE}link.svg`,
        label: "Change D&D Beyond Link",
        filter: { every: [{ key: "layer", value: "CHARACTER" }, { key: "type", value: "IMAGE" }, hasLink] },
      },
      {
        icon: `${BASE}link.svg`,
        label: "Link to D&D Beyond",
        filter: { every: [{ key: "layer", value: "CHARACTER" }, { key: "type", value: "IMAGE" }] },
      },
    ],
    onClick(context) {
      openLinkPicker(context.items.map((i) => i.id));
    },
  });

  // Clicking a linked token opens its sheet (can be turned off in Settings).
  OBR.player.onChange(async (player) => {
    role = player.role;
    const selection = player.selection ?? [];
    const key = selection.join(",");
    if (key === lastSelection) return;
    lastSelection = key;
    if (selection.length !== 1 || !getLocalSettings().openSheetOnSelect) return;
    // An open sheet follows the selection by itself; reopening would reload it.
    if (Date.now() - sheetHeartbeat < 4000) return;
    try {
      const [item] = await OBR.scene.items.getItems(selection);
      const link = item ? getLink(item) : null;
      if (!item || !link) return;
      if (link.kind === "monster" && role !== "GM" && !settings.playersSeeMonsterSheets) return;
      await openSheetForItem(item.id);
    } catch {
      /* scene changed underneath us */
    }
  });

  serveSheetsToPeers(() => role === "GM");
  listenForRemoteRolls();
  startSync(
    () => settings,
    () => role === "GM",
  );
});
