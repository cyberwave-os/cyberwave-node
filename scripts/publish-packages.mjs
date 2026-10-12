import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRelease } from './check-release.mjs';

// npm releases are not atomic across packages. A retry may skip only the exact
// bytes already published; registry/network errors must not look like a 404.
export function needsPublish(localIntegrity, result) {
  if (result.error?.code === 'E404') return true;
  if (result.error) throw new Error(`Registry lookup failed: ${result.error.code}`);
  if (result !== localIntegrity) throw new Error('Published version has different bytes; use a new version');
  return false;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, tag] = process.argv.slice(2);
  if (!directory || !tag) throw new Error('Usage: publish-packages.mjs <tarball-directory> <vVERSION>');
  const version = tag.slice(1);
  // Validate before a tag can be used as a path or argument.
  validateRelease(tag, ['cyberwave', '@cyberwave/environment-3d', '@cyberwave/react'].map(name => ({ name, version, dependencies: { cyberwave: 'workspace:^' } })));
  const archives = ['cyberwave', 'cyberwave-environment-3d', 'cyberwave-react'].map(name => join(directory, `${name}-${version}.tgz`));
  const manifests = archives.map(path => JSON.parse(execFileSync('tar', ['-xOf', path, 'package/package.json'], { encoding: 'utf8' })));
  // pnpm replaces workspace:^ with a concrete version range in the tarballs.
  for (const pkg of manifests) if (pkg.name !== 'cyberwave' && pkg.dependencies?.cyberwave !== `^${version}`) throw new Error('Packed component references the wrong client version');
  const { distTag } = validateRelease(tag, manifests.map(pkg => ({ ...pkg, dependencies: { ...pkg.dependencies, cyberwave: 'workspace:^' } })));
  for (let index = 0; index < archives.length; index++) {
    const path = archives[index], pkg = manifests[index];
    const integrity = `sha512-${createHash('sha512').update(await readFile(path)).digest('base64')}`;
    let result;
    try {
      result = JSON.parse(execFileSync('npm', ['view', `${pkg.name}@${version}`, 'dist.integrity', '--json', '--registry=https://registry.npmjs.org'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    } catch (error) {
      if (!error.stdout) throw error;
      result = JSON.parse(error.stdout.toString());
      if (!result.error) throw error;
    }
    if (!needsPublish(integrity, result)) { console.log(`${pkg.name}@${version} already contains this archive`); continue; }
    execFileSync('npm', ['publish', path, '--access=public', '--provenance', '--registry=https://registry.npmjs.org', '--tag', distTag], { stdio: 'inherit' });
  }
}
