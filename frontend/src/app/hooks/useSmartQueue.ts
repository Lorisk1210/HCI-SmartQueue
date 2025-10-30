"use client";

import { useEffect, useRef, useState } from "react";
import { QueueUpdate, RfidScan, StreamManager } from "../lib/sse/StreamManager";
import { handleRfidScan, handleQueueUpdate } from "../lib/notify/whatsapp";

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

type SmartQueueState = {
  freeSlots: number;
  inCount: number;
  maxSlots: number;
  queueCount: number;
  nextTicket: string | null;
  connection: string;
  overlay: OverlayState;
  debugEvents: Array<{ type: string; ts: number; payload: unknown }>;
  avgStayMinutes: number; // rolling average of time users spend inside
};

type SmartQueueReturn = SmartQueueState & {
  dismissOverlay: () => void;
};

const manager = new StreamManager();

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

  const overlayTimer = useRef<number | null>(null);

  const dismissOverlay = () => {
    if (overlayTimer.current) {
      window.clearTimeout(overlayTimer.current);
      overlayTimer.current = null;
    }
    setState((prev) => ({ ...prev, overlay: { visible: false } }));
  };

  // Singleton connect
  useEffect(() => {
    manager.connect();
    return () => manager.disconnect();
  }, []);

  useEffect(() => {
    const offQueue = manager.on("queue:update", (q: QueueUpdate) => {
      // Handle WhatsApp notifications
      handleQueueUpdate(q);
      
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

    // Track entry times to compute average stay when people leave
    const entryTimesRef = (useSmartQueue as any)._entryTimesRef || { current: new Map<string, number>() };
    (useSmartQueue as any)._entryTimesRef = entryTimesRef;
    const durationsRef = (useSmartQueue as any)._durationsRef || { current: [] as number[] };
    (useSmartQueue as any)._durationsRef = durationsRef;

    const offScan = manager.on("rfid:scan", (scan: RfidScan) => {
      // Handle WhatsApp notifications
      handleRfidScan(scan);
      
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
      if (overlayTimer.current) window.clearTimeout(overlayTimer.current);
      overlayTimer.current = window.setTimeout(() => {
        setState((prev) => ({ ...prev, overlay: { visible: false } }));
      }, 10000);
    });

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
      if (overlayTimer.current) window.clearTimeout(overlayTimer.current);
    };
  }, []);

  // No external/browser notifications in QR approach

  return { ...state, dismissOverlay };
}

function pushDebug<T>(arr: Array<{ type: string; ts: number; payload: unknown }>, type: string, payload: T) {
  const next = arr.concat({ type, ts: Date.now(), payload });
  if (next.length > 50) next.shift();
  return next;
}


