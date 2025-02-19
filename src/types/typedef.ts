/**
 * @description 剪贴板数据来源类型
 */
type ClipboardSource = 'local' | 'remote';

/**
 * @description 剪贴板数据类型
 */
type ClipboardData = {
  type: ClipboardDataType;
  content: string;
  source: ClipboardSource;
  plaintext?: string;
}

/**
 * @description 剪贴板内容类型
 */
type ClipboardDataType = 'text' | 'image' | 'html' | 'rtf' | 'files';

interface ApiKeyResponse {
  key: string;
}

interface ConfigResponse {
  max_cache_items: number;
  max_cache_size: number;
  clipboard_size: number;
  clipboard_ttl: number;
}

interface SyncResponse {
  success: boolean;
  message?: string;
}

// 定义 WebSocket 状态枚举
enum SocketState {
  CONNECTING,
  CONNECTED,
  ERROR,
  DISCONNECTED
}
