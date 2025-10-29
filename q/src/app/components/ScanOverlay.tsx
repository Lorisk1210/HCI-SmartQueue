"use client";

import React from "react";

type Props = {
  visible: boolean;
  kind?: "welcome" | "queued" | "goodbye" | "denied";
  uid?: string;
  queuePosition?: number;
  etaMinutes?: number;
};

export default function ScanOverlay({ visible, kind, uid, queuePosition, etaMinutes }: Props) {
  if (!visible) return null;

  let title = "";
  let subtitle = "";
  if (kind === "welcome") {
    title = "Welcome";
    subtitle = "You can enter now.";
  } else if (kind === "goodbye") {
    title = "Goodbye";
    subtitle = "Thanks for visiting.";
  } else if (kind === "denied") {
    title = "Queue full";
    subtitle = "Please try again later.";
  } else if (kind === "queued") {
    title = queuePosition && queuePosition > 0 ? `You're #${queuePosition}` : "You're queued";
    subtitle = typeof etaMinutes === "number" ? `Estimated wait ~ ${etaMinutes} min` : "Please wait to be called.";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[92%] md:w-[70%] lg:w-[50%] rounded-[28px] bg-white/95 backdrop-blur border border-black/5 shadow-lg p-10 text-center">
        <h2 className="uppercase tracking-[0.2em] text-[15px] text-neutral-700">RFID Scan</h2>
        <div className="mt-6">
          <p className="font-serif leading-none text-black/90 text-[clamp(48px,10vw,96px)]">{title}</p>
          {uid ? <p className="mt-4 text-neutral-600 text-sm">UID {uid}</p> : null}
          <p className="mt-6 text-neutral-700 text-lg">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}


