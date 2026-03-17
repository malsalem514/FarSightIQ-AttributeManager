/**
 * WebSocket Hook
 * 
 * Real-time sync status updates
 * Reference: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface SyncEvent {
  type: 'connected' | 'sync_start' | 'sync_progress' | 'sync_complete' | 'sync_error' | 'extraction_start' | 'extraction_complete';
  styleId?: string;
  colorId?: string;
  total?: number;
  completed?: number;
  succeeded?: number;
  failed?: number;
  message?: string;
  timestamp: string;
}

interface UseWebSocketOptions {
  url: string;
  onEvent?: (event: SyncEvent) => void;
  reconnectInterval?: number;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  lastEvent: SyncEvent | null;
  events: SyncEvent[];
}

export function useWebSocket({ url, onEvent, reconnectInterval = 5000 }: UseWebSocketOptions): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<SyncEvent | null>(null);
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        setIsConnected(true);
        console.log('[WS] Connected');
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log('[WS] Disconnected, reconnecting...');
        reconnectTimeoutRef.current = window.setTimeout(connect, reconnectInterval);
      };

      ws.onerror = (error) => {
        console.error('[WS] Error:', error);
      };

      ws.onmessage = (event) => {
        try {
          const data: SyncEvent = JSON.parse(event.data);
          setLastEvent(data);
          setEvents((prev) => [...prev.slice(-49), data]); // Keep last 50
          onEvent?.(data);
        } catch (e) {
          console.error('[WS] Parse error:', e);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('[WS] Connection error:', error);
      reconnectTimeoutRef.current = window.setTimeout(connect, reconnectInterval);
    }
  }, [url, onEvent, reconnectInterval]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return { isConnected, lastEvent, events };
}

export default useWebSocket;


