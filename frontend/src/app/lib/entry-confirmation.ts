// =====================================================================
// Entry Confirmation Manager - Time-Limited Entry Requests
// =====================================================================
// Shared state for managing entry confirmation requests. When a user becomes
// first in queue with a free slot, they have 5 minutes to confirm they still
// want to enter. If they don't confirm, they are automatically removed from
// the queue. After confirming, they have 15 minutes to scan their card.
// 
// This is a simple in-memory store. In production, use Redis or a database
// for persistence across server restarts and multi-server deployments.

export interface PendingEntryConfirmation {
  uid: string;
  requestedAt: number;
  confirmed: boolean;
  timeoutId?: NodeJS.Timeout;
}

// =====================================================================
// Confirmation Storage
// =====================================================================
// Map of UID to pending confirmation requests. Only one confirmation can
// be pending per user at a time.
const pendingConfirmations = new Map<string, PendingEntryConfirmation>();

// =====================================================================
// Confirmation Timeout
// =====================================================================
// Users have 5 minutes to confirm they still want to enter after becoming
// first in queue with a free slot available.
const CONFIRMATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// =====================================================================
// Start Entry Confirmation
// =====================================================================
// Start entry confirmation - called when user becomes first in queue with free slot.
// Returns the current status, including whether a confirmation was already pending.
export function startEntryConfirmation(uid: string): {
  pending: boolean;
  timeRemainingMs: number;
  wasAlreadyPending: boolean;
} {
  const existing = pendingConfirmations.get(uid);
  
  if (existing && !existing.confirmed) {
    // Already has pending confirmation, return current status
    const timeRemaining = CONFIRMATION_TIMEOUT_MS - (Date.now() - existing.requestedAt);
    return {
      pending: true,
      timeRemainingMs: Math.max(0, timeRemaining),
      wasAlreadyPending: true,
    };
  }

  // Clear any existing timeout
  if (existing?.timeoutId) {
    clearTimeout(existing.timeoutId);
  }

  // Create new confirmation request
  const confirmation: PendingEntryConfirmation = {
    uid,
    requestedAt: Date.now(),
    confirmed: false,
  };
  
  pendingConfirmations.set(uid, confirmation);

  return {
    pending: true,
    timeRemainingMs: CONFIRMATION_TIMEOUT_MS,
    wasAlreadyPending: false,
  };
}

// =====================================================================
// Setup Auto-Removal
// =====================================================================
// Set up auto-removal callback for a pending confirmation. When the timeout
// expires, the callback is invoked to remove the user from the queue. This
// allows the confirmation system to be used with different queue backends.
export function setupAutoRemoval(
  uid: string,
  onTimeout: (uid: string) => void | Promise<void>
): void {
  const confirmation = pendingConfirmations.get(uid);
  if (!confirmation || confirmation.confirmed) return;

  // Clear existing timeout if any
  if (confirmation.timeoutId) {
    clearTimeout(confirmation.timeoutId);
  }

  // Set new timeout
  const timeoutId = setTimeout(async () => {
    const current = pendingConfirmations.get(uid);
    if (current && !current.confirmed) {
      // User didn't confirm within 5 minutes
      pendingConfirmations.delete(uid);
      await onTimeout(uid);
    }
  }, CONFIRMATION_TIMEOUT_MS);

  confirmation.timeoutId = timeoutId;
  pendingConfirmations.set(uid, confirmation);
}

// =====================================================================
// Confirm Entry
// =====================================================================
// Confirm the entry - user still wants to enter. Returns true if confirmation
// was successful, false if no pending confirmation exists or it has expired.
export function confirmEntry(uid: string): boolean {
  const confirmation = pendingConfirmations.get(uid);
  if (!confirmation) {
    return false; // No pending confirmation
  }

  if (confirmation.confirmed) {
    return false; // Already confirmed
  }

  // Check if expired
  const timeRemaining = CONFIRMATION_TIMEOUT_MS - (Date.now() - confirmation.requestedAt);
  if (timeRemaining <= 0) {
    pendingConfirmations.delete(uid);
    return false; // Expired
  }

  // Mark as confirmed and clear timeout
  confirmation.confirmed = true;
  if (confirmation.timeoutId) {
    clearTimeout(confirmation.timeoutId);
  }
  
  // Remove from map after a short delay
  setTimeout(() => {
    pendingConfirmations.delete(uid);
  }, 1000);

  return true;
}

// =====================================================================
// Get Entry Confirmation Status
// =====================================================================
// Get status of a pending entry confirmation. Returns null if no confirmation
// is pending or it has been confirmed/expired. Otherwise returns the time
// remaining in milliseconds.
export function getEntryConfirmationStatus(uid: string): {
  pending: boolean;
  timeRemainingMs: number;
} | null {
  const confirmation = pendingConfirmations.get(uid);
  if (!confirmation) {
    return null;
  }

  if (confirmation.confirmed) {
    return null;
  }

  const timeRemaining = CONFIRMATION_TIMEOUT_MS - (Date.now() - confirmation.requestedAt);
  if (timeRemaining <= 0) {
    pendingConfirmations.delete(uid);
    return null;
  }

  return {
    pending: true,
    timeRemainingMs: Math.max(0, timeRemaining),
  };
}

// =====================================================================
// Clear Entry Confirmation
// =====================================================================
// Cancel/clear entry confirmation. Called when user leaves the queue or
// successfully enters, to clean up the pending confirmation state.
export function clearEntryConfirmation(uid: string): void {
  const confirmation = pendingConfirmations.get(uid);
  if (!confirmation) return;

  if (confirmation.timeoutId) {
    clearTimeout(confirmation.timeoutId);
  }
  
  pendingConfirmations.delete(uid);
}

