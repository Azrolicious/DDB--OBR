import OBR from "@owlbear-rodeo/sdk";
import { POPOVER_LINK, POPOVER_SHEET } from "../constants";
import type { ActorKind } from "../model/sheet";

const BASE = import.meta.env.BASE_URL;

async function rightEdgeAnchor() {
  const [width, height] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
  return { left: Math.max(460, width - 12), top: 64, height };
}

async function openSheetUrl(query: string) {
  const anchor = await rightEdgeAnchor();
  await OBR.popover.open({
    id: POPOVER_SHEET,
    url: `${BASE}sheet.html?${query}`,
    width: 440,
    height: Math.max(360, Math.min(760, anchor.height - 90)),
    anchorReference: "POSITION",
    anchorPosition: { left: anchor.left, top: anchor.top },
    anchorOrigin: { horizontal: "RIGHT", vertical: "TOP" },
    transformOrigin: { horizontal: "RIGHT", vertical: "TOP" },
    disableClickAway: true,
  });
}

/** Opens the sheet for a token. The sheet then tracks that token's live HP. */
export function openSheetForItem(itemId: string) {
  return openSheetUrl(`item=${encodeURIComponent(itemId)}`);
}

/** Opens a sheet without a token (e.g. from the Party list). */
export function openSheetForActor(kind: ActorKind, ddbId: number) {
  return openSheetUrl(`kind=${kind}&id=${ddbId}`);
}

export function closeSheet() {
  return OBR.popover.close(POPOVER_SHEET);
}

export async function openLinkPicker(itemIds: string[]) {
  const [width, height] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
  await OBR.popover.open({
    id: POPOVER_LINK,
    url: `${BASE}link.html?items=${encodeURIComponent(itemIds.join(","))}`,
    width: 380,
    height: Math.min(560, height - 80),
    anchorReference: "POSITION",
    anchorPosition: { left: width / 2, top: height / 2 },
    anchorOrigin: { horizontal: "CENTER", vertical: "CENTER" },
    transformOrigin: { horizontal: "CENTER", vertical: "CENTER" },
  });
}

export function closeLinkPicker() {
  return OBR.popover.close(POPOVER_LINK);
}
