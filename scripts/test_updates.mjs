import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = readFileSync(new URL('../src/services/update_controller.ts', import.meta.url), 'utf8');
const outputText = stripTypeScriptTypes(source);
const { createUpdateController } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('StrictMode/startup subscribers issue one check and never auto-install', async () => {
  let checks = 0;
  let installs = 0;
  const controller = createUpdateController({ enabled: true, check: async () => {
    checks++;
    await tick();
    return { version: '2.0.0', close: async () => {}, downloadAndInstall: async () => { installs++; } };
  }, relaunch: async () => {} });
  controller.start();
  controller.start();
  await controller.checkForUpdates();
  await tick();
  assert.equal(checks, 1);
  assert.equal(installs, 0);
  assert.equal(controller.snapshot().status, 'available');
  controller.dismissUpdateNotice();
  assert.equal(controller.snapshot().noticeVisible, false);
  assert.equal(controller.snapshot().status, 'available');
});

test('offline startup stays quiet; explicit check shows a recoverable error', async () => {
  let offline = true;
  const controller = createUpdateController({ enabled: true, check: async () => {
    if (offline) throw new Error('Offline');
    return null;
  }, relaunch: async () => {} });
  await controller.checkForUpdates(false);
  assert.equal(controller.snapshot().status, 'error');
  assert.equal(controller.snapshot().noticeVisible, false);
  await controller.checkForUpdates();
  assert.equal(controller.snapshot().noticeVisible, true);
  offline = false;
  await controller.checkForUpdates();
  assert.equal(controller.snapshot().status, 'current');
});

test('concurrent install requests download once and report progress before restart', async () => {
  let installs = 0;
  let restarts = 0;
  const statuses = [];
  const controller = createUpdateController({ enabled: true, check: async () => ({
    version: '2.0.0', close: async () => {}, downloadAndInstall: async (onEvent) => {
      installs++;
      await tick();
      onEvent({ event: 'Started', data: { contentLength: 100 } });
      onEvent({ event: 'Progress', data: { chunkLength: 50 } });
      assert.equal(controller.snapshot().progress, 50);
      onEvent({ event: 'Finished' });
    },
  }), relaunch: async () => { restarts++; } });
  controller.subscribe(() => statuses.push(controller.snapshot().status));
  await controller.checkForUpdates();
  await Promise.all([controller.installUpdate(), controller.installUpdate(), controller.checkForUpdates()]);
  assert.equal(installs, 1);
  assert.equal(restarts, 1);
  assert.ok(statuses.includes('downloading') && statuses.includes('installing'));
  assert.equal(controller.snapshot().status, 'installed');
});

test('signature/download failure never restarts and permits a new check', async () => {
  let restarts = 0;
  let closed = 0;
  const controller = createUpdateController({ enabled: true, check: async () => ({
    version: '2.0.0', close: async () => { closed++; },
    downloadAndInstall: async () => { throw new Error('Invalid signature'); },
  }), relaunch: async () => { restarts++; } });
  await controller.checkForUpdates();
  await controller.installUpdate();
  assert.equal(controller.snapshot().status, 'error');
  assert.equal(restarts, 0);
  await controller.checkForUpdates();
  assert.equal(closed, 1);
  assert.equal(controller.snapshot().status, 'available');
});

test('restart failure retains installed state and retry does not re-download', async () => {
  let installs = 0;
  let attempts = 0;
  const controller = createUpdateController({ enabled: true, check: async () => ({
    version: '2.0.0', close: async () => {}, downloadAndInstall: async () => { installs++; },
  }), relaunch: async () => { if (++attempts === 1) throw new Error('Restart failed'); } });
  await controller.checkForUpdates();
  await controller.installUpdate();
  assert.equal(controller.snapshot().status, 'installed');
  await controller.checkForUpdates();
  await controller.restartAfterUpdate();
  assert.equal(installs, 1);
  assert.equal(attempts, 2);
});

test('browser/dev/secondary window never invokes updater APIs', async () => {
  const fail = async () => { throw new Error('Must not be called'); };
  const controller = createUpdateController({ enabled: false, check: fail, relaunch: fail });
  controller.start();
  await controller.checkForUpdates();
  await controller.installUpdate();
  assert.equal(controller.snapshot().status, 'disabled');
});


test('unsaved changes block install before download and allow retry', async () => {
  let blocked = true, downloads = 0, releases = 0, restarts = 0;
  const controller = createUpdateController({enabled:true,
    check:async()=>({version:'2.0.0',close:async()=>{},downloadAndInstall:async()=>{downloads++;}}),
    beforeInstall:async()=>{if(blocked)throw new Error('Pending changes');},
    installFailed:async()=>{releases++;},relaunch:async()=>{restarts++;}});
  await controller.checkForUpdates();await controller.installUpdate();
  assert.equal(downloads,0);assert.equal(restarts,0);assert.equal(releases,1);
  assert.equal(controller.snapshot().status,'error');
  blocked=false;await controller.installUpdate();
  assert.equal(downloads,1);assert.equal(restarts,1);
});

test('failed download releases the native mutation guard', async () => {
  let released=0;
  const controller=createUpdateController({enabled:true,
    check:async()=>({version:'2.0.0',close:async()=>{},downloadAndInstall:async()=>{throw new Error('Offline');}}),
    beforeInstall:async()=>{},installFailed:async()=>{released++;},relaunch:async()=>{assert.fail('must not restart');}});
  await controller.checkForUpdates();await controller.installUpdate();
  assert.equal(released,1);assert.equal(controller.snapshot().status,'error');
});

test('a failed handle close cannot leave a stale installable update', async () => {
 let installs=0;
 const c=createUpdateController({enabled:true,check:async()=>({version:'2.0.0',close:async()=>{throw new Error('closed handle');},downloadAndInstall:async()=>{installs++;}}),relaunch:async()=>{}});
 await c.checkForUpdates();await c.checkForUpdates();assert.equal(c.snapshot().status,'error');await c.installUpdate();assert.equal(installs,0);
 await c.checkForUpdates();assert.equal(c.snapshot().status,'available');
});
test('recovery failure still reports a retryable download error', async()=>{
 const c=createUpdateController({enabled:true,check:async()=>({version:'2.0.0',close:async()=>{},downloadAndInstall:async()=>{throw new Error('network failed');}}),installFailed:async()=>{throw new Error('recovery failed');},relaunch:async()=>{assert.fail('no restart');}});
 await c.checkForUpdates();await c.installUpdate();assert.equal(c.snapshot().status,'error');assert.match(c.snapshot().error,/network failed/);await c.checkForUpdates();assert.equal(c.snapshot().status,'available');
});
