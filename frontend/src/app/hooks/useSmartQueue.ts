"use client";

// =====================================================================
// useSmartQueue Hook - Main Queue State Management
// =====================================================================
// This is the primary hook that manages the queue state for the home page dashboard.
// It maintains a Server-Sent Events (SSE) connection to receive real-time updates
// from the Arduino about queue state and RFID scans. It handles overlay display
// logic, WhatsApp notifications, and calculates estimated wait times based on
// average stay duration.

import { useEffect, useRef, useState } from "react";
import { QueueUpdate, RfidScan, StreamManager } from "../lib/sse/StreamManager";
import { handleRfidScan, handleQueueUpdate } from "../lib/notify/whatsapp";

// =====================================================================
// Overlay State Type
// =====================================================================
// Defines the state of the scan overlay that appears when RFID cards are scanned.
// Can be hidden or visible with different message types.
type OverlayState =
  | { visible: false }
  | {
      visible: true;
      kind: "welcome" | "queued" | "goodbye" | "denied";
      uid: string;
      queuePosition?: number;
      etaMinutes?: number;
      dispenseAvailable?: boolean;
    };

// =====================================================================
// Queue State Type
// =====================================================================
// Complete state object containing all queue information, connection status,
// and overlay state. This is what the hook returns to components.
type SmartQueueState = {
  freeSlots: number;
  inCount: number;
  maxSlots: number;
  queueCount: number;
  nextTicket: string | null;
  connection: string;
  overlay: OverlayState;
  debugEvents: Array<{ type: string; ts: number; payload: unknown }>;
  // Rolling average of time users spend inside the library (used for ETA calculation)
  avgStayMinutes: number;
};

// =====================================================================
// Hook Return Type
// =====================================================================
// The hook returns all state plus helper functions to manage the overlay
type SmartQueueReturn = SmartQueueState & {
  dismissOverlay: () => void;
  holdOverlay: () => void;
  releaseOverlay: (delayMs?: number) => void;
};

// =====================================================================
// Stream Manager Singleton
// =====================================================================
// Create a single StreamManager instance that will be shared across all
// components using this hook. This ensures only one SSE connection is maintained.
const manager = new StreamManager();

// =====================================================================
// ETA Calculation Utility
// =====================================================================
// Calculates estimated wait time in minutes based on queue position.
// Uses the average stay duration to estimate how many "rounds" of people
// need to exit before this user can enter.
function computeEtaMinutes(position: number, maxSlots: number, avgStayMinutes: number): number {
  if (position <= 0 || maxSlots <= 0) return 0;
  const rounds = Math.ceil(position / maxSlots);
  const avg = avgStayMinutes > 0 ? avgStayMinutes : 60; // default 60 minutes
  return rounds * avg;
}

