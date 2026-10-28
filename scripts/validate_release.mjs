import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const pkg = readJson('package.json');
const config = readJson('src_tauri/tauri.conf.json');
const lock = readJson('package-lock.json');
const cargo = readFileSync('src_tauri/Cargo.toml', 'utf8');
const cargoLock = readFileSync('src_tauri/Cargo.lock', 'utf8');
const tag = process.argv[2] ?? `v${pkg.version}`;
assert.match(tag, /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
assert.equal(tag, `v${pkg.version}`, 'Tag must match package.json');
assert.equal(config.version, pkg.version, 'Tauri version mismatch');
assert.equal(lock.version, pkg.version, 'npm lockfile version mismatch');
assert.equal(lock.packages?.['']?.version, pkg.version, 'npm root version mismatch');
const section = cargo.match(/^\[package\]\s*\r?\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1];
const rustName = section?.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
assert.ok(rustName, 'Template needs direct Cargo package name');
assert.equal(section?.match(/^version\s*=\s*"([^"]+)"/m)?.[1], pkg.version, 'Cargo version mismatch');
const appPackage = cargoLock.split('[[package]]').find((entry) => entry.match(/^name\s*=\s*"([^"]+)"/m)?.[1] === rustName);
assert.equal(appPackage?.match(/^version\s*=\s*"([^"]+)"/m)?.[1], pkg.version, 'Cargo.lock version mismatch');
const publicKey = Buffer.from(config.plugins?.updater?.pubkey ?? '', 'base64').toString('utf8').trim().split('\n').at(-1);
assert.equal(Buffer.from(publicKey ?? '', 'base64').length, 42, 'Invalid updater public key');
assert.equal(config.bundle?.createUpdaterArtifacts, true);
// Default free-distribution profile. Adapt these checks for an existing signed app.
assert.equal(config.bundle.macOS?.signingIdentity, '-');
if (process.env.GITHUB_REPOSITORY) {
  assert.deepEqual(config.plugins.updater.endpoints, [`https://github.com/${process.env.GITHUB_REPOSITORY}/releases/latest/download/latest.json`]);
}
console.log(`${config.productName} ${tag}: versions and default updater distribution profile valid.`);
