/**
 * @description 剪贴板数据来源类型
 */
type ClipboardSource = 'local' | 'remote';

/**
 * @description 剪贴板数据类型
 */
export type ClipboardData = {
  type: ClipboardDataType;
  content: string;
  source: ClipboardSource;
  plaintext?: string;
}

/**
 * @description 剪贴板内容类型
 */
export type ClipboardDataType = 'text' | 'image' | 'html' | 'rtf' | 'files';

export interface ApiKeyResponse {
  key: string;
}

export interface ConfigResponse {
  max_cache_items: number;
  max_cache_size: number;
  clipboard_size: number;
  clipboard_ttl: number;
}

export interface SyncResponse {
  success: boolean;
  message?: string;
}

// 定义 WebSocket 状态枚举
export enum SocketState {
  CONNECTING,
  CONNECTED,
  ERROR,
  DISCONNECTED
}

/**
 * @description 托盘事件对象内容
 */
export interface TrayEvent {
  message: string;
  data?: string;
}
