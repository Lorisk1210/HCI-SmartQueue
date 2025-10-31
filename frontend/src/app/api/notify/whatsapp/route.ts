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
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_FROM;
const TO = process.env.TWILIO_TO;

if (!accountSid || !authToken || !FROM || !TO) {
  throw new Error('Missing required Twilio environment variables');
}

const client = twilio(accountSid, authToken);

// =====================================================================
// POST Handler - Send Notification
// =====================================================================
// Receives notification type and optional nextTicket UID, then sends the
// appropriate WhatsApp message. For "ready" type, includes reply instructions
// that the webhook can process.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, nextTicket } = body;

    let message = '';
    let actions: Array<{ title: string; type: string }> = [];

    if (type === 'queued') {
      message = "✅ You have been added to the queue. We'll notify you when it's your turn!";
      // No buttons for queued - user can't cancel via WhatsApp yet
    } else if (type === 'ready') {
      message = "📚 A slot is available! Do you still want to enter? You have 5 minutes to confirm.";
      // Add interactive buttons for confirm/leave
      actions = [
        {
          title: 'Yes, I want to enter',
          type: 'quick_reply'
        },
        {
          title: 'No, leave queue',
          type: 'quick_reply'
        }
      ];
    } else {
      return NextResponse.json(
        { ok: false, error: 'Invalid notification type' },
        { status: 400 }
      );
    }

    // For "ready" type, send with interactive options
    if (type === 'ready' && actions.length > 0) {
      // Note: True WhatsApp clickable buttons require approved message templates from WhatsApp
      // For now, we send a message with clear reply instructions
      // Users can reply with options - the webhook will handle responses
      const interactiveMsg = await client.messages.create({
        from: FROM,
        to: TO,
        body: message + `\n\n📱 Reply:\n\n1️⃣ or YES - Confirm entry\n2️⃣ or NO - Leave queue\n\nYou have 5 minutes to reply.`,
      });

      return NextResponse.json({
        ok: true,
        sid: interactiveMsg.sid,
        message: 'Notification with buttons sent successfully',
      });
    } else {
      // Regular message without buttons
      const msg = await client.messages.create({
        from: FROM,
        body: message,
        to: TO,
      });

      return NextResponse.json({
        ok: true,
        sid: msg.sid,
        message: 'Notification sent successfully',
      });
    }
  } catch (error: any) {
    console.error('Twilio error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to send notification' },
      { status: 500 }
    );
  }
}

