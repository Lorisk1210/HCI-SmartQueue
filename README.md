# SmartQueue - Library Queue Management System

An IoT queue management system using Arduino for RFID-based entry control and a Next.js web interface for real-time status tracking.

## Architecture

- **`7_hci/`** - Arduino firmware (ESP32/Arduino WiFi) handling RFID scanning, queue management, servo control, and WiFi AP
- **`frontend/`** - Next.js web app running on Raspberry Pi, providing kiosk display and mobile ticket pages

## Features

- RFID card scanning for entry/exit tracking
- Automatic queue management when library is full
- QR code generation for mobile ticket tracking
- Real-time updates via Server-Sent Events (SSE)
- Proximity-based ball dispensing (ultrasonic sensor + servo)
- 15-minute auto-removal if slot not claimed

## Setup

1. Upload Arduino code from `7_hci/` to your board
2. Connect Raspberry Pi to Arduino WiFi AP (SmartQueue)
3. Install and run Next.js app in `frontend/` directory
4. Configure environment variables (see below)
5. Scan RFID cards at entrance; QR codes appear for queued users

## Environment Variables

Create a `.env.local` file in the `frontend/` directory with the following variables:

### Required Variables

- **`TWILIO_ACCOUNT_SID`** - Your Twilio Account SID (for WhatsApp notifications)
- **`TWILIO_AUTH_TOKEN`** - Your Twilio Auth Token
- **`TWILIO_FROM`** - Twilio WhatsApp sender number (format: `whatsapp:+1234567890`)
- **`TWILIO_TO`** - Recipient WhatsApp number (format: `whatsapp:+1234567890`)

### Optional Variables

- **`ARDUINO_BASE_URL`** - Base URL for Arduino WiFi AP (defaults to `http://192.168.4.1` if not set)
- **`NEXT_PUBLIC_QR_BASE_URL`** - Base URL for QR code links (defaults to auto-detection if not set)

**Note:** Never commit `.env.local` or any other `.env*` files to version control. They are automatically ignored by `.gitignore`.

