// =====================================================================
// WhatsApp Notification Route - Send Messages via Twilio
// =====================================================================
// API route that sends WhatsApp notifications via Twilio. Handles two types
// of notifications: "queued" (someone joined the queue) and "ready" (slot
// available, first person should confirm). For "ready" notifications, includes
// interactive response options that users can reply to via the webhook.

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';

// =====================================================================
// Twilio Configuration
// =====================================================================
// Twilio credentials from environment variables. These must be set for
// WhatsApp notifications to work.
function ensureWhatsAppAddress(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withoutPrefix = trimmed.replace(/^whatsapp:/i, '').trim();
  if (!withoutPrefix) return null;
  return `whatsapp:${withoutPrefix}`;
}

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const FROM = ensureWhatsAppAddress(process.env.TWILIO_FROM);
const TO = ensureWhatsAppAddress(process.env.TWILIO_TO);

// Optional: Content SIDs for using Twilio Content API (approved templates)
const CONTENT_SID_QUEUED = process.env.TWILIO_CONTENT_SID_QUEUED;
const CONTENT_SID_READY = process.env.TWILIO_CONTENT_SID_READY;

if (!accountSid || !authToken || !FROM || !TO) {
  throw new Error('Missing required Twilio environment variables');
}

const client = twilio(accountSid, authToken);

// =====================================================================
// POST Handler - Send Notification
// =====================================================================
// Receives notification type and optional nextTicket UID, then sends the
// appropriate WhatsApp message. Uses Twilio Content API if content SIDs are
// configured, otherwise falls back to basic body text.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, nextTicket } = body;

    if (type !== 'queued' && type !== 'ready') {
      return NextResponse.json(
        { ok: false, error: 'Invalid notification type' },
        { status: 400 }
      );
    }

    // =====================================================================
    // Content API Approach (Preferred)
    // =====================================================================
    // If content SIDs are configured, use the Content API with approved templates.
    // This is required for production WhatsApp notifications with interactive buttons.
    if (type === 'queued' && CONTENT_SID_QUEUED) {
      try {
        const msg = await client.messages.create({
          from: FROM,
          to: TO,
          contentSid: CONTENT_SID_QUEUED,
          contentVariables: JSON.stringify({}), // Add variables if your template needs them
        });

        return NextResponse.json({
          ok: true,
          sid: msg.sid,
          message: 'Notification sent successfully (Content API)',
        });
      } catch (contentError: any) {
        console.error('Content API error for queued:', contentError);
        // Fall through to basic message
      }
    }

    if (type === 'ready' && CONTENT_SID_READY) {
      try {
        const msg = await client.messages.create({
          from: FROM,
          to: TO,
          contentSid: CONTENT_SID_READY,
          contentVariables: JSON.stringify({}), // Add variables if your template needs them
        });

        return NextResponse.json({
          ok: true,
          sid: msg.sid,
          message: 'Notification sent successfully (Content API)',
        });
      } catch (contentError: any) {
        console.error('Content API error for ready:', contentError);
        // Fall through to basic message
      }
    }

    // =====================================================================
    // Fallback: Basic Message API
    // =====================================================================
    // If Content API is not configured or fails, fall back to basic text messages.
    // Note: Basic text messages may have delivery restrictions on WhatsApp.
    let message = '';
    if (type === 'queued') {
      message = "✅ You have been added to the queue. We'll notify you when it's your turn!";
    } else if (type === 'ready') {
      message = "📚 A slot is available! Do you still want to enter?\n\n📱 Reply:\n\n1️⃣ or YES - Confirm entry\n2️⃣ or NO - Leave queue\n\nYou have 5 minutes to reply.";
    }

    const msg = await client.messages.create({
      from: FROM,
      to: TO,
      body: message,
    });

    return NextResponse.json({
      ok: true,
      sid: msg.sid,
      message: 'Notification sent successfully (fallback)',
    });
  } catch (error: any) {
    console.error('Twilio error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to send notification' },
      { status: 500 }
    );
  }
}

