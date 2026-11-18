import OBR from "@owlbear-rodeo/sdk";
import { CHANNEL_ROLL } from "../constants";
import { getLocalSettings, getRoomSettings } from "../obr/settings";
import { roll, type RollMode, type RollResult } from "./dice";

export interface RollRecord {
  id: string;
  at: number;
  who: string;
  actor: string;
  label: string;
  expression: string;
  total: number;
  breakdown: string;
  critical?: "success" | "failure";
  hidden: boolean;
}

const LOG_KEY = "ddb-obr/roll-log";
const LOG_MAX = 40;

export function readRollLog(): RollRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendRollLog(record: RollRecord): void {
  const log = [record, ...readRollLog().filter((r) => r.id !== record.id)].slice(0, LOG_MAX);
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    /* ignore */
  }
}

export function onRollLogChange(callback: () => void): () => void {
  const handler = (event: StorageEvent) => {
    if (event.key === LOG_KEY) callback();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

export function describeRoll(r: Pick<RollRecord, "actor" | "label" | "total" | "breakdown" | "critical">): string {
  const crit = r.critical === "success" ? " — NAT 20!" : r.critical === "failure" ? " — nat 1" : "";
  return `${r.actor} · ${r.label}: ${r.total}  ${r.breakdown}${crit}`;
}

export interface RollRequest {
  actor: string;
  label: string;
  expression: string;
  mode?: RollMode;
  /** Monster rolls by the GM can be kept private (room setting). */
  actorKind?: "character" | "monster";
}

/** Rolls, shows the result locally, and shares it with the room per settings. */
export async function performRoll(request: RollRequest): Promise<RollResult> {
  const result = roll(request.expression, request.mode ?? "normal");
  const [role, who, room] = await Promise.all([
    OBR.player.getRole(),
    OBR.player.getName(),
    getRoomSettings(),
  ]);
  const local = getLocalSettings();
  const hidden =
    !local.shareRolls || (role === "GM" && request.actorKind === "monster" && room.privateMonsterRolls);
  const modeLabel = result.mode === "advantage" ? " (adv)" : result.mode === "disadvantage" ? " (dis)" : "";
  const record: RollRecord = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    at: Date.now(),
    who,
    actor: request.actor,
    label: request.label + modeLabel,
    expression: request.expression,
    total: result.total,
    breakdown: result.breakdown,
    critical: result.critical,
    hidden,
  };
  appendRollLog(record);
  const variant = result.critical === "success" ? "SUCCESS" : result.critical === "failure" ? "ERROR" : "INFO";
  OBR.notification.show(`${hidden ? "🔒 " : ""}${describeRoll(record)}`, variant).catch(() => {});
  if (!hidden) {
    OBR.broadcast.sendMessage(CHANNEL_ROLL, record, { destination: "REMOTE" }).catch(() => {});
  }
  return result;
}

/** Background page: show other players' rolls. */
export function listenForRemoteRolls(): () => void {
  return OBR.broadcast.onMessage(CHANNEL_ROLL, (event) => {
    const record = event.data as RollRecord;
    if (!record || typeof record.total !== "number" || typeof record.actor !== "string") return;
    appendRollLog({ ...record, hidden: false });
    const variant = record.critical === "success" ? "SUCCESS" : record.critical === "failure" ? "ERROR" : "DEFAULT";
    OBR.notification.show(`${record.who}: ${describeRoll(record)}`, variant).catch(() => {});
  });
}
