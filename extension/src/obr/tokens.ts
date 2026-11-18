import OBR, { buildImage, isImage, type Image, type Item } from "@owlbear-rodeo/sdk";
import { ACTOR_KEY } from "../constants";
import { linkFromSheet, plain, type ActorLink, type ActorSheet } from "../model/sheet";
import { applyInterop } from "./interop";
import type { RoomSettings } from "./settings";

export { applyDamage } from "../model/sheet";

export const DEFAULT_TOKEN_URL = new URL(`${import.meta.env.BASE_URL}default-token.png`, window.location.href).href;

export function getLink(item: Item): ActorLink | null {
  const value = item.metadata[ACTOR_KEY] as ActorLink | undefined;
  return value && value.v === 1 && typeof value.ddbId === "number" ? value : null;
}

export function isLinked(item: Item): item is Image {
  return isImage(item) && getLink(item) !== null;
}

export async function getLinkedItems(): Promise<Image[]> {
  return OBR.scene.items.getItems((item) => isImage(item) && getLink(item) !== null) as Promise<Image[]>;
}

/** Updates links on items, applying interop. `mutate` returns false to skip an item. */
export async function updateLinks(
  ids: string[],
  settings: RoomSettings,
  mutate: (link: ActorLink, item: Image) => ActorLink | false,
): Promise<void> {
  if (!ids.length) return;
  await OBR.scene.items.updateItems(ids, (drafts) => {
    for (const draft of drafts) {
      const link = plain(draft.metadata[ACTOR_KEY] as ActorLink | undefined);
      if (!link || link.v !== 1) continue;
      const next = mutate(link, draft as unknown as Image);
      if (!next) continue;
      draft.metadata[ACTOR_KEY] = next;
      applyInterop(draft.metadata, next, settings);
    }
  });
}

export async function linkItems(ids: string[], sheet: ActorSheet, settings: RoomSettings, rename: boolean): Promise<void> {
  const items = await OBR.scene.items.getItems(ids);
  let n = 0;
  await OBR.scene.items.updateItems(
    items.map((i) => i.id),
    (drafts) => {
      for (const draft of drafts) {
        const previous = plain(draft.metadata[ACTOR_KEY] as ActorLink | undefined);
        const sameActor = previous?.ddbId === sheet.ddbId && previous.kind === sheet.kind;
        const link = linkFromSheet(sheet, sameActor ? previous : undefined);
        draft.metadata[ACTOR_KEY] = link;
        applyInterop(draft.metadata, link, settings);
        if (rename) {
          n += 1;
          const name = sheet.kind === "monster" && drafts.length > 1 ? `${sheet.name} ${n}` : sheet.name;
          draft.name = name;
          if (isImage(draft as unknown as Item)) {
            (draft as unknown as Image).text.plainText = name;
          }
        }
      }
    },
  );
}

export async function unlinkItems(ids: string[]): Promise<void> {
  await OBR.scene.items.updateItems(ids, (drafts) => {
    for (const draft of drafts) delete draft.metadata[ACTOR_KEY];
  });
}

// ------------------------------------------------------------ placing tokens

function loadImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new window.Image();
    const timer = window.setTimeout(() => resolve({ width: 256, height: 256 }), 6000);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve({ width: img.naturalWidth || 256, height: img.naturalHeight || 256 });
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve({ width: 256, height: 256 });
    };
    img.src = url;
  });
}

function mimeFor(url: string): string {
  const path = url.split("?")[0].toLowerCase();
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".svg")) return "image/svg+xml";
  return "image/jpeg";
}

export interface TokenArt {
  url: string;
  width?: number;
  height?: number;
  mime?: string;
  /** Existing grid dpi from an Owlbear asset; overrides size-based dpi. */
  dpi?: number;
}

export interface PlaceSpec {
  sheet: ActorSheet;
  name: string;
  art?: TokenArt;
  visible?: boolean;
}

/** The scene position at the centre of the player's current view, snapped to the grid. */
export async function viewCenter(): Promise<{ x: number; y: number }> {
  const [width, height] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
  const center = await OBR.viewport.inverseTransformPoint({ x: width / 2, y: height / 2 });
  return OBR.scene.grid.snapPosition(center);
}

/** Places tokens in a loose grid around the view centre. Returns the new item ids. */
export async function placeTokens(specs: PlaceSpec[], settings: RoomSettings): Promise<string[]> {
  if (!specs.length) return [];
  const [dpi, center] = await Promise.all([OBR.scene.grid.getDpi(), viewCenter()]);
  const columns = Math.ceil(Math.sqrt(specs.length));
  const cellSize = Math.max(...specs.map((s) => Math.max(1, s.sheet.sizeCells))) * dpi;
  const items: Item[] = [];
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const art = spec.art ?? { url: spec.sheet.avatarUrl || DEFAULT_TOKEN_URL };
    const size = art.width && art.height ? { width: art.width, height: art.height } : await loadImageSize(art.url);
    const cells = Math.max(0.5, spec.sheet.sizeCells);
    const imageDpi = art.dpi ?? size.width / cells;
    const row = Math.floor(i / columns);
    const col = i % columns;
    const position = {
      x: center.x + (col - (columns - 1) / 2) * cellSize,
      y: center.y + (row - (Math.ceil(specs.length / columns) - 1) / 2) * cellSize,
    };
    const link = linkFromSheet(spec.sheet);
    const metadata: Record<string, unknown> = { [ACTOR_KEY]: link };
    applyInterop(metadata, link, settings);
    const item = buildImage(
      { url: art.url, width: size.width, height: size.height, mime: art.mime ?? mimeFor(art.url) },
      { dpi: imageDpi, offset: { x: size.width / 2, y: size.height / 2 } },
    )
      .name(spec.name)
      .plainText(spec.name)
      .layer("CHARACTER")
      .position(await OBR.scene.grid.snapPosition(position))
      .visible(spec.visible ?? true)
      .metadata(metadata)
      .build();
    items.push(item);
  }
  await OBR.scene.items.addItems(items);
  return items.map((i) => i.id);
}

/** Opens Owlbear's own image picker so users can use art they've uploaded. */
export async function pickArtFromLibrary(search: string): Promise<TokenArt | null> {
  const picked = await OBR.assets.downloadImages(false, search, "CHARACTER");
  const first = picked?.[0];
  if (!first) return null;
  return { url: first.image.url, width: first.image.width, height: first.image.height, mime: first.image.mime, dpi: first.grid.dpi };
}
