// =====================================================================
// Arduino Discovery Utility - IP Address Detection
// =====================================================================
// Automatically discovers the Arduino's IP address by trying common IP addresses
// on the local network. This is necessary because the Arduino's IP may change
// when connecting to different WiFi networks (e.g., phone hotspot vs. campus WiFi).
// Uses a caching mechanism to avoid repeated discovery attempts.

const DEFAULT_ARDUINO_BASE_URL = 'http://172.20.10.2';

// =====================================================================
// Hotspot Candidate Generation
// =====================================================================
// iPhone hotspots assign addresses in the 172.20.10.x range sequentially to
// connected devices. When the frontend moves off the Raspberry Pi, the Arduino
// may no longer receive the .2 address. Generate a list of likely candidates so
// discovery remains reliable regardless of join order.
const HOTSPOT_RANGE = Array.from({ length: 13 }, (_, idx) => `http://172.20.10.${idx + 2}`); // 172.20.10.2 - 172.20.10.14

// =====================================================================
// Common Arduino IP Patterns
// =====================================================================
// List of common IP addresses to try when discovering the Arduino. Tried in
// priority order, with iPhone hotspot range first (most common use case).
const COMMON_ARDUINO_IPS = [
  ...HOTSPOT_RANGE,
  'http://192.168.4.1',    // ESP32 AP default
  'http://192.168.1.1',    // Common router IP
  'http://192.168.0.1',    // Common router IP
  'http://10.0.0.1',       // Another common pattern
];

// =====================================================================
// Discovery Cache
// =====================================================================
// Cache the discovered Arduino URL for 30 seconds to avoid repeated network
// requests when multiple components need the Arduino's address.
let cachedArduinoUrl: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30000; // 30 seconds

// =====================================================================
// Arduino Discovery Function
// =====================================================================
// Discovers the Arduino's IP address by trying to reach its health endpoint
// at each common IP address. Returns the base URL (e.g., "http://192.168.1.1").
// Checks environment variable first, then cache, then tries network discovery.
export async function discoverArduino(): Promise<string> {
  // =====================================================================
  // Environment Variable Check
  // =====================================================================
  // If ARDUINO_BASE_URL is set in environment variables, use it directly.
  // This is useful for production deployments where the IP is known.
  const envUrl = process.env.ARDUINO_BASE_URL;
  if (envUrl) {
    console.log(`[arduino-discovery] Using ARDUINO_BASE_URL from env: ${envUrl}`);
    return envUrl.replace(/\/$/, '');
  }

  // =====================================================================
  // Cache Check
  // =====================================================================
  // Return cached value if it's still fresh (within 30 seconds)
  const now = Date.now();
  if (cachedArduinoUrl && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedArduinoUrl;
  }

  // =====================================================================
  // Primary IP Quick Check
  // =====================================================================
  // Try the primary IP first (iPhone hotspot default). If this works, we can
  // skip trying all the other addresses, making discovery much faster.
  try {
    const primaryUrl = COMMON_ARDUINO_IPS[0]; // 172.20.10.2
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    
    const response = await fetch(`${primaryUrl}/api/health`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        console.log(`[arduino-discovery] Found Arduino at ${primaryUrl} (primary)`);
        cachedArduinoUrl = primaryUrl;
        cacheTimestamp = Date.now();
        return primaryUrl;
      }
    }
  } catch (err) {
    // Primary IP failed, try others
    console.log(`[arduino-discovery] Primary IP failed, trying alternates...`);
  }
  
  // =====================================================================
  // Parallel Discovery of Alternate IPs
  // =====================================================================
  // Try all remaining IP addresses in parallel to speed up discovery.
  // Each attempt has a 2-second timeout to avoid hanging on unreachable addresses.
  const discoveryPromises = COMMON_ARDUINO_IPS.slice(1).map(async (baseUrl) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      const response = await fetch(`${baseUrl}/api/health`, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          console.log(`[arduino-discovery] Found Arduino at ${baseUrl} (alternate)`);
          return baseUrl;
        }
      }
      return null;
    } catch (err) {
      return null;
    }
  });

  const results = await Promise.allSettled(discoveryPromises);
  
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      cachedArduinoUrl = result.value;
      cacheTimestamp = Date.now();
      return result.value;
    }
  }
  
  console.log(`[arduino-discovery] Arduino not found, using default: ${DEFAULT_ARDUINO_BASE_URL}`);
  // Cache the default URL too
  cachedArduinoUrl = DEFAULT_ARDUINO_BASE_URL;
  cacheTimestamp = Date.now();
  return DEFAULT_ARDUINO_BASE_URL;
}

// =====================================================================
// Get Arduino Base URL (with Cache Control)
// =====================================================================
// Gets the Arduino base URL with optional cache bypass. Useful when the
// Arduino's IP might have changed and we need to force a fresh discovery.
export async function getArduinoBaseUrl(bypassCache = false): Promise<string> {
  if (bypassCache) {
    cachedArduinoUrl = null;
    cacheTimestamp = 0;
  }
  return await discoverArduino();
}

// =====================================================================
// Clear Arduino Cache
// =====================================================================
// Clears the cached Arduino URL. Useful when connection fails and we suspect
// the IP address might have changed.
export function clearArduinoCache(): void {
  cachedArduinoUrl = null;
  cacheTimestamp = 0;
}

