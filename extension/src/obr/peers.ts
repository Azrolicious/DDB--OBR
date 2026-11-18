/**
 * Sharing full sheets between players over Owlbear's broadcast channel.
 *
 * Only a compact summary lives on each token. When someone opens a sheet that
 * isn't in their local cache and they can't reach D&D Beyond themselves (no
 * bridge), they ask the room. Whoever has the sheet cached (the GM first) sends
 * it back compressed and in small chunks, since broadcast messages are size
 * limited.
 */
import OBR from "@owlbear-rodeo/sdk";
import { CHANNEL_SHEET_CHUNK, CHANNEL_SHEET_REQUEST } from "../constants";
import type { ActorKind, ActorSheet } from "../model/sheet";
import { getCachedSheet } from "../store/cache";

const CHUNK_CHARS = 12000;

interface SheetRequest {
  reqId: string;
  kind: ActorKind;
  ddbId: number;
}

interface SheetChunk {
  reqId: string;
  transferId: string;
  index: number;
  total: number;
  gzip: boolean;
  data: string;
}

function randomId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function encode(text: string): Promise<{ gzip: boolean; data: string }> {
  if (typeof CompressionStream === "undefined") return { gzip: false, data: text };
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return { gzip: true, data: btoa(binary) };
}

async function decode(gzip: boolean, data: string): Promise<string> {
  if (!gzip) return data;
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

/** Asks other players for a sheet. Resolves null if nobody answers in time. */
export async function requestSheetFromPeers(kind: ActorKind, ddbId: number, timeoutMs = 6000): Promise<ActorSheet | null> {
  const reqId = randomId();
  const transfers = new Map<string, SheetChunk[]>();
  return new Promise((resolve) => {
    let done = false;
    const finish = (sheet: ActorSheet | null) => {
      if (done) return;
      done = true;
      unsubscribe();
      window.clearTimeout(timer);
      resolve(sheet);
    };
    const unsubscribe = OBR.broadcast.onMessage(CHANNEL_SHEET_CHUNK, async (event) => {
      const chunk = event.data as SheetChunk;
      if (!chunk || chunk.reqId !== reqId || done) return;
      const parts = transfers.get(chunk.transferId) ?? [];
      parts[chunk.index] = chunk;
      transfers.set(chunk.transferId, parts);
      if (parts.filter(Boolean).length === chunk.total) {
        try {
          const text = await decode(chunk.gzip, parts.map((p) => p.data).join(""));
          const sheet = JSON.parse(text) as ActorSheet;
          if (sheet?.kind === kind && sheet.ddbId === ddbId) finish(sheet);
        } catch {
          transfers.delete(chunk.transferId);
        }
      }
    });
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    OBR.broadcast
      .sendMessage(CHANNEL_SHEET_REQUEST, { reqId, kind, ddbId } satisfies SheetRequest, { destination: "REMOTE" })
      .catch(() => finish(null));
  });
}

/**
 * Answers other players' sheet requests from our local cache. Runs in the
 * always-loaded background page. The GM answers right away; players wait a moment
 * and only answer if nobody else has started sending.
 */
export function serveSheetsToPeers(isGm: () => boolean): () => void {
  const answered = new Set<string>();
  const offChunks = OBR.broadcast.onMessage(CHANNEL_SHEET_CHUNK, (event) => {
    const chunk = event.data as SheetChunk;
    if (chunk?.reqId) answered.add(chunk.reqId);
  });
  const offRequests = OBR.broadcast.onMessage(CHANNEL_SHEET_REQUEST, async (event) => {
    const req = event.data as SheetRequest;
    if (!req?.reqId || (req.kind !== "character" && req.kind !== "monster")) return;
    const sheet = getCachedSheet(req.kind, Number(req.ddbId));
    if (!sheet) return;
    if (!isGm()) {
      await new Promise((r) => setTimeout(r, 700 + Math.random() * 600));
      if (answered.has(req.reqId)) return;
    }
    answered.add(req.reqId);
    const { gzip, data } = await encode(JSON.stringify(sheet));
    const total = Math.ceil(data.length / CHUNK_CHARS) || 1;
    const transferId = randomId();
    for (let index = 0; index < total; index++) {
      const chunk: SheetChunk = {
        reqId: req.reqId,
        transferId,
        index,
        total,
        gzip,
        data: data.slice(index * CHUNK_CHARS, (index + 1) * CHUNK_CHARS),
      };
      await OBR.broadcast.sendMessage(CHANNEL_SHEET_CHUNK, chunk, { destination: "REMOTE" });
      if (total > 1) await new Promise((r) => setTimeout(r, 60));
    }
  });
  return () => {
    offChunks();
    offRequests();
  };
}
