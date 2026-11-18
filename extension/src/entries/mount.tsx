import OBR from "@owlbear-rodeo/sdk";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { startTheme, useObrReady } from "../obr/hooks";
import "../ui/styles.css";

function Gate({ children }: { children: ReactNode }) {
  const ready = useObrReady();
  if (!OBR.isAvailable) {
    return (
      <div className="scroll">
        <div className="empty">
          This page is part of an Owlbear Rodeo extension. Add <code>manifest.json</code> from this site to your Owlbear Rodeo
          profile, then open a room.
        </div>
      </div>
    );
  }
  return ready ? <>{children}</> : null;
}

export function mount(node: ReactNode) {
  if (OBR.isAvailable) OBR.onReady(() => startTheme());
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Gate>{node}</Gate>
    </StrictMode>,
  );
}
