"use client";

import { useEffect, useState } from "react";
import { ArduinoState, StreamManager } from "../lib/sse/StreamManager";

export type TicketStatus = {
  uid: string;
  queuePosition: number; // -1 if not queued
  inside: boolean;
  freeSlots: number;
  maxSlots: number;
  inCount: number;
  isTurn: boolean; // true if #1 and freeSlots > 0
};

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

  useEffect(() => {
    manager.connect();
    const off = manager.on("state:update", (s: ArduinoState) => {
      const id = uid.toUpperCase();
      const posIdx = s.queue.findIndex((x) => (x || '').toUpperCase() === id);
      const inIdx = s.in.findIndex((x) => (x || '').toUpperCase() === id);
      const queuePosition = posIdx >= 0 ? posIdx + 1 : -1;
      const inside = inIdx >= 0;
      const freeSlots = s.freeSlots;
      const next = s.queue.length > 0 ? s.queue[0] : null;
      const isTurn = freeSlots > 0 && next === uid;
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


