import { ActionIcon, AppShell, Burger, Button, Group, Space, Text, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { useDisclosure, useHotkeys } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import * as tauriEvent from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import * as tauriLogger from '@tauri-apps/plugin-log';
import { relaunch } from '@tauri-apps/plugin-process';
// import * as tauriUpdater from '@tauri-apps/plugin-updater';
import { JSX, lazy, LazyExoticComponent, Suspense, useEffect, useRef, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';
import classes from './App.module.css';
import { useCookie, useLocalForage } from './common/utils';
import { RUNNING_IN_TAURI, useTauriContext } from './tauri/TauriProvider';
import MainView from './views/MainView';
import FallbackAppRender from './views/FallbackErrorBoundary';

// imported views need to be added to the `views` list variable
interface View {
  component: (() => JSX.Element) | LazyExoticComponent<() => JSX.Element>,
  path: string,
  exact?: boolean,
  name: string
}

export default function () {
  const { t } = useTranslation();

  const { setColorScheme, toggleColorScheme } = useMantineColorScheme();
  const colorScheme = useComputedColorScheme();
  useEffect(() => {
    setColorScheme("auto");
  }, []);
  useHotkeys([['ctrl+J', toggleColorScheme]]);

  // Tauri event listeners (run on mount)
  if (RUNNING_IN_TAURI) {
    useEffect(() => {
      const promise = tauriEvent.listen('longRunningThread', ({ payload }: { payload: any }) => {
        tauriLogger.info(payload.message);
      });
      return () => { promise.then(unlisten => unlisten()) };
    }, []);
    // system tray events
    // useEffect(() => {
    //   const promise = tauriEvent.listen('systemTray', ({ payload, ...eventObj }: { payload: { message: string, data: string } }) => {
    //     console.log('[tray-event]', payload);
    //     // for debugging purposes only
    //     // notifications.show({
    //     //   title: '[DEBUG] System Tray Event',
    //     //   message: payload.message
    //     // });
    //   });
    //   return () => { promise.then(unlisten => unlisten()) };
    // }, []);

    // update checker
    // useEffect(() => {
    //   (async () => {
    //     const update = await tauriUpdater.check();
    //     if (update) {
    //       const color = colorScheme === 'dark' ? 'teal' : 'teal.8';
    //       notifications.show({
    //         id: 'UPDATE_NOTIF',
    //         title: t('updateAvailable', { v: update.version }),
    //         color,
    //         message: <>
    //           <Text>{update.body}</Text>
    //           <Button color={color} style={{ width: '100%' }} onClick={() => update.downloadAndInstall(event => {
    //             switch (event.event) {
    //               case 'Started':
    //                 notifications.show({ title: t('installingUpdate', { v: update.version }), message: t('relaunchMsg'), autoClose: false });
    //                 // contentLength = event.data.contentLength;
    //                 // tauriLogger.info(`started downloading ${event.data.contentLength} bytes`);
    //                 break;
    //               case 'Progress':
    //                 // downloaded += event.data.chunkLength;
    //                 // tauriLogger.info(`downloaded ${downloaded} from ${contentLength}`);
    //                 break;
    //               case 'Finished':
    //                 // tauriLogger.info('download finished');
    //                 break;
    //             }
    //           }).then(relaunch)}>{t('installAndRelaunch')}</Button>
    //         </>,
    //         autoClose: false
    //       });
    //     }
    //   })()
    // }, []);

    // Handle additional app launches (url, etc.)
    useEffect(() => {
      const promise = tauriEvent.listen('newInstance', async ({ payload, ...eventObj }: { payload: { args: string[], cwd: string } }) => {
        const appWindow = getCurrentWebviewWindow();
        if (!(await appWindow.isVisible())) await appWindow.show();

        if (await appWindow.isMinimized()) {
          await appWindow.unminimize();
          await appWindow.setFocus();
        }

        let args = payload?.args;
        let cwd = payload?.cwd;
        if (args?.length > 1) {

        }
      });
      return () => { promise.then(unlisten => unlisten()) };
    }, []);

    // 监听窗口关闭事件
    useEffect(() => {
      if (RUNNING_IN_TAURI) {
        const appWindow = getCurrentWebviewWindow();

        // 监听窗口关闭事件
        const unlisten = appWindow.onCloseRequested(async (event) => {
          try {
            // 阻止默认关闭行为
            event.preventDefault();
            // 隐藏窗口
            await appWindow.hide();
            console.log('Window hidden successfully');
          } catch (error) {
            console.error('Error hiding window:', error);
          }
        });

        // 清理函数
        return () => {
          unlisten.then(fn => fn());
        };
      }
    }, []);
  }

  return <>
    <AppShell padding='sm' className={classes.appShell} h={'100dvh'}>
      <AppShell.Main h={'100%'}>
        <ErrorBoundary FallbackComponent={FallbackAppRender} /*onReset={_details => resetState()} */ onError={e => tauriLogger.error(e.message)}>
          <MainView />
        </ErrorBoundary>
      </AppShell.Main>
    </AppShell>
  </>;
}
