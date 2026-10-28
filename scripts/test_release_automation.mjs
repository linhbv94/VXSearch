import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { releaseAssets, releaseNotes, validateAssetLayout, assertNewerVersion } from './release_layout.mjs';
import { verifySignature } from './verify_signature.mjs';

// Public upstream Minisign test vectors, not project keys or a local signing implementation.
// https://github.com/jedisct1/rust-minisign-verify (MIT)
const publicKey = Buffer.from('untrusted comment: minisign public key\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3').toString('base64');
const signatures = [
  'RWQf6LRCGA9i59SLOFxz6NxvASXDJeRtuZykwQepbDEGt87ig1BNpWaVWuNrm73YiIiJbq71Wi+dP9eKL8OC351vwIasSSbXxwA=\ntrusted comment: timestamp:1555779966\tfile:test\nQtKMXWyYcwdpZAlPF7tE2ENJkRd1ujvKjlj1m9RtHTBnZPa5WKU5uWRs5GoP5M/VqE81QFuMKI5k/SfNQUaOAA==',
  'RUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=\ntrusted comment: timestamp:1556193335\tfile:test\ny/rUw2y8/hOUYjZU71eHp/Wo1KZ40fGy2VJEDl34XMJM+TX48Ss/17u3IvIfbVR1FkZZSNCisQbuQY+bHwhEBg==',
].map((value) => Buffer.from(`untrusted comment: signature from minisign secret key\n${value}`).toString('base64'));

test('Tauri signature verification accepts independent legacy/prehashed Minisign vectors and rejects tampering', () => {
  for (const signature of signatures) {
    verifySignature(Buffer.from('test'), publicKey, signature);
    assert.throws(() => verifySignature(Buffer.from('Test'), publicKey, signature), /invalid/);
    const tamperedComment = Buffer.from(Buffer.from(signature, 'base64').toString().replace('file:test', 'file:other')).toString('base64');
    assert.throws(() => verifySignature(Buffer.from('test'), publicKey, tamperedComment), /trusted comment/);
  }
  const wrongKey = Buffer.from(publicKey, 'base64').toString().split('\n');
  const bytes = Buffer.from(wrongKey[1], 'base64'); bytes[2] ^= 1;
  wrongKey[1] = bytes.toString('base64');
  assert.throws(() => verifySignature(Buffer.from('test'), Buffer.from(wrongKey.join('\n')).toString('base64'), signatures[0]), /Signing key/);
});

test('six assets must include distinct installers and architecture-correct updater URLs', () => {
  const config = { productName: 'Example App', version: '2.1.0' };
  const names = releaseAssets(config);
  const assets = ['latest.json', ...Object.values(names)].map((name) => ({ name, size: 100 }));
  const platforms = Object.fromEntries(['windows-x86_64', 'darwin-aarch64', 'darwin-x86_64'].map((platform) => [platform, { url: `https://github.com/example/app/releases/download/v2.1.0/${names[platform]}` }]));
  validateAssetLayout(config, { platforms }, assets);
  assert.throws(() => validateAssetLayout(config, { platforms }, assets.slice(0, -1)), /six/);
  platforms['darwin-aarch64-app'] = { url: platforms['darwin-x86_64'].url };
  assert.throws(() => validateAssetLayout(config, { platforms }, assets), /architecture/);
  delete platforms['darwin-aarch64-app'];
  platforms['darwin-aarch64'].url = platforms['darwin-x86_64'].url;
  assert.throws(() => validateAssetLayout(config, { platforms }, assets), /architecture/);
});

