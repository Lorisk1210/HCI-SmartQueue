"use client";

import Stats from "./components/Stats";
import ScanOverlay from "./components/ScanOverlay";
import { useSmartQueue } from "./hooks/useSmartQueue";
import DebugPanel from "./components/DebugPanel";
import { useSearchParams } from "next/navigation";

export default function Home() {
  const { freeSlots, queueCount, overlay } = useSmartQueue();
  const search = useSearchParams();
  const showDebug = search.get("debug") === "1";
  return (
    <main>
      <Stats peopleInLibrary={freeSlots} peopleInQueue={queueCount} />
      <ScanOverlay
        visible={overlay.visible}
        kind={overlay.visible ? overlay.kind : undefined}
        uid={overlay.visible ? overlay.uid : undefined}
        queuePosition={overlay.visible ? overlay.queuePosition : undefined}
        etaMinutes={overlay.visible ? overlay.etaMinutes : undefined}
      />
      {showDebug ? <DebugPanel /> : null}
    </main>
  );
}
