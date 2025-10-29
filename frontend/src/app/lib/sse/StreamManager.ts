export type ArduinoState = {
  freeSlots: number;
  inCount: number;
  maxSlots: number;
  queueCount: number;
  status: string;
  lastScanEvent: string;
  lastScannedCard: string;
  lastScanTime: number;
  lastCardQueuePosition: number; // -1 if not queued
  in: string[];
  queue: string[];
  t: number;
};

export type QueueUpdate = {
  length: number;
  nextTicket: string | null;
  freeSlots: number;
  inCount: number;
  maxSlots: number;
};

export type RfidScan = {
  uid: string;
  status: 'accepted' | 'rejected';
  reason?:
    | 'entered'
    | 'entered_from_queue'
    | 'queued'
    | 'already_queued'
    | 'left'
    | 'queue_full';
  queuePosition?: number; // 1-based when queued
};

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'offline'
  | 'error'
  | 'ended';

type EventHandler<T> = (payload: T) => void;

type Handlers = {
  'queue:update': Set<EventHandler<QueueUpdate>>;
  'rfid:scan': Set<EventHandler<RfidScan>>;
  'system:heartbeat': Set<EventHandler<{ intervalMs: number }>>;
  'system:error': Set<EventHandler<{ code: string; message: string }>>;
  'state:update': Set<EventHandler<ArduinoState>>;
};

const CHANNEL_NAME = 'sse-events';
const LEADER_KEY = 'smartqueue-sse-leader';
const LEADER_TTL_MS = 5000;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 20000;
const HEARTBEAT_STALE_MS = 60000; // 60s without any message => stale

export interface StreamManagerOptions {
  eventSourceFactory?: (url: string) => EventSource;
}

export class StreamManager {
  private eventSource: EventSource | null = null;
  private readonly handlers: Handlers = {
    'queue:update': new Set(),
    'rfid:scan': new Set(),
    'system:heartbeat': new Set(),
    'system:error': new Set(),
    'state:update': new Set(),
  };
  private lastArduinoState: ArduinoState | null = null;
  private lastScanTimeSeen: number = -1;
  private lastHeartbeatAt = 0;
  private reconnectAttempts = 0;
  private channel: BroadcastChannel | null = null;
  private leaderRenewTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private connectionState: ConnectionState = 'idle';
  private readonly createEventSource: (url: string) => EventSource;

  constructor(opts?: StreamManagerOptions) {
    this.createEventSource = opts?.eventSourceFactory || ((url) => new EventSource(url, { withCredentials: false }));
  }

  on<T extends keyof Handlers>(type: T, handler: EventHandler<Parameters<Handlers[T]['add']>[0] extends infer P ? P extends EventHandler<infer U> ? U : never : never>) {
    // @ts-expect-error - generic mapping above ensures types line up
    this.handlers[type].add(handler);
    return () => {
      // @ts-expect-error - remove symmetric to add
      this.handlers[type].delete(handler);
    };
  }

  getState() {
    return {
      connection: this.connectionState,
      lastArduinoState: this.lastArduinoState,
      lastScanTimeSeen: this.lastScanTimeSeen,
    };
  }

  connect() {
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.addEventListener('message', (evt: MessageEvent) => {
      const data = evt.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'arduino:state') {
        this.consumeArduinoState(data.payload as ArduinoState, /*fromLeader*/ true);
      } else if (data.type === 'system:state') {
        this.updateConnectionState(data.payload as ConnectionState);
      }
    });

    window.addEventListener('online', () => this.forceReconnect('online'));
    window.addEventListener('offline', () => this.updateConnectionState('offline'));

