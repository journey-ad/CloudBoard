// component example
import { Anchor, Button, Center, Checkbox, Grid, Group, Loader, PasswordInput, Popover, Stack, Switch, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { TbFingerprint } from 'react-icons/tb';
import { Trans, useTranslation } from 'react-i18next';
import { notify, join, decryptContent, encryptContent, writeToClipboard, readClipboardData, formatBytes, notification, formatSeconds, calculateContentSize } from '../common/utils';
import { createStorage } from '../tauri/storage';
import { APP_NAME, RUNNING_IN_TAURI, useMinWidth, useTauriContext } from '../tauri/TauriProvider';
import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import * as Autostart from '@tauri-apps/plugin-autostart';
import clipboard from "tauri-plugin-clipboard-api";
import { VERSION, API_CONSTANTS, NOTIFICATION, PASSWORD_CONSTANTS, SOCKET_STATE, SOCKET_CONFIG } from '../constants';
import { useFetchSWR, useFetchSWRMutation, useWebsocket } from '../hooks';
import { debounce } from 'lodash-es';
import { invoke } from '@tauri-apps/api/core';
import * as tauriEvent from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

export default function MainView() {
  const { t, i18n } = useTranslation();
  const { fileSep, home, loading: tauriLoading } = useTauriContext();

  // 存储相关初始化
  const storeName = RUNNING_IN_TAURI ? join(fileSep, home!, '.cloudboard') : 'config';
  const { use: useKVP, loading, data } = createStorage(home ? storeName : null);

  const [apiBaseUrlConfig, setApiBaseUrlConfig] = useKVP('apiBaseUrl', API_CONSTANTS.DEFAULT_URL);
  const [apiKeyConfig, setApiKeyConfig] = useKVP('apiKey', '');

  const apiBaseUrlRef = useRef(apiBaseUrlConfig);
  const apiKeyRef = useRef(apiKeyConfig);

  const [connectionState, setConnectionState] = useState<typeof SOCKET_STATE[keyof typeof SOCKET_STATE]>(SOCKET_STATE.DISCONNECTED);

  // 临时URL状态（仅用于输入框）
  const [apiBaseUrlInputValue, setApiBaseUrlInputValue] = useState(apiBaseUrlConfig);

  const changeApiBaseUrl = useCallback(async (url: string) => {
    try {
      const REGEX = /^https?:\/\/.*$/;
      const parsedUrl = new URL(url);

      if (!REGEX.test(parsedUrl.toString())) {
        throw new Error('Invalid API Endpoint');
      }

      const newUrl = parsedUrl.toString();

      // 未修改时跳过
      if (apiBaseUrlRef.current === newUrl) return;

      // 更新状态值
      apiBaseUrlRef.current = newUrl;
      // 写入配置文件
      setApiBaseUrlConfig(newUrl);
      // 获取api配置
      getConfig({ notify: true });

    } catch (error) {
      console.error('[MainView] changeApiBaseUrl error:', error);

      notification.error(NOTIFICATION.INVALID_API_ENDPOINT);
    }
  }, [setApiBaseUrlConfig, apiBaseUrlRef]);
  // apiBaseUrlRef变更后处理
  useEffect(() => {
    if (apiBaseUrlRef.current !== apiBaseUrlInputValue) {
      setApiBaseUrlInputValue(apiBaseUrlRef.current); // 同步到输入框
    }
  }, [apiBaseUrlRef.current]);
  // 初始化
  useEffect(() => {
    if (loading) return;
    console.log('[MainView] initialize apiBaseUrl:', apiBaseUrlRef.current);

    if (apiBaseUrlRef.current !== apiBaseUrlConfig) {
      apiBaseUrlRef.current = apiBaseUrlConfig;
      setApiBaseUrlInputValue(apiBaseUrlConfig); // 同步到输入框
    }
  }, [loading, apiBaseUrlConfig]);


  const apiEndpoint = useMemo(() => {
    if (!apiBaseUrlRef.current) {
      return new Proxy({} as any, {
        get: () => null
      });
    }

    return {
      keyGen: `${apiBaseUrlRef.current}/key-gen`,
      config: `${apiBaseUrlRef.current}/config`,
      sync: `${apiBaseUrlRef.current}/sync`,
      wsUrl: new URL(apiBaseUrlRef.current).origin
    }
  }, [apiBaseUrlRef.current]);

  /**
   * @description 获取API配置 包含大小限制和过期时间等数据
   */
  const hasError = useRef(false); // 当前config接口是否报错
  const needNotify = useRef(false); // 是否需要通知
  // config接口变化时重置错误状态
  useEffect(() => {
    hasError.current = false;
  }, [apiEndpoint.config]);
  // 获取API配置
  const { data: apiConfig, error: apiConfigError, isLoading: apiConfigLoading, mutate: fetchConfig } = useFetchSWR(apiEndpoint.config);
  const apiConfigRef = useRef(apiConfig);
  // 手动获取API配置
  const getConfig = useCallback(({ notify = false }: { notify?: boolean } = {}) => {
    needNotify.current = notify;
    fetchConfig()
  }, [fetchConfig]);

  useEffect(() => {
    if (apiConfigLoading) {
      // 设置连接状态
      setConnectionState(SOCKET_STATE.CONNECTING);
      return;
    }

    if (apiConfigError) {
      console.error(`[MainView] getConfig error:`, apiConfigError);

      // 同一config接口，仅首次报错时通知
      if (!hasError.current) {
        hasError.current = true;
        notification.error(NOTIFICATION.GET_CONFIG_FAILED);
      }

      // 设置连接状态
      setConnectionState(SOCKET_STATE.ERROR);

      socketRef.current?.disconnect();

      return;
    }

    // 成功取到数据后
    // 设置连接状态
    setConnectionState(SOCKET_STATE.CONNECTED);
    socketRef.current?.connect();
    setTrayTips();
    // 重置错误状态
    hasError.current = false;
    // 更新apiConfigRef
    apiConfigRef.current = apiConfig;
    // 获取API密钥
    getApiKey({ copy: false });

    if (needNotify.current) {
      notification.success(NOTIFICATION.GET_CONFIG_SUCCESS);
    }
  }, [apiConfig, apiConfigError, apiConfigLoading, needNotify.current]);


  /**
   * @description 获取并复制API密钥
   */
  const fetcher = useCallback(async (url: string, { arg }: { arg: RequestInit }) => {
    const res = await fetch(url, arg)
    return res.json()
  }, [])
  const { trigger: fetchApiKey, isMutating: apiKeyLoading } = useFetchSWRMutation(apiEndpoint.keyGen, fetcher)
  const getApiKey = useCallback(async ({ copy = true }: { copy?: boolean } = {}) => {
    if (loading || apiKeyLoading) return;

    // 如果API密钥为空，则获取API密钥
    if (!apiKeyRef.current) {
      fetchApiKey({})
        .then((res: any) => {
          console.log('[MainView] fetchApiKey res:', res);
          if (res?.key) {
            // 写入配置
            apiKeyRef.current = res.key;
            setApiKeyConfig(res.key);
          }
        })
        .catch((err: any) => {
          console.error('[MainView] fetchApiKey error:', err);
        });
    }

    // 写入剪贴板
    if (copy) {
      await clipboard.writeText(apiKeyRef.current);
      notification.success(NOTIFICATION.API_KEY_COPIED);
    }

    console.log('[MainView] getApiKey', apiKeyRef.current);
  }, [apiKeyLoading, apiKeyRef.current, setApiKeyConfig]);
  useEffect(() => {
    apiKeyRef.current = apiKeyConfig;
  }, [apiKeyConfig]);


  /**
   * 多语言相关处理
   */
  const systemLanguage = navigator.language.replace('-', '_');
  const [language, setLanguage] = useKVP('language', systemLanguage);
  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    setLanguage(lang);
  }

  const iconTheme = useMediaQuery('(prefers-color-scheme: dark)') ? 'light' : 'dark';
  useEffect(() => {
    if (!language || !iconTheme) return;

    changeLanguage(language);
    setTrayTips();
    invoke('update_tray', { lang: language, theme: iconTheme });
  }, [language, iconTheme]);


  /**
   * @description 端到端加密
   */
  const [enableEncryption, setEnableEncryption] = useKVP('enableEncryption', false);
  const [password, setPassword] = useKVP('encryptionPassword', '');
  const enableEncryptionRef = useRef(enableEncryption);
  const encryptionPasswordRef = useRef(password);
  const checkPassword = useCallback((password: string) => {
    // if (password.length < PASSWORD_CONSTANTS.MIN_LENGTH || password.length > PASSWORD_CONSTANTS.MAX_LENGTH) {
    //   notification.error(NOTIFICATION.PASSWORD_INVALID);
    //   return false;
    // }
    setPassword(password);
    return true;
  }, []);
  useEffect(() => {
    enableEncryptionRef.current = enableEncryption;
    encryptionPasswordRef.current = password;
  }, [enableEncryption, password]);


  /**
   * @description 开机启动
   */
  const [startAtLogin, setStartAtLogin] = useKVP('startAtLogin', false);
  useEffect(() => {
    if (loading) return;

    (async () => {
      try {
        console.log('[MainView] setStartAtLogin', startAtLogin);
        if (startAtLogin) {
          await Autostart.enable();
          setStartAtLogin(await Autostart.isEnabled());
        } else {
          await Autostart.disable();
          setStartAtLogin(await Autostart.isEnabled());
        }
      } catch (error) {
        console.error('[MainView] setStartAtLogin error:', error);
        setStartAtLogin(false);
      }
    })();
  }, [loading, startAtLogin]);


  // 暂停同步
  const [syncPaused, setSyncPaused] = useKVP('syncPaused', true);
  const syncPausedRef = useRef(syncPaused);
  useEffect(() => {
    if (tauriLoading || loading) return;

    syncPausedRef.current = syncPaused;
    if (syncPaused) {
      console.log('[MainView] sync is paused, disconnect socket');
      socketRef.current?.disconnect();
    } else {
      console.log('[MainView] sync is resumed, reconnect socket');
      socketRef.current?.connect();
    }
  }, [tauriLoading, loading, syncPaused]);

  useEffect(() => {
    const unlistenTrayEvent =
      tauriEvent.listen('systemTray', async (event: TrayEvent) => {
        const { message, data } = event.payload;

        if (message === 'toggle-sync') {
          const isPaused = data === 'paused';

          syncPausedRef.current = isPaused;
          setSyncPaused(isPaused);
          setTrayTips();

          notification.info(isPaused ? NOTIFICATION.SYNC_PAUSED : NOTIFICATION.SYNC_RESUMED);

          console.log(`[clipboard] toggle sync state: ${data}`);
        }
      });

    return () => {
      unlistenTrayEvent.then(unlisten => unlisten());
    };
  }, []);


  /**
   * @description WebSocket连接处理
   */
  const { socket, socketRef, isConnecting, isConnected, error } = useWebsocket({
    url: apiEndpoint.wsUrl
  });
  useEffect(() => {
    if (isConnecting) setConnectionState(SOCKET_STATE.CONNECTING);
    if (isConnected) setConnectionState(SOCKET_STATE.CONNECTED);
    if (error) setConnectionState(SOCKET_STATE.ERROR);
    if (!isConnecting && !isConnected && !error) setConnectionState(SOCKET_STATE.DISCONNECTED);
  }, [isConnecting, isConnected, error]);
  // 获取当前状态
  const socketState = useMemo(() => {
    if (syncPaused) {
      return SOCKET_CONFIG[SOCKET_STATE.PAUSED];
    }

    return SOCKET_CONFIG[connectionState];
  }, [syncPaused, connectionState]);
  // 获取状态文本和颜色
  const { text: socketStateText, color: socketStateColor } = useMemo(() => ({
    text: t(socketState.text),
    color: socketState.color
  }), [socketState, t]);
  // 监听云端剪贴板变化
  useEffect(() => {
    if (isConnected) {
      console.log('[websocket] init auth');

      socket?.emit('auth', apiKeyRef.current);
      socket?.on('clipboard:sync', async (data: any) => {
        if (data.sourceId === socket.id) return

        console.log('[websocket] recv ===============>', data);

        const clipboardData: ClipboardData = {
          type: data.type,
          content: data.content,
          source: 'remote'
        };

        await handleClipboardData(clipboardData);
      });
    }

    return () => {
      socket?.off('clipboard:sync');
    }
  }, [isConnected, socket, apiKeyRef.current]);

  /**
   * @description 本地剪贴板相关
   */
  const isProgramWriteRef = useRef(false); // 标记是否是程序写入的数据 避免重复处理
  // 监听本地剪贴板变化
  const isListening = useRef(false);

  useEffect(() => {
    if (isListening.current) {
      return;
    }
    isListening.current = true;

    console.log('[clipboard] isListening:', isListening.current);

    let unlistenUpdate: () => void;
    let unlistenStart: () => void;

    const setupClipboardListeners = async () => {
      try {
        // 在2秒内重复触发的，只处理最后一次
        const onClipboardUpdate = debounce(
          async () => {
            // 如果暂停同步或是程序写入的数据，则跳过处理
            if (syncPausedRef.current || isProgramWriteRef.current) {
              isProgramWriteRef.current = false;
              return;
            }

            const clipboardData = await readClipboardData({ max_size: apiConfigRef.current?.clipboard_size });
            if (!clipboardData) {
              console.warn('[clipboard] no clipboard data');
              return;
            }

            console.log('[clipboard] clipboardData:', clipboardData);

            await handleClipboardData(clipboardData);
          }, 2000,
          { leading: false, trailing: true }
        );

        unlistenUpdate = await clipboard.onClipboardUpdate(onClipboardUpdate);
        unlistenStart = await clipboard.startListening();
      } catch (error) {
        console.error('[clipboard] setup error:', error);
      }
    };

    setupClipboardListeners();

    return () => {
      unlistenUpdate?.();
      unlistenStart?.();
    }
  }, []);

  /**
   * @description 处理剪贴板数据
   */
  // 添加一个引用来存储最后处理的内容
  const lastContentRef = useRef<string>('');
  // 上传剪贴板内容
  const { trigger: syncClipboard, isMutating: syncClipboardLoading } = useFetchSWRMutation(apiEndpoint.sync, fetcher)
  const uploadClipboard = useCallback(async ({ type, content }: { type: string, content: string }) => {
    if (!socketRef.current?.id) return;
    if (syncClipboardLoading) return;

    console.log('[clipboard] uploadClipboard:', { type, content });

    if (!apiConfigRef.current?.clipboard_type.includes(type)) {
      console.warn('[clipboard] the server does not support this type:', type);
      return;
    }

    const max_size = apiConfigRef.current?.clipboard_size;
    const content_size = await calculateContentSize(content);
    if (max_size && content_size > max_size) {
      console.warn(`[clipboard] the content is too large: max_size=${max_size}, content_size=${content_size}`);
      return;
    }

    syncClipboard({
      method: 'POST',
      body: JSON.stringify({
        type,
        content,
        key: apiKeyRef.current,
        clientId: socketRef?.current?.id
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    })
      .then((res: any) => {
        if (res?.code === 200) {
          console.log('[clipboard] upload success:', res);
          notification.success({
            title: "Upload successfully",
            message: NOTIFICATION.CLIPBOARD_UPLOAD_SUCCESS
          });
        } else {
          console.warn('[clipboard] upload failed:', res);
          notification.error({
            title: "Upload failed",
            message: `${res?.code}, ${res?.msg}`
          });
        }
      })
      .catch((err) => {
        console.error('[clipboard] upload error:', err);
        notification.error({
          title: "Upload failed",
          message: NOTIFICATION.CLIPBOARD_UPLOAD_FAILED
        });
      });
  }, [syncClipboard, apiEndpoint, apiKeyRef.current, socketRef?.current?.id]);
  const handleClipboardData = useCallback(async (data: ClipboardData) => {
    // 如果暂停同步，则跳过处理
    if (syncPausedRef.current) {
      console.log('[clipboard] sync paused, skip', data);
      return;
    }

    const { type, content, source, plaintext } = data;
    // 处理内容
    let processedContent = content;

    // 远程来源
    if (source === 'remote') {
      // 如果内容是远程来源，并且启用了端到端加密，则解密内容
      if (enableEncryptionRef.current) {
        processedContent = decryptContent(content, encryptionPasswordRef.current);
        console.log('[clipboard] decrypt content:', processedContent);
      }
      // 跳过重复内容
      if (processedContent === lastContentRef.current) {
        console.log('[clipboard] skip duplicate content');
        return;
      }
      lastContentRef.current = processedContent;
      // 写入剪贴板
      try {
        // 在写入剪贴板前设置标记，表示这是程序写入的数据
        isProgramWriteRef.current = true;
        await writeToClipboard(type, processedContent, plaintext);
      } catch (error) {
        console.error('[clipboard] failed to write clipboard:', error);
        return;
      }
    }

    // 同步到云端
    if (source === 'local') {
      const content = enableEncryptionRef.current
        ? encryptContent(processedContent, encryptionPasswordRef.current)
        : processedContent;

      await uploadClipboard({ type, content });
    }
  }, [enableEncryptionRef.current, encryptionPasswordRef.current, uploadClipboard, syncPausedRef.current]);


  const setTrayTips = useCallback(() => {
    (async () => {
      await getCurrentWindow().setTitle(`CloudBoard v${VERSION}${syncPausedRef.current ? ` - ${t('Sync Paused')}` : ''}`);
      await invoke('set_sync_state', { state: syncPausedRef.current ? 'paused' : 'running' });
      await invoke('update_tray_tooltip', { tooltip: `CloudBoard v${VERSION}${syncPausedRef.current ? ` (${t('Sync Paused')})` : ''}` });
      if (language && iconTheme) await invoke('update_tray', { lang: language, theme: iconTheme });
    })();
  }, [t, syncPausedRef.current, language, iconTheme]);


  const SocketState: React.FC = () => {
    const Tip: React.FC = () => (
      <Stack gap={'0'}>
        <Text size='xs'>{socketStateText}</Text>
        {
          apiConfig && (
            <>
              <Text size='xs'>{t('Client ID')}: {socketRef.current?.id || '-'}</Text>
              <Text size='xs'>{t('clipboard_type', { type: apiConfig?.clipboard_type || '-' })}</Text>
              <Text size='xs'>{t('clipboard_size', { size: apiConfig?.clipboard_size ? formatBytes(apiConfig?.clipboard_size) : '-' })}</Text>
              <Text size='xs'>{t('clipboard_ttl', { ttl: apiConfig?.clipboard_ttl || '-' })}</Text>
            </>
          )
        }
      </Stack>
    );

    return (
      <Tooltip label={<Tip />} arrowSize={10} withArrow position="top-start">
        <Group justify='center' align='center' wrap="nowrap" w={'80%'} h={'80%'} style={{ cursor: 'pointer' }}>
          <Text c={socketStateColor} size='xs'>●</Text>
        </Group>
      </Tooltip>
    );
  };

  if (tauriLoading || loading) {
    return <Center h={'100%'}><Loader size={'lg'} /></Center>;
  }

  // <> is an alias for <React.Fragment>
  return <Stack h={'100%'} gap={'sm'} pos={'relative'}>
    <Group justify='end' wrap="nowrap" gap="xs" pos={'absolute'} top={'-0.3rem'} right={0}>
      <Anchor size={'xs'} c={language === 'en_US' ? 'blue' : 'dimmed'} onClick={() => changeLanguage('en_US')}>EN</Anchor>
      <Anchor size={'xs'} c={language === 'zh_CN' ? 'blue' : 'dimmed'} onClick={() => changeLanguage('zh_CN')}>中文</Anchor>
    </Group>

    <Text size={'sm'} style={{ marginBottom: '-.5rem' }}>{t('API Endpoint')}</Text>
    <Group justify="space-between" wrap="nowrap">
      <div style={{ width: '100%' }}>
        <TextInput
          leftSection={<SocketState />}
          placeholder={t('Input API Endpoint')}
          value={apiBaseUrlInputValue}
          onBlur={() => changeApiBaseUrl(apiBaseUrlInputValue)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              changeApiBaseUrl(apiBaseUrlInputValue);
            }
          }}
          onChange={e => setApiBaseUrlInputValue(e.currentTarget.value.trim())}
        />
      </div>
      <Button
        size='xs'
        loading={apiKeyLoading}
        onClick={() => getApiKey({ copy: true })}
        style={{ flexShrink: 0 }}
      >
        {t('Get-Key')}
      </Button>
    </Group>

    <Text size={'sm'} style={{ marginBottom: '-.5rem' }}>{t('End-to-End Encryption')}</Text>
    <Group justify="space-between" wrap="nowrap">
      <div style={{ width: '100%' }}>
        <PasswordInput
          leftSection={
            <Tooltip label={<Text size="xs" style={{ whiteSpace: 'pre-wrap' }}>{t('END_TO_END_SECURITY_TIP')}</Text>} arrowSize={10} withArrow position="top-start" w={'min(300px, max-content)'} multiline>
              <TbFingerprint size={20} strokeWidth={1.5} style={{ cursor: 'pointer' }} />
            </Tooltip>
          }
          leftSectionPointerEvents='all'
          placeholder={t('Input End-to-End Password')}
          value={password}
          minLength={PASSWORD_CONSTANTS.MIN_LENGTH}
          maxLength={PASSWORD_CONSTANTS.MAX_LENGTH}
          required
          disabled={!enableEncryption}
          onBlur={() => checkPassword(password)}
          onChange={(e) => setPassword(e.currentTarget.value.trim())}
        />
      </div>
      <Switch onLabel={t('ON')} offLabel={t('OFF')} size="md" checked={enableEncryption} onChange={e => setEnableEncryption(e.currentTarget.checked)} />
    </Group>

    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        <Text size="sm">{t('Start at Login')}</Text>
        <Text size="xs" c="dimmed">
          {t('It will launch cloudboard automatically when the system starts')}
        </Text>
      </div>
      <Switch onLabel={t('ON')} offLabel={t('OFF')} size="md" checked={startAtLogin} onChange={e => setStartAtLogin(e.currentTarget.checked)} />
    </Group>

    <Group style={{ marginTop: 'auto', marginBottom: '-.3rem' }} justify="center" wrap="nowrap" gap="xs">
      <Text size="xs" c="dimmed">Cloudboard v{VERSION}</Text>
      <Text size="xs" c="dimmed">
        <Anchor c="dimmed" href='https://github.com/journey-ad/cloudboard' target='_blank' >{t('Github')}</Anchor>
      </Text>
    </Group>

  </Stack>
}
