import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

interface WebSocketConfig {
  url?: string;
  shouldConnect?: boolean;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
}

interface WebSocketState {
  isConnecting: boolean;
  isConnected: boolean;
  error: Error | null;
}

interface WebSocketReturn extends WebSocketState {
  socket: Socket | null;
  socketRef: React.MutableRefObject<Socket | null>;
  emit: <T>(event: string, data: T) => void;
  on: <T>(event: string, callback: (data: T) => void) => void;
  off: <T>(event: string, callback: (data: T) => void) => void;
  connect: () => void;
  disconnect: () => void;
}

const DEFAULT_RECONNECTION_DELAY = 3000; // default delay 3 seconds
const DEFAULT_RECONNECTION_DELAY_MAX = 120000; // max delay 2 minutes

export const useWebsocket = (
  config: WebSocketConfig,
  shouldConnect = !!config.url
): WebSocketReturn => {
  const { url, reconnectionDelay = DEFAULT_RECONNECTION_DELAY, reconnectionDelayMax = DEFAULT_RECONNECTION_DELAY_MAX } = config;
  const socketRef = useRef<Socket | null>(null);

  const [state, setState] = useState<WebSocketState>({
    isConnecting: false,
    isConnected: false,
    error: null,
  });

  const cleanup = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
    }
  }, []);

  const connect = useCallback(() => {
    cleanup();
    setState(prev => ({ ...prev, isConnecting: true }));

    const socket = io(url, {
      transports: ['websocket'],
      reconnectionDelay,
      reconnectionDelayMax,
      autoConnect: false,
    });

    socket.on('connect', () => {
      console.log('[socket] connected');
      setState({
        isConnecting: false,
        isConnected: true,
        error: null,
      });
    });

    socket.on('disconnect', () => {
      console.log('[socket] disconnect');
      setState(prev => ({
        ...prev,
        isConnected: false,
        isConnecting: false,
      }));
      cleanup();
    });

    socket.on('connect_error', (error: Error) => {
      console.log('[socket] connect_error', error);
      setState({
        isConnecting: false,
        isConnected: false,
        error,
      });
    });

    socket.io.on('reconnect_attempt', (attempt: number) => {
      console.log('reconnect_attempt', attempt);
    });

    socket.io.on('reconnect', (attempt: number) => {
      console.log('reconnect', attempt);
    });
    
    

    socketRef.current = socket;
  }, [url, reconnectionDelay, cleanup]);

  useEffect(() => {
    if (shouldConnect) {
      connect();
    }
    return cleanup;
  }, [shouldConnect, connect, cleanup]);

  const emit = useCallback(<T,>(event: string, data: T) => {
    socketRef.current?.emit(event, data);
  }, []);

  const on = useCallback(<T,>(event: string, callback: (data: T) => void) => {
    socketRef.current?.on(event, callback);
  }, []);

  const off = useCallback(<T,>(event: string, callback: (data: T) => void) => {
    socketRef.current?.off(event, callback);
  }, []);

  return {
    ...state,
    socket: socketRef.current,
    socketRef,
    emit,
    on,
    off,
    connect,
    disconnect: cleanup,
  };
};
