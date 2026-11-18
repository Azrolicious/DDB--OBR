import { useEffect, useState, type ReactNode } from "react";
import { bridge, type BridgeStatus } from "../../ddb/bridge";
import type { HitPoints } from "../../model/sheet";
import { DEFAULT_TOKEN_URL } from "../../obr/tokens";

export function Spinner() {
  return <span className="spinner" aria-label="Loading" />;
}

export function Notice({ kind = "warn", children }: { kind?: "warn" | "error" | "ok"; children: ReactNode }) {
  return <div className={`notice ${kind === "warn" ? "" : kind}`}>{children}</div>;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function Avatar({ url, size }: { url?: string; size?: "lg" }) {
  const [src, setSrc] = useState(url || DEFAULT_TOKEN_URL);
  useEffect(() => setSrc(url || DEFAULT_TOKEN_URL), [url]);
  return (
    <img
      className={`avatar ${size ?? ""}`}
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setSrc(DEFAULT_TOKEN_URL)}
    />
  );
}

export function HpBar({ hp }: { hp: HitPoints }) {
  const pct = hp.max > 0 ? Math.max(0, Math.min(100, (hp.current / hp.max) * 100)) : 0;
  const tone = pct <= 25 ? "low" : pct <= 50 ? "mid" : "";
  return (
    <div className="hpbar" aria-label={`${hp.current} of ${hp.max} hit points`}>
      <div className={tone} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" className="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function useBridgeStatus(): [BridgeStatus | null, () => void] {
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    if (nonce > 0) setStatus(null);
    bridge.status(nonce > 0).then((s) => !cancelled && setStatus(s));
    return () => {
      cancelled = true;
    };
  }, [nonce]);
  return [status, () => setNonce((n) => n + 1)];
}

export function BridgePill({ status }: { status: BridgeStatus | null }) {
  if (!status) {
    return (
      <span className="pill">
        <Spinner /> DDB
      </span>
    );
  }
  if (!status.installed) {
    return (
      <span className="pill" title="The DDB-OBR Bridge browser extension wasn't detected. You can still paste character JSON.">
        <span className="dot bad" /> No bridge
      </span>
    );
  }
  if (!status.loggedIn) {
    return (
      <span className="pill" title="Bridge found, but you're not logged in to dndbeyond.com in this browser.">
        <span className="dot warn" /> Log in to DDB
      </span>
    );
  }
  return (
    <span className="pill" title={`Connected to D&D Beyond${status.username ? ` as ${status.username}` : ""}`}>
      <span className="dot ok" /> {status.username ?? "D&D Beyond"}
    </span>
  );
}

/** A small "busy" wrapper for async button handlers. */
export function useAsync(): [boolean, string | null, (fn: () => Promise<unknown>) => Promise<void>, () => void] {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return [busy, error, run, () => setError(null)];
}
