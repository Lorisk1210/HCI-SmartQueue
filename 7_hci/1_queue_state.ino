// =====================================================================
// QUEUE & LIBRARY STATE MANAGEMENT
// =====================================================================
// Manages the list of people currently in the library and the waiting queue.

// Arrays to track state
String inLibrary[MAX_SLOTS];     // Cards currently in the library
uint8_t inCount = 0;            // Count of people in library

String waitQueue[WAIT_CAPACITY]; // Cards waiting to enter
uint8_t queueCount = 0;         // Count of people in queue

// Status message tracking for web interface
String lastStatusMsg;
unsigned long lastStatusMillis = 0;

// Event tracking for frontend notifications
String lastScanEvent = "";
String lastScannedCard = "";
unsigned long lastScanTimestamp = 0;

// Track which cards have already received a dispense via ultrasonic-triggered servo
// This is kept in memory for the runtime of the device
String dispensedLog[WAIT_CAPACITY + MAX_SLOTS + 20];
uint8_t dispensedCount = 0;

bool hasDispensedBefore(const String &id) {
  for (uint8_t i = 0; i < dispensedCount; i++) {
    if (dispensedLog[i] == id) return true;
  }
  return false;
}

bool recordDispenseForCard(const String &id) {
  if (hasDispensedBefore(id)) return false;
  if (dispensedCount < (WAIT_CAPACITY + MAX_SLOTS + 20)) {
    dispensedLog[dispensedCount++] = id;
    return true;
  }
  return false;
}

// ===== Queue Claim Reservation (timeout if not claimed) =====
// If a slot is free and someone is first in queue, they have CLAIM_TIMEOUT_MS to
// present their card and enter. Otherwise they are removed from the queue.
// Note: If they scan their card directly, they enter immediately (no confirmation needed).
// If they don't scan, they must confirm via web/WhatsApp within 5 minutes, then have 15 minutes to scan.
static const unsigned long CLAIM_TIMEOUT_MS = 15UL * 60UL * 1000UL; // 15 minutes
unsigned long queueClaimStartMillis = 0;
String queueClaimUid = "";
bool queueClaimConfirmed = false; // True after user confirms entry intention OR scans directly

void pumpQueueReservation() {
  extern void broadcastState(); // from 6_web_server.ino
  // Only applicable when there is a waiting queue and at least one free slot
  if (queueCount == 0 || getFreeSlots() <= 0) {
    queueClaimStartMillis = 0;
    queueClaimUid = "";
    queueClaimConfirmed = false;
    return;
  }

  // Current first in line
  String currentUid = waitQueue[0];
  // Start or reset reservation timer when the head changes
  if (queueClaimUid != currentUid) {
    queueClaimUid = currentUid;
    queueClaimStartMillis = 0; // Don't start timer yet - wait for confirmation OR direct scan
    queueClaimConfirmed = false;
    return;
  }

  // Only enforce timeout if timer was started (after confirmation OR direct scan)
  if (!queueClaimConfirmed || queueClaimStartMillis == 0) {
    return; // Wait for entry confirmation or direct RFID scan before starting timer
  }

  // Check timeout
  unsigned long now = millis();
  if (queueClaimStartMillis > 0 && (now - queueClaimStartMillis) > CLAIM_TIMEOUT_MS) {
    // Remove first in queue for not claiming the slot
    bool removed = removeFromWaitByIndex(0);
    if (removed) {
      setStatus("Queue timeout: removed " + currentUid);
      // Do not setScanEvent since this is not an RFID scan
      broadcastState();
    }
    // Reset reservation for the next person
    queueClaimStartMillis = 0;
    queueClaimUid = "";
    queueClaimConfirmed = false;
  }
}

// Reset/start the queue claim timer for the current first person
// Called after user confirms entry intention (via API)
bool resetQueueClaimTimer(const String &uid) {
  extern void broadcastState(); // from 6_web_server.ino
  // Only reset if this is the current first person
  if (queueCount == 0) {
    return false; // No queue
  }
  
  // Check if this UID is actually first
  if (waitQueue[0] != uid) {
    return false; // Not first in queue
  }
  
  // Only start timer if there's a free slot
  if (getFreeSlots() <= 0) {
    return false; // No free slots
  }
  
  // Start/reset the timer - this starts the 15-minute countdown
  queueClaimStartMillis = millis();
  queueClaimConfirmed = true;
  queueClaimUid = uid; // Ensure it's set
  
  return true;
}

// Clear entry confirmation state (for leave/reset)
void clearEntryConfirmation(const String &id) {
  if (queueClaimUid == id) {
    queueClaimStartMillis = 0;
    queueClaimUid = "";
    queueClaimConfirmed = false;
  }
}

// Update the status message that appears on the web dashboard
void setStatus(const String &msg) {
  lastStatusMsg = msg;
  lastStatusMillis = millis();
}

// Record a scan event for the frontend to display
void setScanEvent(const String &event, const String &cardId) {
  lastScanEvent = event;
  lastScannedCard = cardId;
  lastScanTimestamp = millis();
}

// Find the index of a card in the library array, or -1 if not found
int indexOfInLibrary(const String &id) {
  for (uint8_t i = 0; i < inCount; i++) {
    if (inLibrary[i] == id) return i;
  }
  return -1;
}

// Find the index of a card in the waiting queue, or -1 if not found
int indexOfWaitQueue(const String &id) {
  for (uint8_t i = 0; i < queueCount; i++) {
    if (waitQueue[i] == id) return i;
  }
  return -1;
}

// Try to add a card to the library. Returns false if already there or library is full.
bool addToLibrary(const String &id) {
  if (inCount >= MAX_SLOTS) return false;
  if (indexOfInLibrary(id) != -1) return false;
  inLibrary[inCount++] = id;
  return true;
}

// Remove a card from the library. Returns false if card not found.
bool removeFromLibrary(const String &id) {
  int idx = indexOfInLibrary(id);
  if (idx == -1) return false;
  // Shift remaining cards down to fill the gap
  for (uint8_t i = idx + 1; i < inCount; i++) {
    inLibrary[i - 1] = inLibrary[i];
  }
  inCount--;
  return true;
}

// Try to add a card to the waiting queue. Returns false if already queued or queue is full.
bool enqueueWait(const String &id) {
  if (queueCount >= WAIT_CAPACITY) return false;
  if (indexOfWaitQueue(id) != -1) return false;
  waitQueue[queueCount++] = id;
  return true;
}

// Remove a card from the queue at a specific position. Returns false if index is invalid.
bool removeFromWaitByIndex(uint8_t idx) {
  if (idx >= queueCount) return false;
  // Shift remaining cards down to fill the gap
  for (uint8_t i = idx + 1; i < queueCount; i++) {
    waitQueue[i - 1] = waitQueue[i];
  }
  queueCount--;
  return true;
}
