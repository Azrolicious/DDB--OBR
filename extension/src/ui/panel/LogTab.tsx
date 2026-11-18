import { useEffect, useState } from "react";
import { isValidExpression } from "../../dice/dice";
import { onRollLogChange, performRoll, readRollLog, type RollRecord } from "../../dice/rolls";
import { Notice, useAsync } from "../common/ui";

export function LogTab() {
  const [log, setLog] = useState<RollRecord[]>(readRollLog);
  const [expression, setExpression] = useState("");
  const [busy, error, run] = useAsync();

  useEffect(() => onRollLogChange(() => setLog(readRollLog())), []);

  const rollFree = () =>
    run(async () => {
      const expr = expression.replace(/\s+/g, "");
      if (!isValidExpression(expr)) throw new Error("Try something like 1d20+5 or 2d6+3.");
      await performRoll({ actor: "Quick roll", label: expr, expression: expr });
      setLog(readRollLog());
    });

  return (
    <div className="scroll">
      <div className="row">
        <input
          className="grow"
          placeholder="Quick roll: 1d20+5, 8d6, 2d6+1d4+3"
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && rollFree()}
        />
        <button className="btn primary" disabled={busy || !expression.trim()} onClick={rollFree}>
          Roll
        </button>
      </div>
      {error && <div style={{ marginTop: 8 }}><Notice kind="error">{error}</Notice></div>}
      <div className="section-title">Recent rolls</div>
      {!log.length && <div className="empty">Click any modifier on a sheet to roll. Results show up here and for the room.</div>}
      {log.map((r) => (
        <div className="log-entry row" key={r.id}>
          <span className="log-total" style={{ color: r.critical === "success" ? "var(--ok)" : r.critical === "failure" ? "var(--danger)" : undefined }}>
            {r.total}
          </span>
          <div className="grow">
            <div>
              <strong>{r.actor}</strong> · {r.label} {r.hidden && <span title="Only you saw this roll">🔒</span>}
            </div>
            <div className="tiny muted">
              {r.breakdown} · {r.who} · {new Date(r.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
