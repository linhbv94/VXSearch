import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
assert.match(version ?? '', /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'Use a stable SemVer version');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const pkg = readJson('package.json');
const config = readJson('src_tauri/tauri.conf.json');
const lock = readJson('package-lock.json');
const cargo = readFileSync('src_tauri/Cargo.toml', 'utf8');
const cargoLock = readFileSync('src_tauri/Cargo.lock', 'utf8');
const section = cargo.match(/^\[package\]\s*\r?\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1];
const rustName = section?.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
const oldVersion = section?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
assert.ok(rustName && oldVersion, 'Template needs direct Cargo package name/version; adapt for workspace inheritance');
assert.ok(lock.packages?.[''], 'Template needs npm lockfile v2/v3');
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const packagePattern = new RegExp('(\\[\\[package\\]\\]\\r?\\nname = "' + escape(rustName) + '"\\r?\\nversion = ")[^"]+(")');
assert.ok(packagePattern.test(cargoLock), 'App package not found in Cargo.lock');
const newSection = section.replace(/^(version\s*=\s*")[^"]+(")/m, `$1${version}$2`);
// Validate every input before writing any file.
lock.name = lock.packages[''].name = pkg.name;
pkg.version = config.version = lock.version = lock.packages[''].version = version;
for (const [path, value] of [['package.json', pkg], ['package-lock.json', lock], ['src_tauri/tauri.conf.json', config]]) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
writeFileSync('src_tauri/Cargo.toml', cargo.replace(section, newSection));
writeFileSync('src_tauri/Cargo.lock', cargoLock.replace(packagePattern, `$1${version}$2`));
console.log(`Version set to ${version}. Review the diff before commit/tag.`);
