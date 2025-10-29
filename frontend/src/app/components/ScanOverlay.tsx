"use client";

import React, { useEffect, useMemo, useState } from "react";
import Qr from "./Qr";

type Props = {
  visible: boolean;
  kind?: "welcome" | "queued" | "goodbye" | "denied";
  uid?: string;
  queuePosition?: number;
  etaMinutes?: number;
  onDismiss?: () => void;
  dispenseAvailable?: boolean;
};

export default function ScanOverlay({ visible, kind, uid, queuePosition, etaMinutes, onDismiss, dispenseAvailable }: Props) {
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

  const handleClick = () => {
    if (onDismiss) {
      onDismiss();
    }
  };
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ticketBase, setTicketBase] = useState<string>("");
  useEffect(() => {
    if (!uid) return;
    const envBase = (process.env.NEXT_PUBLIC_QR_BASE_URL as string | undefined) || '';
    if (envBase) {
      setTicketBase(envBase.replace(/\/$/, ''));
      return;
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(origin)) {
      setTicketBase(origin);
      return;
    }
    // Ask server for a LAN-reachable base URL
    (async () => {
      try {
        const res = await fetch('/api/base-url', { cache: 'no-store' });
        const data = await res.json();
        if (data?.ok && data?.baseUrl) {
          setTicketBase(String(data.baseUrl));
        } else {
          setTicketBase(origin);
        }
      } catch (_) {
        setTicketBase(origin);
      }
    })();
  }, [uid]);

  const ticketUrl = useMemo(() => {
    if (!uid || !ticketBase) return "";
    return `${ticketBase}/ticket/${uid}`;
  }, [uid, ticketBase]);

  async function handleLeaveQueue() {
    if (!uid) return;
    setLeaving(true);
    setError(null);
    try {
      const res = await fetch('/api/queue/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid }),
      });
      if (!res.ok) throw new Error('leave failed');
      if (onDismiss) onDismiss();
    } catch (e) {
      setError('Could not leave queue');
    } finally {
      setLeaving(false);
    }
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 backdrop-blur"
      onClick={handleClick}
      onTouchEnd={handleClick}
    >
      <div className="w-full h-full flex flex-col items-center justify-center text-center p-10">
        <h2 className="uppercase tracking-[0.2em] text-[15px] text-neutral-700">RFID Scan</h2>
        <div className="mt-6">
          <p className="font-serif leading-none text-black/90 text-[clamp(48px,10vw,96px)]">{title}</p>
          {uid ? <p className="mt-4 text-neutral-600 text-sm">UID {uid}</p> : null}
          <p className="mt-6 text-neutral-700 text-lg">{subtitle}</p>
          {kind === "welcome" && dispenseAvailable ? (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/90 border border-black/10 text-neutral-700 px-4 py-2">
              <span>👂</span>
              <span className="text-sm">Earplugs available</span>
            </div>
          ) : null}
          {kind === "queued" && uid ? (
            <div className="mt-8 flex flex-col items-center gap-4">
              <Qr text={ticketUrl} size={220} />
              <div className="text-sm text-neutral-600 w-[min(90vw,420px)]">
                Scan this QR code on your phone (connected to the same WiFi) to track your position live.
              </div>
              <button
                onClick={handleLeaveQueue}
                disabled={leaving}
                className="mt-3 rounded-md border border-black/20 px-4 py-3 text-base"
              >
                {leaving ? 'Leaving…' : 'Leave queue'}
              </button>
              {/* Remove duplicate position text; main heading already shows You're #X */}
              {error ? <p className="text-sm text-red-600 mt-1">{error}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}


