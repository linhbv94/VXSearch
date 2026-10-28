import assert from 'node:assert/strict';

// The tag lookup only returns published releases. Listing includes authorized drafts.
export async function findRelease(repo, tag, token) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  for (let page = 1; page <= 10; page++) {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`, { headers });
    assert.ok(response.ok, `Could not list releases: HTTP ${response.status}`);
    const releases = await response.json();
    assert.ok(Array.isArray(releases), 'Invalid release list');
    const matches = releases.filter((release) => release.tag_name === tag);
    assert.ok(matches.length <= 1, 'Multiple releases for this tag; resolve duplicates before retrying');
    if (matches.length) return matches[0];
    if (releases.length < 100) return undefined;
  }
  throw new Error('Release search exceeded 1000 entries; stop instead of creating a possible duplicate');
}