    this.tryBecomeLeader();
  }

  disconnect() {
    this.stopLeaderDuties();
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.updateConnectionState('ended');
  }

  private tryBecomeLeader() {
    const now = Date.now();
    const raw = localStorage.getItem(LEADER_KEY);
    let currentOwnerTs = raw ? parseInt(raw, 10) : 0;
    if (!currentOwnerTs || now - currentOwnerTs > LEADER_TTL_MS) {
      // Acquire
      localStorage.setItem(LEADER_KEY, String(now));
      // Re-read to confirm we still own (avoid races)
      const reread = localStorage.getItem(LEADER_KEY);
      if (reread && parseInt(reread, 10) === now) {
        this.startLeaderDuties();
        return;
      }
    }
    // Follower: listen and periodically retry to acquire if owner stale
    this.updateConnectionState(navigator.onLine ? 'idle' : 'offline');
    window.setTimeout(() => this.tryBecomeLeader(), 1000);
  }

  private startLeaderDuties() {
    this.leaderRenewTimer = window.setInterval(() => {
      localStorage.setItem(LEADER_KEY, String(Date.now()));
    }, Math.floor(LEADER_TTL_MS / 2));
    this.openEventSource();
  }

  private stopLeaderDuties() {
    if (this.leaderRenewTimer) {
      clearInterval(this.leaderRenewTimer);
      this.leaderRenewTimer = null;
    }
    this.closeEventSource();
    localStorage.removeItem(LEADER_KEY);
  }

  private openEventSource() {
    if (!navigator.onLine) {
      this.updateConnectionState('offline');
      return;
    }
    this.updateConnectionState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
    try {
      const es = this.createEventSource('/api/stream');
      this.eventSource = es;

      es.onopen = () => {
        this.reconnectAttempts = 0;
        this.updateConnectionState('open');
        this.bumpHeartbeat();
        this.scheduleHeartbeatWatch();
      };

      es.onmessage = (ev: MessageEvent) => {
        this.bumpHeartbeat();
        try {
          const state = JSON.parse(ev.data) as ArduinoState;
          this.consumeArduinoState(state, /*fromLeader*/ false);
          this.broadcast('arduino:state', state);
        } catch (err) {
          // Malformed JSON; skip only this event
          // Optionally, we could count failures and surface a protocol error
        }
      };

      es.onerror = () => {
        this.updateConnectionState('error');
        this.scheduleReconnect();
      };
    } catch (err) {
      this.updateConnectionState('error');
      this.scheduleReconnect();
    }
  }

  private closeEventSource() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(reason?: string) {
    if (this.reconnectTimer) return;
    const base = RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts);
    const jitter = Math.random() * 250;
    const delay = Math.min(RECONNECT_MAX_MS, base + jitter);
    this.reconnectAttempts++;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.closeEventSource();
      this.openEventSource();
      this.broadcast('system:state', this.connectionState);
    }, delay);
  }

  private forceReconnect(src: 'online' | 'manual') {
    this.closeEventSource();
    this.reconnectAttempts = 0;
    this.openEventSource();
  }

  private scheduleHeartbeatWatch() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = window.setInterval(() => {
      const since = Date.now() - this.lastHeartbeatAt;
      if (since > HEARTBEAT_STALE_MS) {
        this.scheduleReconnect('heartbeat-missed');
      } else {
        const interval = Math.min(60000, since);
        this.emit('system:heartbeat', { intervalMs: interval });
      }
    }, 10000);
  }

  private bumpHeartbeat() {
    this.lastHeartbeatAt = Date.now();
  }

  private broadcast(type: string, payload: unknown) {
    if (!this.channel) return;
    try { this.channel.postMessage({ type, payload }); } catch (_) {}
  }

  private updateConnectionState(state: ConnectionState) {
    this.connectionState = state;
    this.broadcast('system:state', state);
  }

  private emit<T extends keyof Handlers>(type: T, payload: Parameters<Handlers[T]['add']>[0] extends infer P ? P extends EventHandler<infer U> ? U : never : never) {
    // @ts-expect-error - generic mapping above ensures types line up
    for (const h of this.handlers[type]) h(payload);
  }

  private consumeArduinoState(s: ArduinoState, fromLeader: boolean) {
    this.lastArduinoState = s;
    // Derive queue:update
    const qUpdate: QueueUpdate = {
      length: s.queueCount,
      nextTicket: s.queue && s.queue.length > 0 ? s.queue[0] : null,
      freeSlots: s.freeSlots,
      inCount: s.inCount,
      maxSlots: s.maxSlots,
    };
    this.emit('queue:update', qUpdate);

    // Emit full state for consumers that need per-UID info
    this.emit('state:update', s);

    // Derive rfid:scan only when new scan observed
    if (s.lastScanTime && s.lastScanTime !== this.lastScanTimeSeen) {
      this.lastScanTimeSeen = s.lastScanTime;
      const scan: RfidScan = {
        uid: s.lastScannedCard,
        status: this.mapScanStatusToAccepted(s.lastScanEvent) ? 'accepted' : 'rejected',
        reason: this.mapScanReason(s.lastScanEvent),
        queuePosition: s.lastCardQueuePosition > 0 ? s.lastCardQueuePosition : undefined,
      };
      this.emit('rfid:scan', scan);
    }
  }

  private mapScanStatusToAccepted(evt: string): boolean {
    return evt === 'entered' || evt === 'entered_from_queue' || evt === 'left';
  }

  private mapScanReason(evt: string): RfidScan['reason'] {
    switch (evt) {
      case 'entered': return 'entered';
      case 'entered_from_queue': return 'entered_from_queue';
      case 'queued': return 'queued';
      case 'already_queued': return 'already_queued';
      case 'left': return 'left';
      case 'denied': return 'queue_full';
      default: return undefined;
    }
  }
}


