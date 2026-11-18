import OBR, { isImage, type Image, type Theme } from "@owlbear-rodeo/sdk";
import { useEffect, useState } from "react";
import { getLink } from "./tokens";

/** Applies Owlbear's current light/dark palette as CSS variables. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement.style;
  root.setProperty("--primary", theme.primary.main);
  root.setProperty("--primary-contrast", theme.primary.contrastText);
  root.setProperty("--secondary", theme.secondary.main);
  root.setProperty("--paper", theme.background.paper);
  root.setProperty("--bg", theme.background.default);
  root.setProperty("--text", theme.text.primary);
  root.setProperty("--text-2", theme.text.secondary);
  root.setProperty("--text-disabled", theme.text.disabled);
  document.documentElement.dataset.mode = theme.mode.toLowerCase();
}

export function startTheme(): () => void {
  OBR.theme.getTheme().then(applyTheme).catch(() => {});
  return OBR.theme.onChange(applyTheme);
}

export function useObrReady(): boolean {
  const [ready, setReady] = useState(OBR.isReady);
  useEffect(() => {
    if (OBR.isReady) {
      setReady(true);
      return;
    }
    OBR.onReady(() => setReady(true));
  }, []);
  return ready;
}

export function useRole(): "GM" | "PLAYER" {
  const [role, setRole] = useState<"GM" | "PLAYER">("PLAYER");
  useEffect(() => {
    OBR.player.getRole().then(setRole).catch(() => {});
    return OBR.player.onChange((player) => setRole(player.role));
  }, []);
  return role;
}

export function useSceneReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    OBR.scene.isReady().then(setReady).catch(() => {});
    return OBR.scene.onReadyChange(setReady);
  }, []);
  return ready;
}

/** All linked image tokens in the current scene, live. */
export function useLinkedItems(): Image[] {
  const sceneReady = useSceneReady();
  const [items, setItems] = useState<Image[]>([]);
  useEffect(() => {
    if (!sceneReady) {
      setItems([]);
      return;
    }
    const pick = (all: unknown[]) =>
      setItems((all as Image[]).filter((i) => isImage(i) && getLink(i) !== null));
    OBR.scene.items.getItems().then(pick).catch(() => {});
    return OBR.scene.items.onChange(pick);
  }, [sceneReady]);
  return items;
}

/** One item by id, live (null when missing). */
export function useItem(id: string | null): Image | null {
  const sceneReady = useSceneReady();
  const [item, setItem] = useState<Image | null>(null);
  useEffect(() => {
    if (!id || !sceneReady) {
      setItem(null);
      return;
    }
    const pick = (all: unknown[]) => setItem(((all as Image[]).find((i) => i.id === id) as Image) ?? null);
    OBR.scene.items.getItems([id]).then(pick).catch(() => {});
    return OBR.scene.items.onChange(pick);
  }, [id, sceneReady]);
  return item;
}

export function useSelection(): string[] {
  const [selection, setSelection] = useState<string[]>([]);
  useEffect(() => {
    OBR.player.getSelection().then((s) => setSelection(s ?? [])).catch(() => {});
    return OBR.player.onChange((player) => setSelection(player.selection ?? []));
  }, []);
  return selection;
}
