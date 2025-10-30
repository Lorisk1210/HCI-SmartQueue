/**
 * Arduino Discovery Utility
 * Automatically discovers the Arduino's IP address by trying common IP addresses
 */

const DEFAULT_ARDUINO_BASE_URL = 'http://172.20.10.2';

// Common Arduino IP patterns to try (prioritized order)
const COMMON_ARDUINO_IPS = [
  'http://172.20.10.2',   // iPhone hotspot default - PRIMARY
  'http://192.168.4.1',    // ESP32 AP default
  'http://192.168.1.1',    // Common router IP
  'http://192.168.0.1',    // Common router IP
  'http://10.0.0.1',       // Another common pattern
];

// Cache the discovered Arduino URL for 30 seconds
let cachedArduinoUrl: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30000; // 30 seconds

/**
 * Discovers the Arduino's IP address by trying to reach its health endpoint
 * Returns the base URL (e.g., "http://192.168.1.1")
 */
export async function discoverArduino(): Promise<string> {
  // Check environment variable first
  const envUrl = process.env.ARDUINO_BASE_URL;
  if (envUrl) {
    console.log(`[arduino-discovery] Using ARDUINO_BASE_URL from env: ${envUrl}`);
    return envUrl.replace(/\/$/, '');
  }

  // Check cache
  const now = Date.now();
  if (cachedArduinoUrl && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedArduinoUrl;
  }

  // Try primary IP first (faster when it works)
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
  
  // Try remaining IPs in parallel
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

/**
 * Gets the Arduino base URL with optional cache bypass
 */
export async function getArduinoBaseUrl(bypassCache = false): Promise<string> {
  if (bypassCache) {
    cachedArduinoUrl = null;
    cacheTimestamp = 0;
  }
  return await discoverArduino();
}

/**
 * Clears the cached Arduino URL (useful when connection fails)
 */
export function clearArduinoCache(): void {
  cachedArduinoUrl = null;
  cacheTimestamp = 0;
}

