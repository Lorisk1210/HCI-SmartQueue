"use client";

import Stats from "./components/Stats";
import ScanOverlay from "./components/ScanOverlay";
import { useSmartQueue } from "./hooks/useSmartQueue";
import DebugPanel from "./components/DebugPanel";
import { useSearchParams } from "next/navigation";

export default function Home() {
  const { freeSlots, queueCount, overlay, dismissOverlay } = useSmartQueue();
  const search = useSearchParams();
  const showDebug = search.get("debug") === "1";
  return (
    <main>
      <Stats peopleInLibrary={freeSlots} peopleInQueue={queueCount} />
      {overlay.visible ? (
        <ScanOverlay
          visible={overlay.visible}
          kind={overlay.kind}
          uid={overlay.uid}
          queuePosition={overlay.queuePosition}
          etaMinutes={overlay.etaMinutes}
          dispenseAvailable={(overlay as any).dispenseAvailable}
          onDismiss={dismissOverlay}
        />
      ) : null}
      {showDebug ? <DebugPanel /> : null}
    </main>
  );
}
