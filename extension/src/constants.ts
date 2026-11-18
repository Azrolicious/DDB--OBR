/**
 * Central identifiers for the extension.
 *
 * EXT_ID namespaces every piece of data we store in Owlbear Rodeo (item, scene,
 * room and player metadata, broadcast channels, popover ids). Changing it after
 * people have used the extension orphans their existing links, so pick a final
 * name before sharing it widely.
 */
export const EXT_ID = "com.ddb-obr";
export const EXT_NAME = "DDB-OBR";
export const EXT_TITLE = "D&D Beyond Bridge";
export const EXT_VERSION = "0.1.0";

/** Item metadata: the compact actor summary that links a token to D&D Beyond. */
export const ACTOR_KEY = `${EXT_ID}/actor`;
/** Scene metadata: initiative/turn state for the combat tracker. */
export const COMBAT_KEY = `${EXT_ID}/combat`;
/** Room metadata: shared settings (GM controlled). */
export const ROOM_SETTINGS_KEY = `${EXT_ID}/settings`;
/** Room metadata: the list of characters imported into this room (compact). */
export const ROSTER_KEY = `${EXT_ID}/roster`;

export const CHANNEL_SHEET_REQUEST = `${EXT_ID}/sheet-request`;
export const CHANNEL_SHEET_CHUNK = `${EXT_ID}/sheet-chunk`;
export const CHANNEL_ROLL = `${EXT_ID}/roll`;
/** LOCAL heartbeat from an open sheet popover, so the background knows it is open. */
export const CHANNEL_SHEET_HEARTBEAT = `${EXT_ID}/sheet-heartbeat`;

export const POPOVER_SHEET = `${EXT_ID}/sheet`;
export const POPOVER_LINK = `${EXT_ID}/link`;
export const CONTEXT_OPEN_SHEET = `${EXT_ID}/context-open-sheet`;
export const CONTEXT_LINK = `${EXT_ID}/context-link`;

/** Message tag used between the web page and the companion browser extension. */
export const BRIDGE_TAG = "ddb-obr-bridge";

/**
 * Interop with popular community extensions. When enabled in settings we mirror
 * values into their metadata so their UI (HP bubbles, initiative list) just works.
 * These keys come from those extensions' public source; if they ever change,
 * update them here.
 */
export const INTEROP_STAT_BUBBLES_KEY = "com.owlbear-rodeo-bubbles-extension/metadata";
export const INTEROP_INITIATIVE_KEY = "rodeo.owlbear.initiative-tracker/metadata";
