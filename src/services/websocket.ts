import * as SecureStore from 'expo-secure-store';
import { getIsOnline, onConnectivityChange } from '../hooks/useConnectivity';

const WS_BASE_URL = 'ws://192.168.1.5:8080/ws';
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

type MessageHandler = (data: string) => void;

class WebSocketService {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private disposed = false;
  private intentionalDisconnect = false;
  private wantsConnection = false;
  private offset = '';
  private unsubConnectivity: (() => void) | null = null;
  private messageHandlers = new Set<MessageHandler>();

  constructor() {
    this.unsubConnectivity = onConnectivityChange((online) => {
      this.onConnectivityChanged(online);
    });
  }

  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  onMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  updateOffset(offset: string) {
    this.offset = offset;
    console.log('[WebSocketService] Offset updated to:', this.offset);
    // Persist so the correct replay position survives app restarts
    SecureStore.setItemAsync('ws_offset', offset).catch(() => {});
  }

  async connect() {
    if (this.disposed) return;

    this.wantsConnection = true;

    if (!getIsOnline()) {
      console.log('[WebSocketService] Offline — deferring connection until online');
      return;
    }

    const [token, savedOffset] = await Promise.all([
      SecureStore.getItemAsync('token'),
      SecureStore.getItemAsync('ws_offset'),
    ]);

    if (!token) {
      console.log('[WebSocketService] No token available, skipping connect');
      return;
    }

    // Restore the last known offset so we don't replay already-seen messages
    if (savedOffset && !this.offset) {
      this.offset = savedOffset;
      console.log('[WebSocketService] Restored offset from storage:', this.offset);
    }

    this.intentionalDisconnect = false;
    this.doConnect(token);
  }

  private doConnect(token: string) {
    if (this.disposed) return;

    this.closeSocket();

    try {
      const url = `${WS_BASE_URL}?token=${encodeURIComponent(token)}&offset=${encodeURIComponent(this.offset)}`;
      console.log('[WebSocketService] Connecting...');

      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        this.reconnectAttempts = 0;
        console.log('[WebSocketService] Connected');
      };

      this.socket.onmessage = (event) => {
        const data = typeof event.data === 'string' ? event.data : '';
        console.log('[WebSocketService] Received:', data);
        this.messageHandlers.forEach((h) => h(data));
      };

      this.socket.onerror = (event) => {
        console.log('[WebSocketService] Error:', event);
        this.scheduleReconnect(token);
      };

      this.socket.onclose = (event) => {
        console.log(`[WebSocketService] Closed (code: ${event.code}, reason: ${event.reason})`);
        this.scheduleReconnect(token);
      };
    } catch (e) {
      console.log('[WebSocketService] Connection failed:', e);
      this.scheduleReconnect(token);
    }
  }

  private scheduleReconnect(token: string) {
    if (this.disposed || this.intentionalDisconnect) return;

    this.socket = null;

    if (!getIsOnline()) {
      console.log('[WebSocketService] Offline — stopping reconnect attempts');
      return;
    }

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[WebSocketService] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = RECONNECT_DELAY_MS * this.reconnectAttempts;
    console.log(
      `[WebSocketService] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
    );

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.doConnect(token), delay);
  }

  send(message: string | object) {
    if (!this.isConnected) {
      console.log('[WebSocketService] Cannot send, not connected');
      return;
    }
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    this.socket!.send(data);
  }

  disconnect() {
    this.intentionalDisconnect = true;
    this.wantsConnection = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.closeSocket();
    console.log('[WebSocketService] Disconnected');
  }

  private closeSocket() {
    if (this.socket) {
      try {
        this.socket.close(1000, 'client disconnect');
      } catch (_) {}
      this.socket = null;
    }
  }

  private onConnectivityChanged(isOnline: boolean) {
    if (this.disposed || this.intentionalDisconnect) return;

    if (!isOnline) {
      console.log('[WebSocketService] Went offline — pausing connection');
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.closeSocket();
      return;
    }

    if (this.wantsConnection && !this.isConnected) {
      console.log('[WebSocketService] Back online — reconnecting');
      this.reconnectAttempts = 0;
      this.connect();
    }
  }

  dispose() {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.unsubConnectivity?.();
    this.closeSocket();
  }
}

// Singleton instance
export const wsService = new WebSocketService();
