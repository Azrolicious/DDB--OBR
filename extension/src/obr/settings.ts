import OBR from "@owlbear-rodeo/sdk";
import { useEffect, useState } from "react";
import { ROOM_SETTINGS_KEY } from "../constants";

/** Shared by everyone in the room; only the GM can change these. */
export interface RoomSettings {
  /** How often (seconds) to pull HP/AC changes from D&D Beyond. 0 disables. */
  syncSeconds: number;
  /** Mirror HP/AC into the "Stat Bubbles for D&D" extension's metadata. */
  mirrorStatBubbles: boolean;
  /** Mirror rolled initiative into Owlbear's official Initiative Tracker. */
  mirrorInitiative: boolean;
  /** Players see "Bloodied" etc. instead of exact monster HP. */
  hideMonsterHp: boolean;
  /** GM rolls for monsters aren't shown to players. */
  privateMonsterRolls: boolean;
  /** Players may open monster stat blocks (spoilers!). */
  playersSeeMonsterSheets: boolean;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  syncSeconds: 60,
  mirrorStatBubbles: true,
  mirrorInitiative: false,
  hideMonsterHp: true,
  privateMonsterRolls: true,
  playersSeeMonsterSheets: false,
};

/** Stored per browser. */
export interface LocalSettings {
  openSheetOnSelect: boolean;
  shareRolls: boolean;
}

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  openSheetOnSelect: true,
  shareRolls: true,
};

const LOCAL_KEY = "ddb-obr/local-settings";

export function readRoomSettings(metadata: Record<string, unknown>): RoomSettings {
  const value = metadata[ROOM_SETTINGS_KEY];
  return { ...DEFAULT_ROOM_SETTINGS, ...(value && typeof value === "object" ? (value as Partial<RoomSettings>) : {}) };
}

export async function getRoomSettings(): Promise<RoomSettings> {
  return readRoomSettings(await OBR.room.getMetadata());
}

export async function setRoomSettings(update: Partial<RoomSettings>): Promise<void> {
  const current = await getRoomSettings();
  await OBR.room.setMetadata({ [ROOM_SETTINGS_KEY]: { ...current, ...update } });
}

export function getLocalSettings(): LocalSettings {
  try {
    return { ...DEFAULT_LOCAL_SETTINGS, ...JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}") };
  } catch {
    return { ...DEFAULT_LOCAL_SETTINGS };
  }
}

export function setLocalSettings(update: Partial<LocalSettings>): LocalSettings {
  const next = { ...getLocalSettings(), ...update };
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function useRoomSettings(): RoomSettings {
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  useEffect(() => {
    getRoomSettings().then(setSettings).catch(() => {});
    return OBR.room.onMetadataChange((metadata) => setSettings(readRoomSettings(metadata)));
  }, []);
  return settings;
}

export function useLocalSettings(): [LocalSettings, (update: Partial<LocalSettings>) => void] {
  const [settings, setSettings] = useState<LocalSettings>(getLocalSettings);
  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key === LOCAL_KEY) setSettings(getLocalSettings());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);
  return [settings, (update) => setSettings(setLocalSettings(update))];
}
