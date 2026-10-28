import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { releaseNotes, assertNewerVersion } from './release_layout.mjs';
import { verifySignature } from './verify_signature.mjs';

const config = JSON.parse(readFileSync('src_tauri/tauri.conf.json', 'utf8'));
const { GITHUB_REPOSITORY: repo, RELEASE_TAG: tag, RELEASE_ID: releaseId, GH_TOKEN: token } = process.env;
assert.ok(repo && token && /^[1-9]\d*$/.test(releaseId ?? ''), 'Missing release target');
assert.equal(tag, `v${config.version}`);
const publish = process.env.PUBLISH_RELEASE === 'true';
const manifestPath = process.argv[2];
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
const base = `https://api.github.com/repos/${repo}`;
async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, `GitHub request failed: ${path} HTTP ${response.status}`);
  return response.json();
}
assert.equal((await api('')).private, false, 'Only public repositories are supported by this free release profile');

if (publish) {
  assert.equal(process.env.LOCAL_QA_PASSED, 'true', 'Publishing requires the release author to confirm local QA');
  // Dispatching publish must never turn a failed native build into a public release.
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const workflow = process.env.RELEASE_WORKFLOW || 'release.yml';
  const runs = await api(`/actions/workflows/${encodeURIComponent(workflow)}/runs?head_sha=${sha}&per_page=100`);
  const run = runs.workflow_runs.find((item) => item.head_sha === sha && ['push', 'workflow_dispatch'].includes(item.event));
  assert.ok(run && run.status === 'completed' && run.conclusion === 'success', 'The native release workflow must finish successfully for this exact commit');
  const latestResponse = await fetch(`${base}/releases/latest`, { headers, signal: AbortSignal.timeout(30000) });
  if (latestResponse.status !== 404) {
    assert.ok(latestResponse.ok, `Could not check latest release: HTTP ${latestResponse.status}`);
    assertNewerVersion(config.version, (await latestResponse.json()).tag_name);
  }
}

// Read drafts by ID, normalize all URLs, and enforce the six-file layout.
process.env.RELEASE_STRICT_LAYOUT = 'true';
await import('./validate_updater.mjs');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const downloaded = new Map();
for (const [platform, entry] of Object.entries(manifest.platforms)) {
  const name = decodeURIComponent(new URL(entry.url).pathname.split('/').at(-1));
  assert.match(name, /^[a-z0-9_.]+$/);
  if (!downloaded.has(name)) {
    execFileSync('gh', ['release', 'download', tag, '--repo', repo, '--pattern', name, '--dir', dirname(manifestPath), '--clobber'], { stdio: 'inherit', timeout: 180000 });
    downloaded.set(name, readFileSync(join(dirname(manifestPath), name)));
  }
  verifySignature(downloaded.get(name), config.plugins.updater.pubkey, entry.signature);
  console.log(`Verified signed package: ${platform}`);
}
manifest.notes = releaseNotes(config, repo, tag);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const current = await api(`/releases/${releaseId}`);
assert.equal(current.tag_name, tag);
assert.equal(current.draft, true, 'Never replace packages or notes of an already published release');
execFileSync('gh', ['release', 'upload', tag, manifestPath, '--repo', repo, '--clobber'], { stdio: 'inherit', timeout: 120000 });
const updated = await api(`/releases/${releaseId}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tag_name: tag, body: manifest.notes, draft: !publish, prerelease: false, ...(publish ? { make_latest: 'true' } : {}) }),
});
assert.equal(updated.tag_name, tag, 'GitHub changed the release tag during finalization');
assert.equal(updated.draft, !publish, 'GitHub returned an unexpected publication state');
if (publish) {
  // A failed public check is reported after publication; never overwrite/re-publish.
  const publicUrl = `https://github.com/${repo}/releases/latest/download/latest.json`;
  let publicManifest;
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(publicUrl, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
    if (response.ok) {
      const value = await response.json();
      if (value.version === config.version) { publicManifest = value; break; }
    }
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  assert.ok(publicManifest, 'Release published, but latest endpoint is not ready; check again without replacing this release');
  assert.deepEqual(publicManifest.platforms, manifest.platforms, 'Public manifest differs from the verified manifest');
  for (const url of new Set(Object.values(publicManifest.platforms).map((entry) => entry.url))) {
    const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(30000) });
    assert.ok(response.ok, `Published package is not publicly downloadable: HTTP ${response.status}`);
  }
  console.log(`Published and publicly accessible: https://github.com/${repo}/releases/tag/${tag}`);
} else {
  console.log('Draft ready: all platform signatures verified; run Publish tested release after local QA is confirmed.');
}
