"use client";

// =====================================================================
// Scan Overlay Component - RFID Scan Feedback
// =====================================================================
// Full-screen overlay that appears when an RFID card is scanned at the
// entrance. Shows different messages and actions based on the scan outcome.
// For queued users, displays a QR code they can scan on their phone to
// track their position in real-time.

import React, { useEffect, useMemo, useState } from "react";
import Qr from "./Qr";
import GambleBlackjack, { GambleSummary } from "./GambleBlackjack";

type Props = {
  // Whether the overlay should be visible
  visible: boolean;
  // Type of scan outcome: welcome (can enter), queued (added to queue),
  // goodbye (left library), denied (queue full)
  kind?: "welcome" | "queued" | "goodbye" | "denied";
  // RFID card UID that was scanned
  uid?: string;
  // Position in queue (1-based, only shown when queued)
  queuePosition?: number;
  // Estimated wait time in minutes (only shown when queued)
  etaMinutes?: number;
  // Callback to dismiss/close the overlay
  onDismiss?: () => void;
  // Whether earplugs are available for dispense (shown for welcome messages)
  dispenseAvailable?: boolean;
  // Total number of people in queue (for gamble eligibility)
  queueCount?: number;
  // Lock overlay visibility while gamble is active
  onHold?: () => void;
  // Release overlay lock after gamble concludes
  onRelease?: (delayMs?: number) => void;
};

export default function ScanOverlay({ visible, kind, uid, queuePosition, etaMinutes, onDismiss, dispenseAvailable, queueCount, onHold, onRelease }: Props) {
  if (!visible) return null;

  // =====================================================================
  // Dynamic Message Generation
  // =====================================================================
  // Generate appropriate title and subtitle text based on the scan outcome.
  // Different messages are shown for different scenarios to guide the user.
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

  // =====================================================================
  // Overlay Interaction
  // =====================================================================
  // Allow user to dismiss overlay by clicking/tapping anywhere on it
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gambleOpen, setGambleOpen] = useState(false);
  const [gambleSummary, setGambleSummary] = useState<GambleSummary | null>(null);

  const handleBackgroundClick = () => {
    if (gambleOpen) return;
    onDismiss?.();
  };

  useEffect(() => {
    // Reset gamble state when overlay swaps to a different UID
    setGambleOpen(false);
    setGambleSummary(null);
    onRelease?.();
  }, [uid, onRelease]);

  useEffect(() => {
    return () => {
      if (gambleOpen) {
        onRelease?.();
      }
    };
  }, [gambleOpen, onRelease]);

  // =====================================================================
  // QR Code Base URL Detection
  // =====================================================================
  // Determine the base URL for generating QR codes. This needs to be
  // accessible from mobile devices, so we try to detect the LAN IP address
  // rather than using localhost. Falls back to environment variable or
  // queries the server for the correct base URL.
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

  // =====================================================================
  // QR Code URL Generation
  // =====================================================================
  // Construct the full URL that the QR code will point to. Users scan this
  // QR code on their phone to access their personal ticket page where they
  // can see their queue position and manage their entry.
  const ticketUrl = useMemo(() => {
    if (!uid || !ticketBase) return "";
    const encoded = encodeURIComponent(uid);
    return `${ticketBase}/ticket/${encoded}`;
  }, [uid, ticketBase]);

  // =====================================================================
  // Leave Queue Handler
  // =====================================================================
  // Allows queued users to remove themselves from the queue directly from
  // the overlay. Useful if they change their mind immediately after scanning.
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

  const eligibleForGamble = kind === "queued" && !!uid && typeof queuePosition === "number" && queuePosition > 1 && typeof queueCount === "number" && queueCount > queuePosition;

  function handleStartGamble(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (!eligibleForGamble) return;
    setGambleSummary(null);
    setGambleOpen(true);
    onHold?.();
  }

  function handleCloseGamble(options?: { cancelled?: boolean }) {
    setGambleOpen(false);
    if (!options?.cancelled) {
      onRelease?.(6000);
    } else {
      onRelease?.();
    }
  }

  function handleGambleFinished(summary: GambleSummary) {
    setGambleSummary(summary);
  }

  const summaryCopy = useMemo(() => {
    if (!gambleSummary) return null;
    if (gambleSummary.result === "push") return "Blackjack push – queue stays the same.";
    if (!gambleSummary.movement?.direction) return "Result recorded. Queue unchanged.";
    if (!gambleSummary.movement.applied) return "Result recorded, but queue could not update.";
    if (gambleSummary.movement.direction === "up") return "You moved up by one slot.";
    return "You dropped one slot.";
  }, [gambleSummary]);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 backdrop-blur"
      onClick={handleBackgroundClick}
      onTouchEnd={handleBackgroundClick}
    >
      <div
        className="w-full h-full flex flex-col items-center justify-center text-center p-10"
      >
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
                Scan this QR code on your phone to track your position live.
              </div>
              {summaryCopy ? (
                <div className="mt-2 rounded-full border border-neutral-300/70 bg-white/80 px-4 py-2 text-xs text-neutral-600">
                  {summaryCopy}
                </div>
              ) : null}
              {eligibleForGamble && !gambleOpen ? (
                <button
                  onClick={handleStartGamble}
                  onTouchEnd={(event) => event.stopPropagation()}
                  className="mt-2 rounded-full border border-neutral-400/60 px-4 py-2 text-xs uppercase tracking-[0.3em] text-neutral-500 transition hover:bg-neutral-100"
                >
                  Gamble Slot
                </button>
              ) : null}
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  handleLeaveQueue();
                }}
                onTouchEnd={(event) => event.stopPropagation()}
                disabled={leaving}
                className="mt-3 rounded-md border border-black/20 px-4 py-3 text-base hover:bg-black/5"
              >
                {leaving ? 'Leaving…' : 'Leave queue'}
              </button>
              {/* Remove duplicate position text; main heading already shows You're #X */}
              {error ? <p className="text-sm text-red-600 mt-1">{error}</p> : null}
            </div>
          ) : null}
        </div>
        {gambleOpen && uid ? (
          <div className="mt-10 w-full flex justify-center" onClick={(evt) => evt.stopPropagation()} onTouchEnd={(evt) => evt.stopPropagation()}>
            <GambleBlackjack uid={uid} onClose={handleCloseGamble} onFinished={handleGambleFinished} />
          </div>
        ) : null}
      </div>
    </div>
  );
}


