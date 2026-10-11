import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function validateRelease(tag, manifests) {
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?$/.test(tag)) throw new Error('Use a v-prefixed semantic version, optionally with a prerelease');
  const version = tag.slice(1);
  const names = ['cyberwave', '@cyberwave/environment-3d', '@cyberwave/react'];
  if (manifests.length !== names.length || names.some(name => manifests.filter(pkg => pkg.name === name).length !== 1)) throw new Error('Expected the three public SDK packages');
  for (const pkg of manifests) {
    if (pkg.version !== version || pkg.private) throw new Error(`${pkg.name} must be public and have version ${version}`);
    if (pkg.name !== 'cyberwave' && pkg.dependencies?.cyberwave !== 'workspace:^') throw new Error(`${pkg.name} must depend on this workspace client`);
  }
  return { version, distTag: version.includes('-') ? 'next' : 'latest' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifests = await Promise.all(['../package.json', '../packages/environment-3d/package.json', '../packages/react/package.json'].map(async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))));
  console.log(validateRelease(process.argv[2] ?? '', manifests));
}
