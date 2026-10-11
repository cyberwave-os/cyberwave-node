import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRelease } from '../scripts/check-release.mjs';
import { needsPublish } from '../scripts/publish-packages.mjs';

const manifests = (version = '0.1.0') => [
  { name: 'cyberwave', version },
  { name: '@cyberwave/environment-3d', version, dependencies: { cyberwave: 'workspace:^' } },
  { name: '@cyberwave/react', version, dependencies: { cyberwave: 'workspace:^' } },
];
test('release checks keep the client and frontend packages on one version', () => {
  assert.deepEqual(validateRelease('v0.1.0', manifests()), { version: '0.1.0', distTag: 'latest' });
  assert.deepEqual(validateRelease('v0.2.0-rc.1', manifests('0.2.0-rc.1')), { version: '0.2.0-rc.1', distTag: 'next' });
  assert.equal(validateRelease('v0.2.0-1beta', manifests('0.2.0-1beta')).distTag, 'next');
  assert.throws(() => validateRelease('v0.2.0', manifests()), /version/);
  assert.throws(() => validateRelease('v0.1.0', manifests().slice(1)), /three/);
  const packages = manifests();
  packages[2].dependencies!.cyberwave = '^0.0.1';
  assert.throws(() => validateRelease('v0.1.0', packages), /workspace client/);
});
test('non-version tags cannot authorize a release', () => {
  for (const tag of ['', 'main', '0.1.0', 'v01.2.3', 'v1.2.3-01', 'v1.2.3-bad_tag', 'v1.2.3;echo']) assert.throws(() => validateRelease(tag, manifests()), /semantic version/);
});
test('partial releases resume only for identical already-published archives', () => {
  assert.equal(needsPublish('sha512-abc', { error: { code: 'E404' } }), true);
  assert.equal(needsPublish('sha512-abc', 'sha512-abc'), false);
  assert.throws(() => needsPublish('sha512-abc', 'sha512-other'), /different bytes/);
  for (const code of ['E401', 'E403', 'E500', 'ETIMEDOUT']) assert.throws(() => needsPublish('sha512-abc', { error: { code } }), /lookup failed/);
});
