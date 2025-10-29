"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QueueUpdate, RfidScan, StreamManager } from "../lib/sse/StreamManager";

type OverlayState =
  | { visible: false }
  | {
      visible: true;
      kind: "welcome" | "queued" | "goodbye" | "denied";
      uid: string;
      queuePosition?: number;
      etaMinutes?: number;
    };

type SmartQueueState = {
  freeSlots: number;
  inCount: number;
  maxSlots: number;
  queueCount: number;
  connection: string;
  overlay: OverlayState;
  debugEvents: Array<{ type: string; ts: number; payload: unknown }>;
};

const manager = new StreamManager();

function computeEtaMinutes(position: number, maxSlots: number): number {
  if (position <= 0 || maxSlots <= 0) return 0;
  const rounds = Math.ceil(position / maxSlots);
  return rounds * 15; // 15 minutes per round
}

export function useSmartQueue(): SmartQueueState {
  const [state, setState] = useState<SmartQueueState>({
    freeSlots: 0,
    inCount: 0,
    maxSlots: 3,
    queueCount: 0,
    connection: "idle",
    overlay: { visible: false },
    debugEvents: [],
  });

  const overlayTimer = useRef<number | null>(null);

  // Singleton connect
  useEffect(() => {
    manager.connect();
    return () => manager.disconnect();
  }, []);

  useEffect(() => {
    const offQueue = manager.on("queue:update", (q: QueueUpdate) => {
      setState((prev) => ({
        ...prev,
        freeSlots: q.freeSlots,
        inCount: q.inCount,
        maxSlots: q.maxSlots,
        queueCount: q.length,
        debugEvents: pushDebug(prev.debugEvents, "queue:update", q),
      }));
    });

    const offScan = manager.on("rfid:scan", (scan: RfidScan) => {
      setState((prev) => {
        const next = { ...prev };
        next.debugEvents = pushDebug(prev.debugEvents, "rfid:scan", scan);
        // Decide overlay
        if (scan.status === "accepted") {
          if (scan.reason === "left") {
            next.overlay = { visible: true, kind: "goodbye", uid: scan.uid };
          } else {
            next.overlay = { visible: true, kind: "welcome", uid: scan.uid };
          }
        } else {
          if (scan.reason === "queue_full") {
            next.overlay = { visible: true, kind: "denied", uid: scan.uid };
          } else {
            const pos = scan.queuePosition ?? 0;
            const eta = computeEtaMinutes(pos, prev.maxSlots || 3);
            next.overlay = {
              visible: true,
              kind: "queued",
              uid: scan.uid,
              queuePosition: pos,
              etaMinutes: eta,
            };
          }
        }
        return next;
      });
      // Reset overlay auto-hide timer
      if (overlayTimer.current) window.clearTimeout(overlayTimer.current);
      overlayTimer.current = window.setTimeout(() => {
        setState((prev) => ({ ...prev, overlay: { visible: false } }));
      }, 15000);
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

  return state;
}

function pushDebug<T>(arr: Array<{ type: string; ts: number; payload: unknown }>, type: string, payload: T) {
  const next = arr.concat({ type, ts: Date.now(), payload });
  if (next.length > 50) next.shift();
  return next;
}


