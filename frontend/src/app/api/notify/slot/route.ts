export const runtime = 'nodejs';

import { getNotifyStore } from '@/app/lib/notify/NotifyStore';
import { sendSlotAvailableEmail } from '@/app/lib/notify/mailer';

export async function POST(req: Request) {
  let uid: string | undefined;
  try {
    const body = await req.json();
    uid = body?.uid;
  } catch (_) {}

  if (!uid || typeof uid !== 'string') {
    return new Response(JSON.stringify({ ok: false, error: 'uid required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const store = getNotifyStore();
  const email = store.uidToEmail.get(uid);
  if (!email) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'no email' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = Date.now();
  const last = store.lastNotifiedAt.get(uid) || 0;
  if (now - last < 10 * 60 * 1000) {
    // Cooldown to avoid spamming (10 minutes)
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'cooldown' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const result = await sendSlotAvailableEmail(uid, email);
    store.lastNotifiedAt.set(uid, now);
    return new Response(JSON.stringify({ ok: true, sent: !result.simulated }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: 'send failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}


