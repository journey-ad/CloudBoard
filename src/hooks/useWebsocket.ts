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
    console.log('[socket] connect() called with url:', url);

    // 如果已经有socket且已连接，但URL不匹配，需要重新创建
    if (socketRef.current && socketRef.current.connected) {
      // 检查URL是否匹配，如果不匹配则需要重新创建
      const currentUrl = (socketRef.current as any).io?.uri;
      if (currentUrl !== url) {
        console.log('[socket] URL changed, recreating socket. Old:', currentUrl, 'New:', url);
        cleanup();
      } else {
        console.log('[socket] already connected with correct URL, skipping');
        return;
      }
    }

    // 如果有socket但未连接，检查URL是否匹配
    if (socketRef.current && !socketRef.current.connected) {
      const currentUrl = (socketRef.current as any).io?.uri;
      if (currentUrl !== url) {
        console.log('[socket] URL changed, recreating socket. Old:', currentUrl, 'New:', url);
        cleanup();
      } else {
        console.log('[socket] existing socket found, trying to connect');
        setState(prev => ({ ...prev, isConnecting: true }));
        socketRef.current.connect();
        return;
      }
    }

    // 创建新的socket
    console.log('[socket] creating new socket');
    setState(prev => ({ ...prev, isConnecting: true }));

    const socket = io(url, {
      transports: ['websocket'],
      reconnectionDelay,
      reconnectionDelayMax,
      autoConnect: false,
    });

    console.log('[socket] socket instance created, adding event listeners');

    socket.on('connect', () => {
      console.log('[socket] connected');
      setState({
        isConnecting: false,
        isConnected: true,
        error: null,
      });
    });

    socket.on('disconnect', (reason) => {
      console.log('[socket] disconnect', reason);
      setState(prev => ({
        ...prev,
        isConnected: false,
        isConnecting: false,
      }));
      // 不要在disconnect时cleanup，这样可以保持socket对象用于重连
      // cleanup();
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
      setState(prev => ({ ...prev, isConnecting: true }));
    });

    socket.io.on('reconnect', (attempt: number) => {
      console.log('reconnect', attempt);
      setState({
        isConnecting: false,
        isConnected: true,
        error: null,
      });
    });

    console.log('[socket] calling socket.connect()');
    socket.connect();
    socketRef.current = socket;
    console.log('[socket] socket assigned to ref');
  }, [url, reconnectionDelay, reconnectionDelayMax, cleanup]);

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
