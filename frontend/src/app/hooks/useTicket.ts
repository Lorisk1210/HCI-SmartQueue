"use client";

// =====================================================================
// useTicket Hook - Individual User Queue Status
// =====================================================================
// Hook that provides real-time queue status for a specific user (identified by UID).
// Used on the individual ticket page where users can track their position.
// Connects to the SSE stream and filters updates to show only information
// relevant to this specific user.

import { useEffect, useState } from "react";
import { ArduinoState, StreamManager } from "../lib/sse/StreamManager";

function normalizeUid(value: string | null | undefined): string {
  return (value ?? "").replace(/[^0-9A-F]/gi, "").toUpperCase();
}

// =====================================================================
// Ticket Status Type
// =====================================================================
// Complete status information for a single user, including their position
// in queue, whether they're inside, and if it's their turn to enter.
export type TicketStatus = {
  uid: string;
  queuePosition: number; // -1 if not queued
  inside: boolean;
  freeSlots: number;
  maxSlots: number;
  inCount: number;
  // True if this user is first in queue and there are free slots available
  isTurn: boolean;
};

// =====================================================================
// Stream Manager Singleton
// =====================================================================
// Create a single StreamManager instance shared across all ticket pages.
// This reuses the same SSE connection efficiently.
const manager = new StreamManager();

export function useTicket(uid: string): TicketStatus {
  const [status, setStatus] = useState<TicketStatus>({
    uid,
    queuePosition: -1,
    inside: false,
    freeSlots: 0,
    maxSlots: 0,
    inCount: 0,
    isTurn: false,
  });

  // =====================================================================
  // SSE State Updates
  // =====================================================================
  // Listen for Arduino state updates and filter to find this user's position
  // in the queue and inside lists. Calculates whether it's their turn based
  // on being first in queue with free slots available.
  useEffect(() => {
    const target = normalizeUid(uid);
    if (!target) {
      setStatus((prev) => ({
        ...prev,
        uid,
        queuePosition: -1,
        inside: false,
        freeSlots: 0,
        maxSlots: 0,
        inCount: 0,
        isTurn: false,
      }));
      return;
    }

    manager.connect();
    const off = manager.on("state:update", (s: ArduinoState) => {
      const id = target;
      const posIdx = s.queue.findIndex((x) => normalizeUid(x) === id);
      const inIdx = s.in.findIndex((x) => normalizeUid(x) === id);
      const queuePosition = posIdx >= 0 ? posIdx + 1 : -1;
      const inside = inIdx >= 0;
      const freeSlots = s.freeSlots;
      const next = s.queue.length > 0 ? s.queue[0] : null;
      const isTurn = freeSlots > 0 && normalizeUid(next) === id;
      setStatus({
        uid,
        queuePosition,
        inside,
        freeSlots,
        maxSlots: s.maxSlots,
        inCount: s.inCount,
        isTurn,
      });
    });
    return () => {
      off();
      manager.disconnect();
    };
  }, [uid]);

  return status;
}


