"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTicket } from "@/app/hooks/useTicket";

export default function TicketPage() {
  const params = useParams<{ uid: string }>();
  const raw = params.uid;
  let decoded = typeof raw === 'string' ? raw : '';
  try { decoded = decodeURIComponent(decoded); } catch (_) {}
  const uid = decoded.toUpperCase();
  const { queuePosition, inside, freeSlots, maxSlots, inCount, isTurn } = useTicket(uid);
  
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entryConfirmationVisible, setEntryConfirmationVisible] = useState(false);
  const [pendingEntryConfirmation, setPendingEntryConfirmation] = useState<{
    timeRemainingMs: number;
  } | null>(null);

  // Detect when user becomes first in queue with free slot and start confirmation timer
  useEffect(() => {
    if (!uid || inside || queuePosition === -1 || !isTurn) {
      // Clear confirmation if user is no longer eligible
      if (entryConfirmationVisible && (!isTurn || inside || queuePosition === -1)) {
        setEntryConfirmationVisible(false);
        setPendingEntryConfirmation(null);
      }
      return;
    }

    // User just became first with free slot - start confirmation
    if (isTurn && !entryConfirmationVisible) {
      // Start entry confirmation
      (async () => {
        try {
          const { startEntryConfirmation, setupAutoRemoval } = await import('@/app/lib/entry-confirmation');
          const result = startEntryConfirmation(uid);
          
          // Set up auto-removal - use Next.js API endpoint
          setupAutoRemoval(uid, async (uidToRemove) => {
            // Remove from queue via Next.js API (which proxies to Arduino)
            try {
              await fetch('/api/queue/leave', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: uidToRemove }),
              });
            } catch (err) {
              console.error('Failed to auto-remove from queue:', err);
            }
          });

          if (!result.wasAlreadyPending) {
            setEntryConfirmationVisible(true);
            setPendingEntryConfirmation({ timeRemainingMs: result.timeRemainingMs });
          }
        } catch (e) {
          console.error('Failed to start entry confirmation:', e);
        }
      })();
    }
  }, [uid, isTurn, inside, queuePosition, entryConfirmationVisible]);

  // Poll for confirmation status while dialog is visible
  useEffect(() => {
    if (!uid || !entryConfirmationVisible || inside) return;

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/queue/entry/confirm?uid=${encodeURIComponent(uid)}`);
        const data = await res.json();
        if (data.ok && data.pending) {
          setPendingEntryConfirmation({ timeRemainingMs: data.timeRemainingMs });
        } else {
          // No longer pending (expired or confirmed)
          setEntryConfirmationVisible(false);
          setPendingEntryConfirmation(null);
        }
      } catch (e) {
        // Ignore errors
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 1000);
    return () => clearInterval(interval);
  }, [uid, entryConfirmationVisible, inside]);

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
      // Clear entry confirmation if leaving
      const { clearEntryConfirmation } = await import('@/app/lib/entry-confirmation');
      clearEntryConfirmation(uid);
      setEntryConfirmationVisible(false);
      setPendingEntryConfirmation(null);
    } catch (e) {
      setError('Could not leave queue');
    } finally {
      setLeaving(false);
    }
  }

  async function handleConfirmEntry() {
    if (!uid) return;
    setError(null);
    try {
      const res = await fetch('/api/queue/entry/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to confirm entry');
      }
      setEntryConfirmationVisible(false);
      setPendingEntryConfirmation(null);
      // User confirmed - they now have 15 minutes to scan their card
    } catch (e: any) {
      setError(e.message || 'Could not confirm entry');
      setEntryConfirmationVisible(false);
      setPendingEntryConfirmation(null);
    }
  }

  function formatTimeRemaining(ms: number): string {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

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
          {!inside && queuePosition > 0 ? (
            <button
              onClick={handleLeaveQueue}
              disabled={leaving}
              className="mt-8 w-full rounded-md border border-black/20 px-4 py-3 text-base hover:bg-black/5 disabled:opacity-50"
            >
              {leaving ? 'Leaving…' : 'Leave queue'}
            </button>
          ) : null}
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </div>
        
        {/* Entry Confirmation Dialog - shown when user is first with free slot */}
        {entryConfirmationVisible && isTurn && !inside && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-xl font-semibold mb-4">Confirm Entry</h3>
              <p className="text-neutral-600 mb-4">
                A slot is available! Do you still want to enter? You have{' '}
                <span className="font-semibold text-black">
                  {pendingEntryConfirmation ? formatTimeRemaining(pendingEntryConfirmation.timeRemainingMs) : '5:00'}
                </span>{' '}
                to confirm.
              </p>
              <p className="text-sm text-neutral-500 mb-6">
                If you don't confirm within 5 minutes, you will be automatically removed from the queue. After confirming, you have 15 minutes to scan your card at the entrance.
              </p>
              {error ? <p className="text-sm text-red-600 mb-4">{error}</p> : null}
              <div className="flex gap-3">
                <button
                  onClick={handleConfirmEntry}
                  className="flex-1 rounded-md bg-black text-white px-4 py-3 text-base font-medium hover:bg-black/90"
                >
                  Yes, I want to enter
                </button>
                <button
                  onClick={handleLeaveQueue}
                  className="flex-1 rounded-md border border-black/20 px-4 py-3 text-base hover:bg-black/5"
                >
                  No, leave queue
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}


