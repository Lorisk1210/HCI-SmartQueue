"use client";

// =====================================================================
// Main Home Page - Library Queue Dashboard
// =====================================================================
// This is the primary display page that shows the queue status and handles
// RFID scan overlays. It connects to the Arduino via Server-Sent Events (SSE)
// to receive real-time updates about queue state and RFID scans.

import Stats from "./components/Stats";
import ScanOverlay from "./components/ScanOverlay";
import { useSmartQueue } from "./hooks/useSmartQueue";
import DebugPanel from "./components/DebugPanel";
import { useSearchParams } from "next/navigation";

export default function Home() {
  // =====================================================================
  // Queue State Management
  // =====================================================================
  // The useSmartQueue hook provides real-time queue information and manages
  // the overlay that appears when someone scans their RFID card. It maintains
  // an SSE connection to the Arduino to receive live updates.
  const { freeSlots, queueCount, overlay, dismissOverlay, holdOverlay, releaseOverlay } = useSmartQueue();
  
  // =====================================================================
  // Debug Mode Toggle
  // =====================================================================
  // Add ?debug=1 to the URL to show the debug panel, which displays
  // connection status and recent SSE events for troubleshooting.
  const search = useSearchParams();
  const showDebug = search.get("debug") === "1";
  
  return (
    <main>
      {/* 
        Main statistics display showing available slots and people waiting in queue.
        This is the primary visual indicator of library occupancy.
      */}
      <Stats peopleInLibrary={freeSlots} peopleInQueue={queueCount} />
      
      {/* 
        Overlay that appears when an RFID card is scanned at the entrance.
        Shows different messages depending on scan outcome:
        - "welcome": User can enter immediately (slot available)
        - "queued": User added to waiting queue (includes QR code for tracking)
        - "goodbye": User left the library
        - "denied": Queue is full, cannot join
      */}
      {overlay.visible ? (
        <ScanOverlay
          visible={overlay.visible}
          kind={overlay.kind}
          uid={overlay.uid}
          queuePosition={overlay.queuePosition}
          etaMinutes={overlay.etaMinutes}
          dispenseAvailable={(overlay as any).dispenseAvailable}
          queueCount={queueCount}
          onDismiss={dismissOverlay}
          onHold={holdOverlay}
          onRelease={releaseOverlay}
        />
      ) : null}
      
      {/* Debug panel for monitoring SSE connection and events */}
      {showDebug ? <DebugPanel /> : null}
    </main>
  );
}
