"use client";

// =====================================================================
// Debug Panel Component - SSE Connection Monitor
// =====================================================================
// Development tool that displays Server-Sent Events (SSE) connection status
// and recent events. Only visible when ?debug=1 is added to the URL.
// Useful for troubleshooting connection issues and monitoring real-time data flow.

import React from "react";
import { useSmartQueue } from "../hooks/useSmartQueue";

export default function DebugPanel() {
  const { connection, debugEvents } = useSmartQueue() as any;
  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-[420px] w-[90vw] md:w-[420px] rounded-xl bg-white/95 border border-black/10 shadow p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-700">SSE Debug</h3>
        <span className="text-xs text-neutral-500">{String(connection)}</span>
      </div>
      <div className="mt-2 max-h-[40vh] overflow-auto">
        <ul className="space-y-1">
          {debugEvents.map((e: any, idx: number) => (
            <li key={idx} className="text-xs text-neutral-700">
              <span className="text-neutral-500">{new Date(e.ts).toLocaleTimeString()} — </span>
              <span className="font-mono">{e.type}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}


