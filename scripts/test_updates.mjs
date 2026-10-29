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
  for (let attempt = 0; attempt < 5 && controller.snapshot().status === 'checking'; attempt++) await tick();
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
test('recovery failure preserves error and prevents unsafe retry', async()=>{
 const c=createUpdateController({enabled:true,check:async()=>({version:'2.0.0',close:async()=>{},downloadAndInstall:async()=>{throw new Error('network failed');}}),installFailed:async()=>{throw new Error('recovery failed');},relaunch:async()=>{assert.fail('no restart');}});
 await c.checkForUpdates();await c.installUpdate();assert.equal(c.snapshot().status,'error');assert.match(c.snapshot().error,/network failed/);await c.checkForUpdates();assert.equal(c.snapshot().status,'error');assert.equal(c.snapshot().errorCode,'recovery_failed');
});


test('dismissed version stays dismissed across rechecks but a new version notifies', async () => {
  let version='2.0.0';
  const c=createUpdateController({enabled:true,check:async()=>({version,close:async()=>{},downloadAndInstall:async()=>{}}),relaunch:async()=>{}});
  await c.checkForUpdates();c.dismissUpdateNotice();await c.checkForUpdates();
  assert.equal(c.snapshot().noticeVisible,false);assert.equal(c.snapshot().status,'available');
  version='2.0.1';await c.checkForUpdates();assert.equal(c.snapshot().noticeVisible,true);
});

test('installed update cannot install again even when called directly', async () => {
  let installs=0;
  const c=createUpdateController({enabled:true,check:async()=>({version:'2.0.0',close:async()=>{},downloadAndInstall:async()=>{installs++;}}),relaunch:async()=>{}});
  await c.checkForUpdates();await c.installUpdate();await c.installUpdate();assert.equal(installs,1);
});

test('cleanup failure is visible and recovery must succeed before a fresh check/install', async () => {
  let recoverFails=true, installs=0, checks=0;
  const c=createUpdateController({enabled:true,check:async()=>{checks++;return{version:'2.0.0',close:async()=>{},downloadAndInstall:async()=>{installs++;throw Error('signature invalid');}};},beforeInstall:async()=>{},installFailed:async()=>{if(recoverFails)throw Error('engine still locked');},relaunch:async()=>{assert.fail('never restart');}});
  await c.checkForUpdates();await c.installUpdate();assert.equal(c.snapshot().errorCode,'recovery_failed');assert.match(c.snapshot().error,/signature invalid.*engine still locked/);
  await c.installUpdate();assert.equal(installs,1);assert.equal(c.snapshot().status,'error');
  await c.checkForUpdates();assert.equal(checks,1);assert.equal(c.snapshot().errorCode,'recovery_failed');
  recoverFails=false;await c.checkForUpdates();assert.equal(checks,2);assert.equal(c.snapshot().status,'available');
});

test('stale handle close failure cannot leave an installable resource', async () => {
  let installs=0;
  const c=createUpdateController({enabled:true,check:async()=>({version:'2.0.0',close:async()=>{throw Error('close failed');},downloadAndInstall:async()=>{installs++;}}),relaunch:async()=>{}});
  await c.checkForUpdates();await c.checkForUpdates();await c.installUpdate();assert.equal(installs,0);assert.equal(c.snapshot().status,'error');
});

test('same/older stable versions are not offered; prerelease and invalid versions are rejected', async () => {
  for(const version of ['1.2.0','1.1.9','1.3.0-beta.1','garbage']){
    let closed=0;
    const c=createUpdateController({enabled:true,currentVersion:'1.2.0',check:async()=>({version,close:async()=>{closed++;},downloadAndInstall:async()=>{assert.fail('invalid offer');}}),relaunch:async()=>{}});
    await c.checkForUpdates();assert.equal(c.snapshot().status,version.includes('beta')||version==='garbage'?'error':'current');assert.equal(closed,1);
  }
});

test('unknown content length stays indeterminate; dismissal cannot hide an active install', async () => {
  const c=createUpdateController({enabled:true,check:async()=>({version:'2.0.0',close:async()=>{},downloadAndInstall:async event=>{
    event({event:'Started',data:{}});event({event:'Progress',data:{chunkLength:40}});
    assert.equal(c.snapshot().progress,undefined);c.dismissUpdateNotice();assert.equal(c.snapshot().noticeVisible,true);
  }}),relaunch:async()=>{}});
  await c.checkForUpdates();await c.installUpdate();assert.equal(c.snapshot().status,'installed');
});
