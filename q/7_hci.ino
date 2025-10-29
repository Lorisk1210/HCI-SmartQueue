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

// =====================================================================
// WIFI ACCESS POINT SETUP
// =====================================================================

// Initialize and start the WiFi Access Point
void startAccessPoint() {
  WiFi.end();
  
  // Attempt to start the access point
  int result = WiFi.beginAP(apSsid, apPass);
  if (result != WL_AP_LISTENING && result != WL_CONNECTED) {
    Serial.println("Failed to start AP. Retrying...");
    delay(3000);
    result = WiFi.beginAP(apSsid, apPass);
  }
  
  // Start the web server
  server.begin();
  
  // Print AP details to serial
  Serial.println("Access Point started.");
  Serial.print("SSID: "); Serial.println(apSsid);
  Serial.print("IP address: "); Serial.println(ipToString(WiFi.localIP())); // typically 192.168.4.1
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
  
  // Start WiFi access point and web server
  startAccessPoint();
  
  Serial.println("System ready. Connect to WiFi and visit dashboard.");
}

// Called repeatedly by Arduino runtime
void loop() {
  // Check for RFID card scans and process them
  handleRFID();
  
  // Check ultrasonic sensor and trigger servo if needed
  maybeTriggerServoFromUltrasonic();
  
  // Update servo state machine (handle drop/return timing)
  pumpServo();
  
  // Send keep-alive pings to SSE clients
  pumpSseKeepAlive();
  
  // Handle incoming web clients (HTTP and SSE)
  WiFiClient client = server.available();
  if (client) {
    handleClient(client);
  }
}
