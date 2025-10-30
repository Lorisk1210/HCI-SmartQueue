#ifndef CONFIG_H
#define CONFIG_H

// =====================================================================
// RFID Reader (MFRC522) - SPI Communication
// =====================================================================
// Wiring: SDA(SS)=10, SCK=13, MOSI=11, MISO=12, RST=9
#define SDA_PIN 10
#define RST_PIN 9

// =====================================================================
// RGB LED (Common Cathode) - Digital + PWM
// =====================================================================
// Cathode connected to GND
#define RED_PIN   4   // Digital pin (no PWM available)
#define GREEN_PIN 5   // PWM-capable pin for brightness control
#define BLUE_PIN  3   // PWM-capable pin for brightness control

// =====================================================================
// Buzzer - Passive (requires frequency generation)
// =====================================================================
#define BUZZER_PIN 2

// =====================================================================
// Servo Motor (SG90) - PWM Control
// =====================================================================
// Signal wire connected to PWM-capable pin
#define SERVO_PIN 8
const int SERVO_HOME_ANGLE = 90;        // Position when resting (keeps balls inside)
const int SERVO_TRIGGER_ANGLE = 48;    // Position when dropping a ball
const unsigned long SERVO_DROP_TIME_MS = 150;   // How long to hold drop position
const unsigned long SERVO_RETURN_TIME_MS = 150; // How long to return to home

// =====================================================================
// Ultrasonic Distance Sensor (HC-SR04)
// =====================================================================
#define ULTRA_TRIG_PIN A1   // Trigger pulse output
#define ULTRA_ECHO_PIN A2   // Echo pulse input
const int ULTRA_THRESHOLD_CM = 10;     // Distance threshold to trigger ball drop
const unsigned long ULTRA_INTERVAL_MS = 200;   // Check distance every 200ms
const unsigned long STEP_TRIGGER_COOLDOWN_MS = 1200; // Prevent rapid re-triggers

// =====================================================================
// Queue & Occupancy Management
// =====================================================================
const uint8_t MAX_SLOTS = 3;           // Maximum simultaneous people in library
const uint8_t WAIT_CAPACITY = 10;      // Maximum people in waiting queue

// =====================================================================
// WiFi Station (Client) Configuration
// =====================================================================
// Replace the placeholders below with the SSID and password of the WiFi
// network that provides internet access (e.g. phone hotspot or campus WiFi).
// Keep the strings short and ASCII-only to avoid flash memory issues.
const char WIFI_SSID[] = "iPhone von Loris";
const char WIFI_PASS[] = "mypassword";

// How long to wait for each connection attempt before retrying (milliseconds)
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 20000UL; // 20 seconds
const unsigned long WIFI_RETRY_DELAY_MS = 3000UL;      // 3 seconds between attempts
const unsigned long WIFI_HEALTH_CHECK_MS = 10000UL;    // Check connection every 10s

const uint16_t WEB_SERVER_PORT = 80;

// =====================================================================
// Server-Sent Events (SSE) for Real-Time Updates
// =====================================================================
const uint8_t MAX_SSE_CLIENTS = 4;      // Maximum concurrent browser connections
const unsigned long SSE_KEEPALIVE_MS = 15000; // Send keep-alive ping every 15s

#endif // CONFIG_H
