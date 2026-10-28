import type { Update } from '@tauri-apps/plugin-updater';

type UpdateHandle = Pick<Update, 'version' | 'close' | 'downloadAndInstall'>;
interface UpdaterDependencies {
  enabled: boolean;
  check: (options: { timeout: number }) => Promise<UpdateHandle | null>;
  relaunch: () => Promise<void>;
  beforeInstall?:()=>Promise<void>;
  installFailed?:()=>Promise<void>;
}

type UpdateStatus = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'installing' | 'installed' | 'error' | 'disabled';
export interface UpdateState {
  status: UpdateStatus;
  version?: string;
  progress?: number;
  error?: string;
  noticeVisible: boolean;
}

export function createUpdateController(dependencies: UpdaterDependencies) {
  const { enabled } = dependencies;
  let state: UpdateState = { status: enabled ? 'idle' : 'disabled', noticeVisible: false };
  let pendingUpdate: UpdateHandle | null = null;
  let started = false;
  let busy = false;
  const listeners = new Set<() => void>();
  const snapshot = () => state;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  };
  function publish(next: UpdateState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  async function checkForUpdates(manual = true): Promise<void> {
    if (!enabled || busy || state.status === 'installed') return;
    busy = true;
    publish({ status: 'checking', noticeVisible: false });
    try {
      if (pendingUpdate) {
        const previous = pendingUpdate;
        pendingUpdate = null;
        await previous.close();
      }
      pendingUpdate = await dependencies.check({ timeout: 15_000 });
      publish(pendingUpdate
        ? { status: 'available', version: pendingUpdate.version, noticeVisible: true }
        : { status: 'current', noticeVisible: false });
    } catch (error) {
      // An offline startup must not interrupt normal use of the application.
      publish({ status: 'error', error: String(error), noticeVisible: manual });
    } finally {
      busy = false;
    }
  }

  async function installUpdate(): Promise<void> {
    if (!enabled || busy || !pendingUpdate) return;
    busy = true;
    const version = pendingUpdate.version;
    let downloaded = 0;
    let total = 0;
    try {
      await dependencies.beforeInstall?.();
      publish({ status: 'downloading', version, noticeVisible: true });
      await pendingUpdate.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          publish({ status: 'downloading', version, progress: total ? Math.min(100, Math.round(downloaded / total * 100)) : undefined, noticeVisible: true });
        } else {
          publish({ status: 'installing', version, noticeVisible: true });
        }
      }, { timeout: 300_000 });
      // Windows exits inside the installer; macOS needs an explicit restart.
      publish({ status: 'installed', version, noticeVisible: true });
      try {
        await dependencies.relaunch();
      } catch (error) {
        publish({ status: 'installed', version, error: String(error), noticeVisible: true });
      }
    } catch (error) {
      let recoveryError = '';
      try { await dependencies.installFailed?.(); } catch (failure) { recoveryError = `; ${failure}`; }
      publish({ status: 'error', error: String(error) + recoveryError, noticeVisible: true });
    } finally {
      busy = false;
    }
  }

  async function restartAfterUpdate(): Promise<void> {
    if (!enabled || busy || state.status !== 'installed') return;
    busy = true;
    try {
      await dependencies.relaunch();
    } catch (error) {
      publish({ ...state, error: String(error), noticeVisible: true });
    } finally {
      busy = false;
    }
  }

  function dismissUpdateNotice() {
    publish({ ...state, noticeVisible: false });
  }


  function start() {
    if (!started) {
      started = true;
      void checkForUpdates(false);
    }
  }
  return { snapshot, subscribe, start, checkForUpdates, installUpdate, restartAfterUpdate, dismissUpdateNotice };
}
