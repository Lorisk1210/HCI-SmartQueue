// =====================================================================
// WEB SERVER & REAL-TIME INTERFACE
// =====================================================================
// Provides HTTP server with an HTML dashboard and Server-Sent Events (SSE)
// for real-time state updates to connected web browsers.

WiFiServer server(WEB_SERVER_PORT);

// ===== Server-Sent Events (SSE) Client Management =====

// Track connected SSE clients
WiFiClient sseClients[MAX_SSE_CLIENTS];
bool sseOccupied[MAX_SSE_CLIENTS] = { false, false, false, false };
unsigned long lastSseKeepAlive = 0;

// Build a JSON state object containing current system state
void buildStateJson(String &out) {
  out = "{";
  out += "\"freeSlots\":" + String(MAX_SLOTS - inCount);
  out += ",\"inCount\":" + String(inCount);
  out += ",\"maxSlots\":" + String(MAX_SLOTS);
  out += ",\"queueCount\":" + String(queueCount);
  out += ",\"status\":\"" + escapeJson(lastStatusMsg) + "\"";
  out += ",\"lastScanEvent\":\"" + escapeJson(lastScanEvent) + "\"";
  out += ",\"lastScannedCard\":\"" + escapeJson(lastScannedCard) + "\"";
  out += ",\"lastScanTime\":" + String(lastScanTimestamp);
  
  // Add queue position if the last scanned card is currently in queue
  int queuePos = getCardQueuePosition(lastScannedCard);
  out += ",\"lastCardQueuePosition\":" + String(queuePos);
  
  // Add current library and queue contents
  out += ",\"in\":[";
  for (uint8_t i = 0; i < inCount; i++) {
    if (i > 0) out += ",";
    out += "\"" + escapeJson(inLibrary[i]) + "\"";
  }
  out += "],\"queue\":[";
  for (uint8_t j = 0; j < queueCount; j++) {
    if (j > 0) out += ",";
    out += "\"" + escapeJson(waitQueue[j]) + "\"";
  }
  out += "]";
  
  out += ",\"t\":" + String(millis());
  out += "}";
}

// Send a single state update event to a specific client
void writeStateEvent(WiFiClient &c) {
  String json;
  buildStateJson(json);
  c.print("data: ");
  c.print(json);
  c.print("\n\n");
}

// Register a new SSE client connection
void addSseClient(WiFiClient &client) {
  for (uint8_t i = 0; i < MAX_SSE_CLIENTS; i++) {
    if (!sseOccupied[i] || !sseClients[i].connected()) {
      sseClients[i] = client;
      sseOccupied[i] = true;
      writeStateEvent(sseClients[i]); // Send initial state on connect
      return;
    }
  }
}

// Broadcast current state to all connected SSE clients
void broadcastState() {
  for (uint8_t i = 0; i < MAX_SSE_CLIENTS; i++) {
    if (sseOccupied[i]) {
      if (!sseClients[i].connected()) {
        sseClients[i].stop();
        sseOccupied[i] = false;
      } else {
        writeStateEvent(sseClients[i]);
      }
    }
  }
}

// Send keep-alive pings to prevent client timeout
void pumpSseKeepAlive() {
  unsigned long now = millis();
  if (now - lastSseKeepAlive < SSE_KEEPALIVE_MS) return;
  lastSseKeepAlive = now;
  
  for (uint8_t i = 0; i < MAX_SSE_CLIENTS; i++) {
    if (sseOccupied[i]) {
      if (!sseClients[i].connected()) {
        sseClients[i].stop();
        sseOccupied[i] = false;
      } else {
        sseClients[i].print(": keep-alive\n\n");
      }
    }
  }
}

// ===== HTTP Request Handlers =====

