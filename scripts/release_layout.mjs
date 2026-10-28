import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export function assetPrefix(config) {
  const prefix = config.productName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  assert.ok(prefix, 'Product name must produce a non-empty asset prefix');
  return prefix;
}

export function releaseAssets(config) {
  const prefix = `${assetPrefix(config)}_${config.version}`;
  return {
    'windows-x86_64': `${prefix}_windows_x64_setup.exe`,
    'darwin-aarch64': `${prefix}_macos_silicon.app.tar.gz`,
    'darwin-x86_64': `${prefix}_macos_intel.app.tar.gz`,
    siliconInstaller: `${prefix}_macos_silicon.dmg`,
    intelInstaller: `${prefix}_macos_intel.dmg`,
  };
}

export function validateAssetLayout(config, manifest, assets) {
  const names = releaseAssets(config);
  const expected = ['latest.json', ...Object.values(names)];
  assert.equal(assets.length, expected.length, 'Release must contain exactly six uploaded assets');
  for (const name of expected) {
    assert.equal(assets.filter((asset) => asset.name === name && asset.size > 0).length, 1, `Missing or duplicate asset: ${name}`);
  }
  const supported = {
    'windows-x86_64': names['windows-x86_64'],
    'windows-x86_64-nsis': names['windows-x86_64'],
    'darwin-aarch64': names['darwin-aarch64'],
    'darwin-aarch64-app': names['darwin-aarch64'],
    'darwin-x86_64': names['darwin-x86_64'],
    'darwin-x86_64-app': names['darwin-x86_64'],
  };
  for (const platform of ['windows-x86_64', 'darwin-aarch64', 'darwin-x86_64']) { assert.ok(manifest.platforms?.[platform], `Missing platform: ${platform}`); }
  for (const [platform, entry] of Object.entries(manifest.platforms)) {
    assert.ok(supported[platform], `Unexpected platform: ${platform}`);
    const name = decodeURIComponent(new URL(entry.url).pathname.split('/').at(-1));
    assert.equal(name, supported[platform], `Wrong package architecture: ${platform}`);
  }
}

// Release authors write only user-visible changes; installation links are generated.
export function releaseNotes(config, repo, tag, notesRoot = 'docs/release_notes') {
  assert.equal(tag, `v${config.version}`, 'Notes version must match the release tag');
  const changes = readFileSync(`${notesRoot}/${config.version}.md`, 'utf8').trim();
  assert.ok(changes && !/\[(?:TODO|\.\.\.)\]/i.test(changes), 'Write end-user release notes before creating the tag');
  const names = releaseAssets(config);
  const url = (name) => `https://github.com/${repo}/releases/download/${tag}/${name}`;
  return `${changes}\n\n**Tải ứng dụng**\n\n- [Windows x64](${url(names['windows-x86_64'])})\n- [macOS Apple Silicon (dòng chip M)](${url(names.siliconInstaller)})\n- [macOS Intel](${url(names.intelInstaller)})\n\n**Cài đặt:** Windows: tải và chạy bộ cài .exe. macOS: mở DMG, kéo ${config.productName} vào Applications rồi mở từ đó. Hệ điều hành có thể yêu cầu cho phép mở ứng dụng lần đầu.\n\n**Đã cài ứng dụng?** Mở Cài đặt → Cập nhật để kiểm tra bản mới.\n`;
}

export function assertNewerVersion(version, previousTag) {
  const parse = (value) => {
    assert.match(value, /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
    return value.replace(/^v/, '').split('.').map(BigInt);
  };
  const current = parse(version);
  const previous = parse(previousTag);
  const difference = current.findIndex((value, index) => value !== previous[index]);
  assert.ok(difference >= 0 && current[difference] > previous[difference], 'New release must be newer than the current latest release');
}
