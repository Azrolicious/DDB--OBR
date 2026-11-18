import { useState } from "react";
import { EXT_TITLE } from "../../constants";
import { useRole } from "../../obr/hooks";
import { BridgePill, Tabs, useBridgeStatus } from "../common/ui";
import { CombatTab } from "./CombatTab";
import { EncountersTab } from "./EncountersTab";
import { LogTab } from "./LogTab";
import { PartyTab } from "./PartyTab";
import { SettingsTab } from "./SettingsTab";

type Tab = "party" | "encounters" | "combat" | "log" | "settings";
const TAB_KEY = "ddb-obr/panel-tab";

export function App() {
  const role = useRole();
  const [status, recheck] = useBridgeStatus();
  const [tab, setTabState] = useState<Tab>(() => {
    try {
      return (localStorage.getItem(TAB_KEY) as Tab) || "party";
    } catch {
      return "party";
    }
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* ignore */
    }
  };
  const tabs: { id: Tab; label: string }[] = [
    { id: "party", label: "Party" },
    ...(role === "GM" ? [{ id: "encounters" as Tab, label: "Encounters" }] : []),
    { id: "combat", label: "Combat" },
    { id: "log", label: "Rolls" },
    { id: "settings", label: "Settings" },
  ];
  const current = tabs.some((t) => t.id === tab) ? tab : "party";

  return (
    <>
      <div className="app-header">
        <div className="app-title">{EXT_TITLE}</div>
        <button className="btn ghost" style={{ padding: 0 }} onClick={() => setTab("settings")} title="Connection settings">
          <BridgePill status={status} />
        </button>
      </div>
      <Tabs tabs={tabs} value={current} onChange={setTab} />
      {current === "party" && <PartyTab role={role} bridgeStatus={status} />}
      {current === "encounters" && <EncountersTab bridgeStatus={status} />}
      {current === "combat" && <CombatTab role={role} />}
      {current === "log" && <LogTab />}
      {current === "settings" && <SettingsTab role={role} bridgeStatus={status} onRecheck={recheck} />}
    </>
  );
}