test('notes require real version-specific changes and link only first-install downloads', () => {
  const root = mkdtempSync(join(tmpdir(), 'release_notes_#%_'));
  try {
    const config = { productName: 'Example App', version: '2.1.0' };
    assert.throws(() => releaseNotes(config, 'example/app', 'v2.1.0', root));
    writeFileSync(join(root, '2.1.0.md'), '- Mở thư mục nhanh hơn.');
    const notes = releaseNotes(config, 'example/app', 'v2.1.0', root);
    assert.ok(notes.startsWith('- Mở thư mục nhanh hơn.'));
    assert.equal((notes.match(/releases\/download\/v2.1.0\//g) || []).length, 3);
    assert.ok(!notes.includes('.app.tar.gz') && !notes.includes('latest.json'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('stable version comparisons reject a rollback or re-publishing the same version', () => {
  assertNewerVersion('1.10.0', 'v1.9.9');
  assert.throws(() => assertNewerVersion('1.9.9', 'v1.10.0'));
  assert.throws(() => assertNewerVersion('1.10.0', 'v1.10.0'));
});

test('publish refuses unconfirmed QA or a failed exact-commit build before downloading or mutating assets', () => {
  const root = mkdtempSync(join(tmpdir(), 'release_publish_#%_'));
  try {
    const mock = join(root, 'mock_fetch.mjs');
    writeFileSync(mock, `globalThis.fetch = async (url, options = {}) => {
      if (options.method) throw new Error('No writes are allowed in this test');
      return { ok: true, json: async () => url.includes('/actions/')
        ? { workflow_runs: [{ head_sha: ${JSON.stringify(spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim())}, event: 'push', status: 'completed', conclusion: 'failure' }] }
        : { private: false } };
    };`);
    const config = JSON.parse(readFileSync('src_tauri/tauri.conf.json', 'utf8'));
    for (const localQA of ['false', 'true']) {
      const result = spawnSync(process.execPath, ['--import', pathToFileURL(mock).href, 'scripts/finalize_release.mjs', join(root, 'must_not_be_read.json')], {
        encoding: 'utf8', env: { ...process.env, PUBLISH_RELEASE: 'true', LOCAL_QA_PASSED: localQA, RELEASE_ID: '42', RELEASE_TAG: `v${config.version}`, GITHUB_REPOSITORY: 'example/app', GH_TOKEN: 'test_only' },
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, localQA === 'false' ? /confirm local QA/ : /exact commit/);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('finalization preserves the draft tag and publishes only verified packages; corruption leaves it untouched', () => {
  for (const publish of [false, true]) for (const corrupt of [false, true]) {
    const root = mkdtempSync(join(tmpdir(), 'release_finalize_#%_'));
    try {
      const config = { productName: 'Example App', version: '2.1.0', plugins: { updater: { pubkey: publicKey } } };
      const names = releaseAssets(config);
      const platforms = Object.fromEntries(['windows-x86_64', 'darwin-aarch64', 'darwin-x86_64'].map((platform) => [platform, {
        url: `https://github.com/example/app/releases/download/v2.1.0/${names[platform]}`, signature: signatures[1],
      }]));
      const assets = ['latest.json', ...Object.values(names)].map((name, id) => ({ id: id + 1, name, size: 4 }));
      mkdirSync(join(root, 'src_tauri'), { recursive: true }); mkdirSync(join(root, 'docs/release_notes'), { recursive: true });
      writeFileSync(join(root, 'src_tauri/tauri.conf.json'), JSON.stringify(config));
      writeFileSync(join(root, 'docs/release_notes/2.1.0.md'), '- Mở thư mục nhanh hơn.');
      const manifestPath = join(root, 'latest.json');
      writeFileSync(manifestPath, JSON.stringify({ version: '2.1.0', platforms }));
      const events = join(root, 'events.jsonl');
      const mock = join(root, 'mock_effects.mjs');
      writeFileSync(mock, `
        import cp from 'node:child_process';
        import { syncBuiltinESMExports } from 'node:module';
        import { appendFileSync, writeFileSync, readFileSync } from 'node:fs';
        import { join } from 'node:path';
        const log = (event) => appendFileSync(${JSON.stringify(events)}, JSON.stringify(event) + '\\n');
        cp.execFileSync = (command, args) => {
          if (command === 'git') return 'tested_commit';
          if (command !== 'gh') throw new Error('Unexpected executable');
          log(args[1]);
          if (args[1] === 'download') writeFileSync(join(${JSON.stringify(root)}, args[args.indexOf('--pattern') + 1]), ${JSON.stringify(corrupt ? 'Test' : 'test')});
        };
        syncBuiltinESMExports();
        globalThis.fetch = async (url, options = {}) => {
          if (options.method === 'HEAD') { log('public_package'); return { ok: true }; }
          if (options.method === 'PATCH') {
            const body = JSON.parse(options.body);
            log(body.draft === false ? 'publish' : 'finalize');
            // GitHub draft PATCH may replace an omitted tag with an untagged ID.
            return { ok: true, json: async () => ({ tag_name: body.tag_name ?? 'untagged_mock', draft: body.draft !== false }) };
          }
          const value = url.includes('/actions/')
            ? { workflow_runs: [{ head_sha: 'tested_commit', event: 'push', status: 'completed', conclusion: 'success' }] }
            : url.includes('api.github.com') && url.endsWith('/releases/latest') ? { tag_name: 'v1.9.9' }
            : url.endsWith('/releases/42') ? { id: 42, tag_name: 'v2.1.0', draft: true, assets: ${JSON.stringify(assets)} }
            : url.includes('github.com/example/app/releases/latest/') ? JSON.parse(readFileSync(${JSON.stringify(manifestPath)}, 'utf8'))
            : { private: false };
          return { ok: true, json: async () => value };
        };
      `);
      const script = new URL('./finalize_release.mjs', import.meta.url);
      const result = spawnSync(process.execPath, ['--import', pathToFileURL(mock).href, fileURLToPath(script), manifestPath], {
        cwd: root, encoding: 'utf8', env: { ...process.env, PUBLISH_RELEASE: String(publish), LOCAL_QA_PASSED: 'true', RELEASE_ID: '42', RELEASE_TAG: 'v2.1.0', GITHUB_REPOSITORY: 'example/app', GH_TOKEN: 'test_only' },
      });
      const recorded = readFileSync(events, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
      if (corrupt) {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /signature is invalid/);
        assert.ok(!recorded.includes('upload') && !recorded.includes('publish') && !recorded.includes('finalize'));
      } else {
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(recorded, ['download', 'download', 'download', 'upload', ...(publish ? ['publish', 'public_package', 'public_package', 'public_package'] : ['finalize'])]);
        assert.ok(JSON.parse(readFileSync(manifestPath)).notes.includes('Mở thư mục nhanh hơn.'));
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

// Exercise the custom CLI wrapper through npm, using the official Action's npm separator.
test('custom release CLI receives installer flags as Tauri options, not Cargo arguments', () => {
  const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
  const script = workflow.match(/^\s*tauriScript:\s*(.+)$/m)?.[1]?.trim();
  assert.ok(script, 'Expected the custom src_tauri CLI wrapper');
  const [bin, ...prefix] = script.split(/\s+/);
  const args = [...prefix, 'build', '--', '--bundles', process.platform === 'win32' ? 'nsis' : 'app,dmg', '--help'];
  // npm is a .cmd shim on Windows; CreateProcess cannot spawn it directly.
  // Keep the command fixed and validated before passing it through cmd.exe.
  assert.equal(bin, 'npm');
  assert.deepEqual(prefix, ['run', 'tauri']);
  const emptyTarget = mkdtempSync(join(tmpdir(), 'vx_cli_help_'));
  const helpEnv = {...process.env, CARGO_TARGET_DIR:emptyTarget};
  const result = process.platform === 'win32'
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', [bin, ...args].join(' ')], {cwd:'.', encoding:'utf8', timeout:30000, env:helpEnv})
    : spawnSync(bin, args, {cwd:'.', encoding:'utf8', timeout:30000, env:helpEnv});
  rmSync(emptyTarget, {recursive:true,force:true});
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  assert.match(result.stdout, /generate bundles and installers/);
  assert.match(result.stdout, /--bundles/);
});
