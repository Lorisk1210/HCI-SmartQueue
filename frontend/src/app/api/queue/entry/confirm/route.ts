// =====================================================================
// Confirm Entry Route - User Confirms Entry Intent
// =====================================================================
// API route for confirming entry when a user becomes first in queue with
// a free slot. Validates the confirmation timeout hasn't expired, marks
// the entry as confirmed, and notifies the Arduino to start the 15-minute
// scan window. Also provides a GET endpoint to check confirmation status.

export const runtime = 'nodejs';

import { confirmEntry, getEntryConfirmationStatus } from '@/app/lib/entry-confirmation';
import { getArduinoBaseUrl } from '@/app/lib/arduino-discovery';

// =====================================================================
// POST Handler - Confirm Entry
// =====================================================================
export async function POST(req: Request) {
  let uid: string | undefined;
  try {
    const body = await req.json();
    uid = body?.uid;
  } catch (_) {
    // ignore
  }
  
  if (!uid || typeof uid !== 'string') {
    return new Response(JSON.stringify({ ok: false, error: 'uid required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const confirmed = confirmEntry(uid);
  
  if (!confirmed) {
    return new Response(JSON.stringify({ 
      ok: false, 
      error: 'No pending entry confirmation found or confirmation expired' 
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Notify Arduino to start the 15-minute timer
  try {
    const arduinoBase = await getArduinoBaseUrl();
    const url = `${arduinoBase}/api/queue/confirm-entry?uid=${encodeURIComponent(uid)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    await fetch(url, { 
      method: 'GET', 
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (err) {
    // Log but don't fail - Arduino timer might not be critical if confirmation already happened
    console.error('Failed to notify Arduino of entry confirmation:', err);
  }

  return new Response(JSON.stringify({ 
    ok: true,
    message: 'Entry confirmed. You have 15 minutes to scan your card at the entrance.',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// =====================================================================
// GET Handler - Check Confirmation Status
// =====================================================================
// Returns the current status of a pending entry confirmation, including
// whether it's still pending and how much time remains.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get('uid');
  
  if (!uid) {
    return new Response(JSON.stringify({ ok: false, error: 'uid required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const status = getEntryConfirmationStatus(uid);
  
  return new Response(JSON.stringify({ 
    ok: true, 
    pending: status !== null,
    timeRemainingMs: status?.timeRemainingMs ?? 0,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

