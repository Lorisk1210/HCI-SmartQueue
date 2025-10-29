"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTicket } from "@/app/hooks/useTicket";

export default function TicketPage() {
  const params = useParams<{ uid: string }>();
  const raw = params.uid;
  let decoded = typeof raw === 'string' ? raw : '';
  try { decoded = decodeURIComponent(decoded); } catch (_) {}
  const uid = decoded.toUpperCase();
  const { queuePosition, inside, freeSlots, maxSlots, inCount, isTurn } = useTicket(uid);

  const title = inside ? "You're inside" : (queuePosition === -1 ? "Not in queue" : `You're #${queuePosition}`);
  const subtitle = inside
    ? `Currently inside (${inCount}/${maxSlots})`
    : (queuePosition === -1
        ? `Scan your card at the entrance to join`
        : (isTurn ? `A slot is free — it's your turn now!`
                  : (freeSlots > 0 ? `A slot is free — approaching…` : `Waiting for your turn…`)));

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-[520px] px-5 py-10">
        <h1 className="uppercase tracking-[0.2em] text-[13px] text-neutral-600">SmartQueue</h1>
        <div className="mt-6 text-center">
          <p className="font-serif leading-none text-black text-[clamp(36px,10vw,64px)]">{title}</p>
          <p className="mt-3 text-neutral-700 text-base">{subtitle}</p>
          <p className="mt-2 text-neutral-500 text-xs">UID {uid}</p>
          {!inside && queuePosition > 0 ? (
            <div className="mt-8 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-black/10 p-4">
                <div className="text-[12px] uppercase tracking-wide text-neutral-500">Position</div>
                <div className="text-[28px] font-medium">#{queuePosition}</div>
              </div>
              <div className="rounded-lg border border-black/10 p-4">
                <div className="text-[12px] uppercase tracking-wide text-neutral-500">Slots Free</div>
                <div className="text-[28px] font-medium">{freeSlots}</div>
              </div>
            </div>
          ) : null}
          {isTurn ? (
            <div className="mt-8 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 p-4">
              Please go to the entrance and scan your card now.
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}


