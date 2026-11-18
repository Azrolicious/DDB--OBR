import { INTEROP_INITIATIVE_KEY, INTEROP_STAT_BUBBLES_KEY } from "../constants";
import { plain, type ActorLink } from "../model/sheet";
import type { RoomSettings } from "./settings";

/** Copies HP/AC/initiative into community extensions' metadata so their UI shows our data. */
export function applyInterop(metadata: Record<string, unknown>, link: ActorLink, settings: RoomSettings): void {
  if (settings.mirrorStatBubbles) {
    const previous = plain(metadata[INTEROP_STAT_BUBBLES_KEY] as Record<string, unknown> | undefined) ?? {};
    metadata[INTEROP_STAT_BUBBLES_KEY] = {
      ...previous,
      health: link.hp.current,
      "max health": link.hp.max,
      "temporary health": link.hp.temp,
      "armor class": link.ac,
      hide: link.kind === "monster" ? (previous.hide ?? settings.hideMonsterHp) : (previous.hide ?? false),
    };
  }
  if (settings.mirrorInitiative && link.initiative !== null && link.initiative !== undefined) {
    const previous = plain(metadata[INTEROP_INITIATIVE_KEY] as Record<string, unknown> | undefined) ?? {};
    metadata[INTEROP_INITIATIVE_KEY] = { active: false, ...previous, count: String(link.initiative) };
  }
}
