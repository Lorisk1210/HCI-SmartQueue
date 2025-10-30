// =====================================================================
// SmartQueue - Human-Computer Interface System
// =====================================================================
// Main controller for library queue management with RFID access,
// WiFi interface, proximity-based ball dropping, and real-time updates.
//
// Architecture:
// - Multiple .ino files organized by functionality
// - config.h contains all hardware definitions and constants
// - Each feature has its own file for modularity

#include <SPI.h>
#include <WiFiS3.h>
#include <Servo.h>
#include "MFRC522.h"
#include "config.h"

// Cross-file globals (defined in other .ino files)
extern WiFiServer server;      // from 6_web_server.ino
extern MFRC522 mfrc522;        // from 5_rfid_handler.ino
extern Servo myServo;          // from 3_servo_control.ino

// Forward declarations for functions defined in other .ino files
String ipToString(const IPAddress &ip);                    // from 0_utils.ino
void handleRFID();                                         // from 5_rfid_handler.ino
void maybeTriggerServoFromUltrasonic();                    // from 4_ultrasonic_sensor.ino
void pumpServo();                                          // from 3_servo_control.ino
void pumpSseKeepAlive();                                   // from 6_web_server.ino
void handleClient(WiFiClient &client);                     // from 6_web_server.ino
void setColor(int r, int g, int b);                        // from 2_led_buzzer.ino
void pumpQueueReservation();                                // from 1_queue_state.ino

// =====================================================================
// WIFI STATION (CLIENT) SETUP
// =====================================================================

// Connect to an existing WiFi network (STA mode) and start the web server
void connectToWiFi() {
  WiFi.end();
  delay(500); // Give WiFi time to reset

  Serial.println();
  Serial.print("Connecting to WiFi SSID: ");
  Serial.println(WIFI_SSID);

  uint8_t attempt = 0;
  while (true) {
    attempt++;
    if (attempt > 1) {
      Serial.println();
      Serial.println("=== Retrying connection ===");
    }
    
    Serial.print("Attempt ");
    Serial.println(attempt);
    
    WiFi.begin(WIFI_SSID, WIFI_PASS);

    unsigned long startAttempt = millis();
    unsigned long lastPrint = 0;
    
    while (millis() - startAttempt < WIFI_CONNECT_TIMEOUT_MS) {
      delay(500);
      
      int status = WiFi.status();
      IPAddress ip = WiFi.localIP();
      
      // Print detailed status every 3 seconds
      if (millis() - lastPrint > 3000) {
        lastPrint = millis();
        Serial.print("Status: ");
        Serial.print(status);
        Serial.print(" (");
        if (status == WL_CONNECTED) {
          Serial.print("CONNECTED");
        } else if (status == WL_IDLE_STATUS) {
          Serial.print("IDLE");
        } else if (status == WL_NO_SSID_AVAIL) {
          Serial.print("NO SSID");
        } else if (status == WL_SCAN_COMPLETED) {
          Serial.print("SCAN");
        } else if (status == WL_CONNECT_FAILED) {
          Serial.print("FAILED");
        } else if (status == WL_CONNECTION_LOST) {
          Serial.print("LOST");
        } else if (status == WL_DISCONNECTED) {
          Serial.print("DISCONNECTED");
        } else {
          Serial.print("UNKNOWN");
        }
        Serial.print("), IP: ");
        Serial.println(ipToString(ip));
      }
      
      // Check if we have both connection and valid IP (not 0.0.0.0)
      if (status == WL_CONNECTED && ip[0] != 0) {
        Serial.println();
        Serial.println("✓ WiFi connected successfully!");
        Serial.print("IP address: ");
        Serial.println(ipToString(ip));
        
        server.begin();
        Serial.println("HTTP server started.");
        return; // Success!
      }
    }

    Serial.println("Connection timeout - no valid IP received.");
    Serial.println("Possible issues:");
    Serial.println("  - Wrong SSID or password");
    Serial.println("  - Hotspot not allowing connections");
    Serial.println("  - DHCP server not responding");
    Serial.println("Retrying in 3 seconds...");
    delay(WIFI_RETRY_DELAY_MS);
  }
}

// Periodically ensure WiFi stays connected
void ensureWiFiConnected() {
  static unsigned long lastCheck = 0;
  unsigned long now = millis();
  if (now - lastCheck < WIFI_HEALTH_CHECK_MS) {
    return;
  }
  lastCheck = now;

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi connection lost. Reconnecting...");
    connectToWiFi();
  }
}

// =====================================================================
// ARDUINO LIFECYCLE FUNCTIONS
// =====================================================================

// Called once at startup to initialize all hardware
void setup() {
  Serial.begin(9600);
  while (!Serial) { ; } // Wait for serial to be ready
  
  // Initialize RFID reader via SPI
  SPI.begin();
  mfrc522.PCD_Init();
  Serial.println("RFID reader ready.");
  
  // Initialize output pins for RGB LED and Buzzer
  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(BLUE_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  
  // Initialize servo motor and ultrasonic sensor
  myServo.attach(SERVO_PIN);
  myServo.write(SERVO_HOME_ANGLE); // Start in safe home position
  pinMode(ULTRA_TRIG_PIN, OUTPUT);
  pinMode(ULTRA_ECHO_PIN, INPUT);
  
  // Set initial idle color (blue)
  setColor(0, 0, 255);
  
  // Connect to WiFi network and start web server
  connectToWiFi();
  
  Serial.println("System ready. Connect to the same network and visit dashboard.");
}

// Called repeatedly by Arduino runtime
void loop() {
  ensureWiFiConnected();
  
  // Check for RFID card scans and process them
  handleRFID();
  
  // Check ultrasonic sensor and trigger servo if needed
  maybeTriggerServoFromUltrasonic();
  
  // Update servo state machine (handle drop/return timing)
  pumpServo();

  // Handle queue reservation timeout (auto-remove #1 if unclaimed for 15 min)
  pumpQueueReservation();
  
  // Send keep-alive pings to SSE clients
  pumpSseKeepAlive();
  
  // Handle incoming web clients (HTTP and SSE)
  WiFiClient client = server.available();
  if (client) {
    handleClient(client);
  }
}