// Generate and send the main HTML dashboard page
void sendQueuePage(WiFiClient &client) {
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: text/html; charset=utf-8");
  client.println("Connection: close");
  client.println();
  client.println("<!DOCTYPE html><html lang=\"en\"><head>");
  client.println("<meta charset=\"utf-8\">");
  client.println("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">");
  client.println("<title>SmartQueue</title>");
  client.println("<style>body{font-family:Arial,sans-serif;margin:1.5rem;background:#f4f4f4;color:#333}\n"
                 "h1{margin-bottom:0.5rem}section{margin:1rem 0}table{width:100%;border-collapse:collapse}\n"
                 "th,td{padding:0.5rem;border-bottom:1px solid #ccc;text-align:left}\n"
                 "tfoot{font-size:0.9rem;color:#555}code{font-size:1rem}.muted{color:#555;font-size:0.95rem}</style>");
  client.println("</head><body>");
  client.println("<h1>SmartQueue</h1>");
  client.println("<p>Access Point: <code>" + String(apSsid) + "</code> | Device IP: <code>" + ipToString(WiFi.localIP()) + "</code></p>");
  
  client.println("<p id=\"status\" class=\"muted\">Idle</p>");
  
  client.println("<section>");
  client.println("<h2>In the library currently (<span id=\"counts\">0/" + String(MAX_SLOTS) + "</span>)</h2>");
  client.println("<table><thead><tr><th>#</th><th>Card UID (HEX)</th></tr></thead><tbody id=\"in\"><tr><td colspan=\"2\">Loading...</td></tr></tbody></table>");
  client.println("</section>");
  
  client.println("<section>");
  client.println("<h2>Waiting queue (<span id=\"qcount\">0</span>)</h2>");
  client.println("<table><thead><tr><th>Pos</th><th>Card UID (HEX)</th></tr></thead><tbody id=\"queue\"><tr><td colspan=\"2\">Loading...</td></tr></tbody></table>");
  client.println("</section>");
  
  client.println("<script>\n"
                 "function render(s){\n"
                 "  document.getElementById('counts').textContent=s.inCount+'/'+s.maxSlots;\n"
                 "  document.getElementById('qcount').textContent=s.queueCount;\n"
                 "  document.getElementById('status').textContent=s.status||'Idle';\n"
                 "  var inRows='';\n"
                 "  for(var i=0;i<s.in.length;i++){inRows+=('<tr><td>'+(i+1)+'</td><td><code>'+s.in[i]+'</code></td></tr>');}\n"
                 "  if(!inRows) inRows='<tr><td colspan=\"2\">None.</td></tr>';\n"
                 "  document.getElementById('in').innerHTML=inRows;\n"
                 "  var qRows='';\n"
                 "  for(var j=0;j<s.queue.length;j++){qRows+=('<tr><td>'+(j+1)+'</td><td><code>'+s.queue[j]+'</code></td></tr>');}\n"
                 "  if(!qRows) qRows='<tr><td colspan=\"2\">Empty.</td></tr>';\n"
                 "  document.getElementById('queue').innerHTML=qRows;\n"
                 "}\n"
                 "var es=new EventSource('/events');\n"
                 "es.onmessage=function(e){try{var s=JSON.parse(e.data);render(s);}catch(err){}};\n"
                 "</script>");
  
  client.println("</body></html>");
}

// Set up SSE connection headers for real-time streaming
void beginSse(WiFiClient &client) {
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: text/event-stream");
  client.println("Cache-Control: no-cache");
  client.println("Connection: keep-alive");
  client.println();
  addSseClient(client); // Register this client for updates
}

// Handle an incoming HTTP client connection
void handleClient(WiFiClient &client) {
  unsigned long timeout = millis() + 2000;
  String currentLine;
  String requestLine;
  bool gotRequestLine = false;
  bool wantsSse = false;
  bool wantsApi = false;
  String apiPath;
  String apiQuery;
  
  // Read HTTP request line-by-line
  while (client.connected() && millis() < timeout) {
    if (client.available()) {
      char c = client.read();
      if (c == '\n') {
        // Capture the request line (first line of HTTP request)
        if (!gotRequestLine) {
          gotRequestLine = true;
          requestLine = currentLine;
          if (requestLine.startsWith("GET /events")) {
            wantsSse = true;
          } else if (requestLine.startsWith("GET /api/")) {
            wantsApi = true;
            // Parse path and query
            int sp1 = requestLine.indexOf(' ');
            int sp2 = requestLine.indexOf(' ', sp1 + 1);
            String url = requestLine.substring(sp1 + 1, sp2);
            int qpos = url.indexOf('?');
            if (qpos >= 0) {
              apiPath = url.substring(0, qpos);
              apiQuery = url.substring(qpos + 1);
            } else {
              apiPath = url;
              apiQuery = "";
            }
          }
        }
        
        // Empty line signals end of HTTP headers
        if (currentLine.length() == 0) {
          if (wantsSse) {
            beginSse(client);
            return; // Keep SSE connection open
          } else if (wantsApi) {
            // Handle minimal API endpoints
            if (apiPath.startsWith("/api/queue/leave")) {
              // Extract uid parameter
              String uid;
              int pos = apiQuery.indexOf("uid=");
              if (pos >= 0) {
                String rest = apiQuery.substring(pos + 4);
                int amp = rest.indexOf('&');
                uid = (amp >= 0) ? rest.substring(0, amp) : rest;
              }
              // URL decode minimal (%3A for ':')
              uid.replace("%3A", ":");
              uid.replace("%3a", ":");

              bool ok = false;
              if (uid.length() > 0) {
                extern int indexOfWaitQueue(const String &id);
                extern bool removeFromWaitByIndex(uint8_t idx);
                int qIdx = indexOfWaitQueue(uid);
                if (qIdx >= 0) {
                  ok = removeFromWaitByIndex((uint8_t)qIdx);
                  if (ok) {
                    setStatus("Removed from queue via API: " + uid);
                    broadcastState();
                  }
                }
              }

              // Respond JSON
              client.println("HTTP/1.1 200 OK");
              client.println("Content-Type: application/json");
              client.println("Connection: close");
              client.println();
              client.print("{\"ok\":");
              client.print(ok ? "true" : "false");
              client.print(",\"uid\":\"");
              client.print(uid);
              client.println("\"}");
              break;
            } else {
              // Unknown API path
              client.println("HTTP/1.1 404 Not Found");
              client.println("Content-Type: text/plain");
              client.println("Connection: close");
              client.println();
              client.println("Not Found");
              break;
            }
          } else {
            sendQueuePage(client);
            break;
          }
        }
        currentLine = "";
      } else if (c != '\r') {
        currentLine += c;
      }
    }
  }
  
  delay(1);
  client.stop(); // Close non-SSE connections
}
