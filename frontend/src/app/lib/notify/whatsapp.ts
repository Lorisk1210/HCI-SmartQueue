// =====================================================================
// WhatsApp Notification Service - Queue State Monitoring
// =====================================================================
// Monitors queue state changes and RFID scan events, then sends WhatsApp
// notifications via Twilio when appropriate conditions are met. Implements
// cooldown periods to prevent notification spam. Always sends to the same
// fixed phone number regardless of who is in the queue.

// =====================================================================
// Notification State Tracking
// =====================================================================
// Tracks whether we've already sent notifications for recent events to
// avoid duplicate notifications. Uses cooldown periods to allow re-notification
// if conditions change and change back.
let lastNotifiedQueued = false;
let lastNotifiedReady = false;
let lastQueueState: {
  freeSlots: number;
  nextTicket: string | null;
  queueCount: number;
} | null = null;

// =====================================================================
// Send WhatsApp Notification
// =====================================================================
// Sends a WhatsApp message via Twilio API. The notification type determines
// the message content. Always sends to the same fixed phone number configured
// in environment variables.
export async function sendWhatsAppNotification(type: 'queued' | 'ready', nextTicket?: string): Promise<void> {
  try {
    const response = await fetch('/api/notify/whatsapp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type, nextTicket }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to send WhatsApp notification:', error);
      return;
    }

    const result = await response.json();
    console.log('WhatsApp notification sent:', result);
  } catch (error) {
    console.error('Error sending WhatsApp notification:', error);
  }
}

// =====================================================================
// Handle RFID Scan Event
// =====================================================================
// Handle RFID scan event - send notification if someone is queued.
// Triggered whenever someone scans their card and gets added to the queue.
// Implements a 10-second cooldown to prevent duplicate notifications.
export function handleRfidScan(scan: { reason?: string; uid?: string }): void {
  // Send notification when someone is added to queue
  // Note: This will trigger for anyone added to queue, but we'll only send
  // to the fixed number (as per requirement: "always be the same number no matter who")
  if (scan.reason === 'queued' && !lastNotifiedQueued) {
    lastNotifiedQueued = true;
    sendWhatsAppNotification('queued').catch(console.error);
    
    // Reset after a delay to allow re-notification if needed
    setTimeout(() => {
      lastNotifiedQueued = false;
    }, 10000); // 10 second cooldown
  }
}

// =====================================================================
// Handle Queue State Update
// =====================================================================
// Handle queue state update - send notification when slot is free and
// someone is first in queue. Detects the transition from "not ready" to
// "ready" state to avoid sending notifications on every update. Implements
// a 30-second cooldown.
export function handleQueueUpdate(update: {
  freeSlots: number;
  nextTicket: string | null;
  length: number;
}): void {
  // Check if someone is first in queue with a free slot available
  const isReady = update.freeSlots > 0 && update.nextTicket !== null && update.length > 0;
  
  // Detect transition from "not ready" to "ready"
  const wasReady = lastQueueState
    ? lastQueueState.freeSlots > 0 && lastQueueState.nextTicket !== null && lastQueueState.queueCount > 0
    : false;
  
  const justBecameReady = isReady && !wasReady;
  
  if (justBecameReady && !lastNotifiedReady) {
    lastNotifiedReady = true;
    // Pass the nextTicket UID so webhook knows who to confirm
    sendWhatsAppNotification('ready', update.nextTicket || undefined).catch(console.error);
    
    // Reset after a delay to allow re-notification if slot becomes unavailable then available again
    setTimeout(() => {
      lastNotifiedReady = false;
    }, 30000); // 30 second cooldown
  }
  
  // Update last known state
  lastQueueState = {
    freeSlots: update.freeSlots,
    nextTicket: update.nextTicket,
    queueCount: update.length,
  };
}

// =====================================================================
// Reset Notification State
// =====================================================================
// Reset notification state (useful for testing). Clears all tracking
// state to allow fresh notifications.
export function resetNotificationState(): void {
  lastNotifiedQueued = false;
  lastNotifiedReady = false;
  lastQueueState = null;
}

