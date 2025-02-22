import { version } from '../../package.json';

export const VERSION = version.replace(/\.0+$/, '');

/**
 * @description API相关常量
 */
export const API_CONSTANTS = {
  DEFAULT_URL: 'https://clip.ovo.re/api/v1',
} as const;

/**
 * @description 密码相关常量
 */
export const PASSWORD_CONSTANTS = {
  MIN_LENGTH: 6,
  MAX_LENGTH: 32
} as const;

/**
 * @description 状态配置映射
 */
export const SOCKET_STATE = {
  CONNECTING: 0,
  CONNECTED: 1,
  ERROR: 2,
  DISCONNECTED: 3,
  PAUSED: 4
} as const;

export const SOCKET_CONFIG = {
  [SOCKET_STATE.CONNECTING]: { text: 'Connecting', color: 'yellow' },
  [SOCKET_STATE.CONNECTED]: { text: 'Connected', color: 'green' },
  [SOCKET_STATE.ERROR]: { text: 'Connection Error', color: 'red' },
  [SOCKET_STATE.DISCONNECTED]: { text: 'Disconnected', color: 'dimmed' },
  [SOCKET_STATE.PAUSED]: { text: 'Sync Paused', color: 'dimmed' }
} as const;

export * from './notification';
