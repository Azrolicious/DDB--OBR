import OBR, { type Image } from "@owlbear-rodeo/sdk";
import { useEffect, useState } from "react";
import { ACTOR_KEY, COMBAT_KEY, INTEROP_INITIATIVE_KEY } from "../constants";
import { roll } from "../dice/dice";
import { plain, type ActorLink } from "../model/sheet";
import type { RoomSettings } from "./settings";
import { getLink, updateLinks } from "./tokens";

export interface CombatState {
  round: number;
  activeId: string | null;
}

export const EMPTY_COMBAT: CombatState = { round: 0, activeId: null };

export function readCombat(metadata: Record<string, unknown>): CombatState {
  const value = metadata[COMBAT_KEY] as Partial<CombatState> | undefined;
  return { ...EMPTY_COMBAT, ...(value ?? {}) };
}

export async function setCombat(state: CombatState): Promise<void> {
  await OBR.scene.setMetadata({ [COMBAT_KEY]: state });
}

export function useCombat(): CombatState {
  const [state, setState] = useState<CombatState>(EMPTY_COMBAT);
  useEffect(() => {
    let off = () => {};
    const start = () => {
      OBR.scene.getMetadata().then((m) => setState(readCombat(m))).catch(() => {});
      off = OBR.scene.onMetadataChange((m) => setState(readCombat(m)));
    };
    const offReady = OBR.scene.onReadyChange((ready) => {
      off();
      if (ready) start();
      else setState(EMPTY_COMBAT);
    });
    OBR.scene.isReady().then((ready) => ready && start());
    return () => {
      off();
      offReady();
    };
  }, []);
  return state;
}

/** Highest initiative first; ties broken by initiative bonus, then name. */
export function sortByInitiative(items: Image[]): Image[] {
  return [...items].sort((a, b) => {
    const la = getLink(a)!;
    const lb = getLink(b)!;
    const ia = la.initiative ?? -Infinity;
    const ib = lb.initiative ?? -Infinity;
    if (ia !== ib) return ib - ia;
    if (la.initiativeBonus !== lb.initiativeBonus) return lb.initiativeBonus - la.initiativeBonus;
    return a.name.localeCompare(b.name);
  });
}

export async function rollInitiative(items: Image[], settings: RoomSettings): Promise<void> {
  await updateLinks(
    items.map((i) => i.id),
    settings,
    (link: ActorLink) => {
      const result = roll(`1d20${link.initiativeBonus >= 0 ? "+" : ""}${link.initiativeBonus}`);
      return { ...link, initiative: result.total };
    },
  );
}

export async function clearInitiative(items: Image[]): Promise<void> {
  await OBR.scene.items.updateItems(
    items.map((i) => i.id),
    (drafts) => {
      for (const d of drafts) {
        const link = plain(d.metadata[ACTOR_KEY] as ActorLink | undefined);
        if (link) d.metadata[ACTOR_KEY] = { ...link, initiative: null };
        delete d.metadata[INTEROP_INITIATIVE_KEY];
      }
    },
  );
  await setCombat(EMPTY_COMBAT);
}

/** Moves the turn marker. Also flags the active token for the official tracker. */
export async function advanceTurn(ordered: Image[], state: CombatState, direction: 1 | -1, settings: RoomSettings) {
  const withInit = ordered.filter((i) => getLink(i)?.initiative !== null && getLink(i)?.initiative !== undefined);
  if (!withInit.length) return;
  const index = withInit.findIndex((i) => i.id === state.activeId);
  let nextIndex = index + direction;
  let round = Math.max(1, state.round);
  if (index === -1) {
    nextIndex = 0;
    round = Math.max(1, state.round || 1);
  } else if (nextIndex >= withInit.length) {
    nextIndex = 0;
    round += 1;
  } else if (nextIndex < 0) {
    nextIndex = withInit.length - 1;
    round = Math.max(1, round - 1);
  }
  const active = withInit[nextIndex];
  await setCombat({ round, activeId: active.id });
  if (settings.mirrorInitiative) {
    await OBR.scene.items.updateItems(
      withInit.map((i) => i.id),
      (drafts) => {
        for (const d of drafts) {
          const previous = plain(d.metadata[INTEROP_INITIATIVE_KEY] as Record<string, unknown> | undefined) ?? {};
          d.metadata[INTEROP_INITIATIVE_KEY] = { ...previous, active: d.id === active.id };
        }
      },
    );
  }
}
