import { useEffect, useSyncExternalStore } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { createUpdateController } from './update_controller';
import packageInfo from '../../package.json';

export const appVersion = packageInfo.version;
const controller = createUpdateController({
  enabled: isTauri() && !import.meta.env.DEV && getCurrentWindow().label === 'main',
  currentVersion: appVersion,
  check,
  relaunch,
  beforeInstall: async () => {
    const status = await invoke<{ is_any_scanning: boolean }>('get_system_status');
    if (status.is_any_scanning || !window.dispatchEvent(new Event('vx-before-update', { cancelable: true }))) {
      throw new Error('operation_busy');
    }
  },

});
export const { checkForUpdates, installUpdate, restartAfterUpdate, dismissUpdateNotice } = controller;

export function useAppUpdater() {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  // Startup and Settings share one store, including under React StrictMode.
  useEffect(controller.start, []);
  return state;
}
