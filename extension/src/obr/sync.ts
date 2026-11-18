/**
 * Keeps character tokens in step with D&D Beyond: when a player changes HP or AC
 * on their D&D Beyond sheet, the token follows. Changes made in Owlbear are kept
 * until D&D Beyond reports a *different* value than it did last time, so neither
 * side silently overwrites the other.
 *
 * Runs in the background page of clients that have the bridge installed. The GM
 * syncs every character; a player syncs only characters they own on D&D Beyond.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import OBR from "@owlbear-rodeo/sdk";
import { bridge, type BridgeStatus } from "../ddb/bridge";
import { fetchCharacterSummaries } from "../ddb/client";
import type { HitPoints } from "../model/sheet";
import { getCachedSheet } from "../store/cache";
import { loadSheet } from "../store/sheets";
import type { RoomSettings } from "./settings";
import { getLink, getLinkedItems, updateLinks } from "./tokens";

function sameHp(a: HitPoints | undefined, b: HitPoints): boolean {
  return !!a && a.current === b.current && a.max === b.max && a.temp === b.temp;
}

export function startSync(getSettings: () => RoomSettings, isGm: () => boolean): () => void {
  let stopped = false;
  let timer = 0;
  let status: BridgeStatus | null = null;
  let statusAt = 0;
  let tick = 0;

  const schedule = () => {
    if (stopped) return;
    const seconds = Math.max(15, getSettings().syncSeconds || 60);
    timer = window.setTimeout(run, seconds * 1000);
  };

  async function currentStatus(): Promise<BridgeStatus> {
    if (!status || Date.now() - statusAt > 10 * 60 * 1000) {
      status = await bridge.status();
      statusAt = Date.now();
    }
    return status;
  }

  async function run() {
    tick += 1;
    try {
      const settings = getSettings();
      if (!settings.syncSeconds || !(await OBR.scene.isReady())) return;
      if (!(await bridge.detect())) return;
      const s = await currentStatus();
      if (!s.loggedIn) return;

      const items = (await getLinkedItems()).filter((i) => getLink(i)?.kind === "character");
      let ids = [...new Set(items.map((i) => getLink(i)!.ddbId))];
      if (!isGm()) {
        ids = ids.filter((id) => {
          const sheet = getCachedSheet("character", id);
          return sheet?.kind === "character" && sheet.userId !== undefined && sheet.userId === s.userId;
        });
      }
      if (!ids.length) return;

      const fresh = new Map<number, { hp: HitPoints; ac: number }>();
      let summaries = new Map<number, any>();
      try {
        summaries = await fetchCharacterSummaries(ids);
      } catch {
        // fall through to full sheet fetches below
      }
      for (const [id, summary] of summaries) {
        const hp = summary?.hitPointInfo;
        if (!hp || !Number.isFinite(hp.maximum)) continue;
        fresh.set(id, {
          hp: { current: Number(hp.current ?? hp.maximum), max: Number(hp.maximum), temp: Number(hp.temp ?? 0) },
          ac: Number(summary.armorClass),
        });
      }
      // Characters the summary service doesn't cover: refetch the full sheet, less often.
      if (tick % 3 === 1) {
        for (const id of ids.filter((id) => !fresh.has(id))) {
          try {
            const sheet = await loadSheet("character", id, { refresh: true });
            fresh.set(id, { hp: sheet.hp, ac: sheet.ac });
          } catch {
            /* try again next time */
          }
        }
      }

      const toUpdate = items.filter((item) => {
        const link = getLink(item)!;
        const next = fresh.get(link.ddbId);
        return next && (!sameHp(link.ddbHp, next.hp) || (Number.isFinite(next.ac) && link.ac !== next.ac));
      });
      await updateLinks(
        toUpdate.map((i) => i.id),
        settings,
        (link) => {
          const next = fresh.get(link.ddbId);
          if (!next) return false;
          const out = { ...link, updatedAt: Date.now() };
          if (!sameHp(link.ddbHp, next.hp)) {
            out.hp = { ...next.hp };
            out.ddbHp = { ...next.hp };
          }
          if (Number.isFinite(next.ac)) out.ac = next.ac;
          return out;
        },
      );
    } catch (error) {
      console.warn("[DDB-OBR] sync failed", error);
    } finally {
      schedule();
    }
  }

  timer = window.setTimeout(run, 5000);
  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}
