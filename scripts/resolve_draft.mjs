import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { findRelease } from './find_release.mjs';

const { GITHUB_REPOSITORY: repo, RELEASE_TAG: tag, GH_TOKEN: token, GITHUB_OUTPUT: output } = process.env;
assert.ok(repo && token && output, 'Missing workflow configuration');
assert.match(tag ?? '', /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
const release = await findRelease(repo, tag, token);
assert.ok(release && release.draft && !release.prerelease, 'An existing stable draft is required');
assert.ok(Number.isSafeInteger(release.id) && release.id > 0, 'Invalid release ID');
appendFileSync(output, `release_id=${release.id}\n`);
console.log(`Found existing draft ${tag}; no release created or published.`);
