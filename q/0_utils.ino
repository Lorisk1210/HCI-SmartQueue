// =====================================================================
// UTILITY HELPER FUNCTIONS
// =====================================================================
// General purpose helper functions used across the system.

// Extern declarations for shared state (defined in 1_queue_state.ino)
extern String inLibrary[];
extern uint8_t inCount;
extern String waitQueue[];
extern uint8_t queueCount;

// Format RFID card UID as a human-readable hex string (e.g., "AB:CD:EF:12")
String formatUid(const MFRC522::Uid &uid) {
  String result;
  for (byte i = 0; i < uid.size; i++) {
    if (i > 0) result += ':';
    if (uid.uidByte[i] < 0x10) result += '0';
    result += String(uid.uidByte[i], HEX);
  }
  result.toUpperCase();
  return result;
}

// Escape special characters in a string for safe JSON transmission
// Converts quotes to "\" and backslashes to "\\"
String escapeJson(String s) {
  s.replace("\\", "\\\\");
  s.replace("\"", "\\\"");
  return s;
}

// Convert an IP address object to a dotted decimal string
String ipToString(const IPAddress &ip) {
  return String(ip[0]) + "." + String(ip[1]) + "." + String(ip[2]) + "." + String(ip[3]);
}

// Calculate how many open slots are available in the library
int getFreeSlots() {
  return (int)MAX_SLOTS - (int)inCount;
}

// Find the queue position of a card (1-based), or -1 if not queued
int getCardQueuePosition(const String &cardId) {
  for (uint8_t i = 0; i < queueCount; i++) {
    if (waitQueue[i] == cardId) return i + 1;
  }
  return -1;
}
