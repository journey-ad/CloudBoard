// API for Tauri or web storage
import { exists } from '@tauri-apps/plugin-fs';
import { Store } from '@tauri-apps/plugin-store';
import localforage from 'localforage';
import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { useMutative } from 'use-mutative';
import { useTauriContext } from './TauriProvider';
// docs: https://github.com/tauri-apps/tauri-plugin-store/blob/dev/webview-src/index.ts

const RUNNING_IN_TAURI = window.isTauri === true;
export const USE_STORE = false && RUNNING_IN_TAURI;
// save data after setState
// https://blog.seethis.link/scan-rate-estimator/
const SAVE_DELAY = 100;

// returns an API to get a item, set an item from a specific category of data
// why? we don't to have loading variable for multiple values
export function createStorage(storePath: string | null) {
	const [data, setData] = useMutative<Record<string, any> | undefined>(undefined);
	const [loading, setLoading] = useState(true);
	const fileStoreRef = useRef<Store | null>(null);
	const timeoutRef = useRef<number>(undefined);

	// load data
	useEffect(() => {
		if (storePath === null) return;
		if (RUNNING_IN_TAURI) {
			(async () => {
				try {
					console.log('[storage] start load configuration file:', storePath);
					const store = await Store.load(storePath);
					if (store === null) throw new Error(`invalid path ${storePath} for store`);
					fileStoreRef.current = store;

					// 先检查文件是否存在及其内容
					const isExists = await exists(storePath);

					if (!isExists) {
						const newObj = {};
						setData(newObj);
						console.log('[storage] initialize new configuration file');
					} else {
						const value = await store.entries();
						const dataObj = Object.fromEntries(value);
						setData(dataObj);
						console.log('[storage] configuration file loaded:', dataObj);
					}
					setLoading(false);
				} catch (e) {
					console.error('[storage] load configuration file error:', e);
					setLoading(false);
				}
			})();
		} else {
			localforage.getItem(storePath, (err, value) => {
				// make store a {} again in catch
				if (err !== undefined && value === null || Array.isArray(value)) {
					localforage.setItem(storePath, {}, (err, val) => {
						if (err !== null && err !== undefined) {
							return alert('cannot store data, application will not work as intended');
						}
						setData(val);
						setLoading(false);
					});
				} else {
					setData(value as any);
					setLoading(false);
				}
			});
		}
	}, [storePath]);

	const setItem = useCallback((key: string, newValueOrHandler: Dispatch<SetStateAction<any>>) => {
		if (loading) return;
		window.clearTimeout(timeoutRef.current);
		setData(data => {
			if (loading || data === undefined) return;
			const prev = data[key];
			let value: any = newValueOrHandler;
			try {
				value = newValueOrHandler(prev);
			} catch { }
			data[key] = value;
			if (value !== prev) {
				if (RUNNING_IN_TAURI) {
					fileStoreRef.current!.set(key, value);
				} else {
					timeoutRef.current = window.setTimeout(() => localforage.setItem(storePath!, data), SAVE_DELAY);
				}
			}
		});
	}, [storePath, loading, fileStoreRef, timeoutRef]);

	const getItem = useCallback((key: string, defaultValue: object) => {
		if (loading) return undefined;
		if (data === undefined) return defaultValue;
		const value = data[key];
		// 只有在配置加载完成且键值不存在时，才使用默认值并写入配置
		if (value === undefined && defaultValue !== undefined) {
			setData(data => {
				if (data !== undefined) data[key] = defaultValue;
			});
			if (RUNNING_IN_TAURI && fileStoreRef.current) {
				fileStoreRef.current.set(key, defaultValue);
			}
			return defaultValue;
		}
		return value;
	}, [loading, data]);

	const useItem = useCallback((key: string, defaultValue: any) => {
		const value = getItem(key, defaultValue);
		return [value, (newValue: any) => setItem(key, newValue)];
	}, [getItem, setItem]);

	return {
		get: getItem,
		set: setItem,
		use: useItem,
		data,
		loading
	};
}