export function useSmartQueue(): SmartQueueReturn {
  const [state, setState] = useState<SmartQueueState>({
    freeSlots: 0,
    inCount: 0,
    maxSlots: 3,
    queueCount: 0,
    nextTicket: null,
    connection: "idle",
    overlay: { visible: false },
    debugEvents: [],
    avgStayMinutes: 60,
  });

  // =====================================================================
  // Overlay Auto-Dismiss Timer
  // =====================================================================
  // Reference to the timer that automatically dismisses the overlay after
  // 10 seconds. Stored in a ref to persist across re-renders.
  const overlayTimer = useRef<number | null>(null);
  const overlayLocked = useRef(false);

  function clearOverlayTimer() {
    if (overlayTimer.current) {
      window.clearTimeout(overlayTimer.current);
      overlayTimer.current = null;
    }
  }

  function scheduleOverlayHide(delayMs = 10000) {
    clearOverlayTimer();
    overlayTimer.current = window.setTimeout(() => {
      setState((prev) => ({ ...prev, overlay: { visible: false } }));
      overlayLocked.current = false;
      overlayTimer.current = null;
    }, delayMs);
  }

  // =====================================================================
  // Dismiss Overlay Function
  // =====================================================================
  // Manually dismiss the overlay and clear any pending auto-dismiss timer.
  // Called when user clicks/taps the overlay or when explicitly requested.
  const dismissOverlay = () => {
    overlayLocked.current = false;
    clearOverlayTimer();
    setState((prev) => ({ ...prev, overlay: { visible: false } }));
  };

  const holdOverlay = () => {
    overlayLocked.current = true;
    clearOverlayTimer();
  };

  const releaseOverlay = (delayMs = 10000) => {
    overlayLocked.current = false;
    scheduleOverlayHide(delayMs);
  };

  // =====================================================================
  // SSE Connection Management
  // =====================================================================
  // Establish the SSE connection when the hook is first used. The StreamManager
  // uses a leader-follower pattern to ensure only one tab maintains the connection.
  useEffect(() => {
    manager.connect();
    return () => manager.disconnect();
  }, []);

  // =====================================================================
  // Event Handlers Setup
  // =====================================================================
  // Register handlers for queue updates, RFID scans, and system heartbeats.
  // These handlers update the component state and trigger WhatsApp notifications.
  useEffect(() => {
    // =====================================================================
    // Queue Update Handler
    // =====================================================================
    // Fired whenever the queue state changes (someone joins/leaves, slots free up).
    // Updates the displayed queue statistics and triggers WhatsApp notifications
    // when appropriate conditions are met.
    const offQueue = manager.on("queue:update", (q: QueueUpdate) => {
      // Handle WhatsApp notifications
      handleQueueUpdate(q);
      
      overlayLocked.current = false;
      setState((prev) => ({
        ...prev,
        freeSlots: q.freeSlots,
        inCount: q.inCount,
        maxSlots: q.maxSlots,
        queueCount: q.length,
        nextTicket: q.nextTicket || null,
        debugEvents: pushDebug(prev.debugEvents, "queue:update", q),
      }));
    });

    // =====================================================================
    // Average Stay Duration Tracking
    // =====================================================================
    // Track when people enter and leave to calculate average stay duration.
    // This is used to provide more accurate wait time estimates. Uses module-level
    // refs stored on the hook function itself to persist across re-renders.
    const entryTimesRef = (useSmartQueue as any)._entryTimesRef || { current: new Map<string, number>() };
    (useSmartQueue as any)._entryTimesRef = entryTimesRef;
    const durationsRef = (useSmartQueue as any)._durationsRef || { current: [] as number[] };
    (useSmartQueue as any)._durationsRef = durationsRef;

    // =====================================================================
    // RFID Scan Handler
    // =====================================================================
    // Fired whenever an RFID card is scanned at the entrance. Updates overlay state,
    // tracks entry/exit times for average stay calculation, handles entry confirmation
    // cleanup, and triggers WhatsApp notifications.
    const offScan = manager.on("rfid:scan", (scan: RfidScan) => {
      // Handle WhatsApp notifications
      handleRfidScan(scan);
      
      // =====================================================================
      // Entry Confirmation Cleanup
      // =====================================================================
      // If someone enters from queue via RFID scan, clear their entry confirmation
      // (they entered directly, no need for web/WhatsApp confirmation)
      if (scan.status === "accepted" && scan.reason === "entered_from_queue") {
        const { clearEntryConfirmation } = require("@/app/lib/entry-confirmation");
        clearEntryConfirmation(scan.uid);
      }
      
      let updatedAvg: number | null = null;
      const nowTs = Date.now();
      if (scan.status === "accepted" && (scan.reason === "entered" || scan.reason === "entered_from_queue")) {
        entryTimesRef.current.set(scan.uid, nowTs);
      } else if (scan.status === "accepted" && scan.reason === "left") {
        const start = entryTimesRef.current.get(scan.uid);
        if (typeof start === "number" && start > 0) {
          const dwellMs = Math.max(0, nowTs - start);
          entryTimesRef.current.delete(scan.uid);
          const arr: number[] = durationsRef.current;
          arr.push(dwellMs);
          if (arr.length > 200) arr.shift();
          const total = arr.reduce((a, b) => a + b, 0);
          updatedAvg = (total / arr.length) / 60000; // minutes
        }
      }

      setState((prev) => {
        const next = { ...prev };
        next.debugEvents = pushDebug(prev.debugEvents, "rfid:scan", scan);
        // Decide overlay
        if (scan.status === "accepted") {
          if (scan.reason === "left") {
            next.overlay = { visible: true, kind: "goodbye", uid: scan.uid };
          } else {
            next.overlay = { visible: true, kind: "welcome", uid: scan.uid, dispenseAvailable: !!scan.dispenseEligible };
          }
        } else {
          if (scan.reason === "queue_full") {
            next.overlay = { visible: true, kind: "denied", uid: scan.uid };
          } else {
            const pos = scan.queuePosition ?? 0;
            const etaRaw = computeEtaMinutes(pos, prev.maxSlots || 3, prev.avgStayMinutes || 60);
            const eta = Math.round(etaRaw);
            next.overlay = {
              visible: true,
              kind: "queued",
              uid: scan.uid,
              queuePosition: pos,
              etaMinutes: eta,
            };
          }
        }
        if (updatedAvg && isFinite(updatedAvg) && updatedAvg > 0) {
          next.avgStayMinutes = updatedAvg;
        }
        return next;
      });
      // Reset overlay auto-hide timer
      if (!overlayLocked.current) {
        scheduleOverlayHide(10000);
      }
    });

    // =====================================================================
    // System Heartbeat Handler
    // =====================================================================
    // Fired periodically to indicate the SSE connection is healthy. Updates
    // connection status and adds debug events for monitoring.
    const offHeartbeat = manager.on("system:heartbeat", ({ intervalMs }) => {
      setState((prev) => ({
        ...prev,
        connection: "open",
        debugEvents: pushDebug(prev.debugEvents, "system:heartbeat", { intervalMs }),
      }));
    });

    return () => {
      offQueue();
      offScan();
      offHeartbeat();
      clearOverlayTimer();
    };
  }, []);

  // =====================================================================
  // Return Hook State
  // =====================================================================
  // Return all state and the dismiss overlay function for components to use.
  // Note: Browser push notifications are not used - QR codes provide the notification mechanism.
  return { ...state, dismissOverlay, holdOverlay, releaseOverlay };
}

// =====================================================================
// Debug Events Helper
// =====================================================================
// Maintains a rolling list of recent SSE events for the debug panel.
// Limits to the most recent 50 events to prevent memory issues.
function pushDebug<T>(arr: Array<{ type: string; ts: number; payload: unknown }>, type: string, payload: T) {
  const next = arr.concat({ type, ts: Date.now(), payload });
  if (next.length > 50) next.shift();
  return next;
}


