import type { BridgeStatus } from "../../ddb/bridge";
import { EXT_NAME, EXT_VERSION } from "../../constants";
import { setRoomSettings, useLocalSettings, useRoomSettings, type RoomSettings } from "../../obr/settings";
import { clearSheetCache } from "../../store/cache";
import { BridgePill, Notice } from "../common/ui";

export function SettingsTab({
  role,
  bridgeStatus,
  onRecheck,
}: {
  role: "GM" | "PLAYER";
  bridgeStatus: BridgeStatus | null;
  onRecheck: () => void;
}) {
  const room = useRoomSettings();
  const [local, setLocal] = useLocalSettings();
  const isGm = role === "GM";
  const setRoom = (update: Partial<RoomSettings>) => setRoomSettings(update).catch(() => {});

  return (
    <div className="scroll">
      <div className="section-title">D&amp;D Beyond connection</div>
      <div className="card stack">
        <div className="row">
          <BridgePill status={bridgeStatus} />
          <span className="grow" />
          <button className="btn small" onClick={onRecheck}>
            Check again
          </button>
        </div>
        {bridgeStatus && !bridgeStatus.installed && (
          <div className="small">
            Install the <strong>DDB-OBR Bridge</strong> browser extension (in this project's <code>bridge/</code> folder) to
            import private characters, sync HP from D&amp;D Beyond, and pull encounters. Without it you can still import public
            characters or paste their JSON, and see sheets other players have loaded.
          </div>
        )}
        {bridgeStatus?.installed && !bridgeStatus.loggedIn && (
          <div className="small">
            The bridge is installed, but you aren't logged in to D&amp;D Beyond in this browser.{" "}
            <a href="https://www.dndbeyond.com/sign-in" target="_blank" rel="noopener noreferrer">
              Sign in
            </a>
            , then click “Check again”.
          </div>
        )}
        {bridgeStatus?.installed && bridgeStatus.loggedIn && (
          <div className="small muted">Bridge v{bridgeStatus.version} — requests go to D&amp;D Beyond with your login.</div>
        )}
      </div>

      <div className="section-title">Just for me</div>
      <label className="check">
        <input type="checkbox" checked={local.openSheetOnSelect} onChange={(e) => setLocal({ openSheetOnSelect: e.target.checked })} />
        <span>Open the sheet when I click a linked token</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={local.shareRolls} onChange={(e) => setLocal({ shareRolls: e.target.checked })} />
        <span>Share my rolls with the room</span>
      </label>

      <div className="section-title">Room {isGm ? "" : "(set by the GM)"}</div>
      <fieldset disabled={!isGm} style={{ border: "none", padding: 0, margin: 0 }}>
        <label className="check">
          <input type="checkbox" checked={room.syncSeconds > 0} onChange={(e) => setRoom({ syncSeconds: e.target.checked ? 60 : 0 })} />
          <span>
            Sync HP &amp; AC from D&amp;D Beyond every
            <select
              value={room.syncSeconds || 60}
              disabled={!room.syncSeconds}
              onChange={(e) => setRoom({ syncSeconds: Number(e.target.value) })}
              style={{ margin: "0 6px", padding: "1px 4px" }}
            >
              {[15, 30, 60, 120, 300].map((s) => (
                <option key={s} value={s}>
                  {s < 60 ? `${s}s` : `${s / 60} min`}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={room.hideMonsterHp} onChange={(e) => setRoom({ hideMonsterHp: e.target.checked })} />
          <span>Show players “Bloodied” etc. instead of exact monster HP</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={room.playersSeeMonsterSheets}
            onChange={(e) => setRoom({ playersSeeMonsterSheets: e.target.checked })}
          />
          <span>Let players open monster stat blocks</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={room.privateMonsterRolls} onChange={(e) => setRoom({ privateMonsterRolls: e.target.checked })} />
          <span>Keep the GM's monster rolls private</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={room.mirrorStatBubbles} onChange={(e) => setRoom({ mirrorStatBubbles: e.target.checked })} />
          <span>
            Mirror HP/AC to <em>Stat Bubbles for D&amp;D</em> (shows HP bars on tokens if you use that extension)
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={room.mirrorInitiative} onChange={(e) => setRoom({ mirrorInitiative: e.target.checked })} />
          <span>
            Mirror initiative to Owlbear's <em>Initiative Tracker</em> extension
          </span>
        </label>
      </fieldset>

      <div className="section-title">Data</div>
      <div className="row">
        <button
          className="btn small"
          onClick={() => {
            clearSheetCache();
            localStorage.removeItem("ddb-obr/config");
          }}
        >
          Clear cached sheets
        </button>
      </div>
      <div style={{ marginTop: 14 }}>
        <Notice>
          {EXT_NAME} v{EXT_VERSION} is a fan-made tool, not affiliated with D&amp;D Beyond, Wizards of the Coast or Owlbear Rodeo. It
          only reads your D&amp;D Beyond data; it never changes anything there.
        </Notice>
      </div>
    </div>
  );
}
