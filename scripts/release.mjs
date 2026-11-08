import { readFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repository = 'kuzoooooooooooooooooo/Quiet';
export function validateVersions(tag, pkg, config, cargo) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error('Use a stable version tag such as v0.6.0.');
  const version = tag.slice(1);
  const packageSection = cargo.split('[package]')[1]?.split('\n[')[0];
  const rustVersion = packageSection?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if ([pkg.version, config.version, rustVersion].some((value) => value !== version)) {
    throw new Error('The tag, package.json, tauri.conf.json and Cargo.toml versions must match.');
  }
  return version;
}
export function validatePublicKey(key) {
  if (!key || !/^[A-Za-z0-9+/=]+$/.test(key.trim()))
    throw new Error('Set TAURI_UPDATER_PUBLIC_KEY to the contents of quiet.key.pub.');
  const text = Buffer.from(key.trim(), 'base64').toString('utf8');
  const payload = text.trim().split(/\r?\n/).at(-1);
  if (
    !text.startsWith('untrusted comment:') ||
    !payload ||
    Buffer.from(payload, 'base64').length !== 42
  ) {
    throw new Error('TAURI_UPDATER_PUBLIC_KEY is not a Tauri updater public key.');
  }
}
export function validateManifest(manifest, version, directory) {
  if (manifest.version !== version)
    throw new Error('Update manifest version does not match the release.');
  const platform = manifest.platforms?.['windows-x86_64'];
  if (!platform?.signature?.trim()) throw new Error('Missing signed Windows update.');
  const url = new URL(platform.url);
  if (
    url.origin !== 'https://github.com' ||
    !url.pathname.startsWith(`/${repository}/releases/download/v${version}/`) ||
    !url.pathname.endsWith('.exe')
  ) {
    throw new Error('Update URL must point to this release’s Windows installer.');
  }
  const filename = decodeURIComponent(basename(url.pathname));
  const installer = join(directory, filename);
  if (!existsSync(installer))
    throw new Error('Installer referenced by latest.json was not uploaded.');
  if (readFileSync(installer + '.sig', 'utf8').trim() !== platform.signature.trim()) {
    throw new Error('Update signature does not match the uploaded signature file.');
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, tag, directory] = process.argv.slice(2);
  const version = validateVersions(
    tag,
    JSON.parse(readFileSync('package.json')),
    JSON.parse(readFileSync('src-tauri/tauri.conf.json')),
    readFileSync('src-tauri/Cargo.toml', 'utf8'),
  );
  if (mode === 'preflight') {
    validatePublicKey(process.env.QUIET_UPDATER_PUBLIC_KEY);
    if (!process.env.TAURI_SIGNING_PRIVATE_KEY)
      throw new Error('Set the TAURI_SIGNING_PRIVATE_KEY repository secret.');
  } else if (mode === 'verify') {
    validateManifest(JSON.parse(readFileSync(join(directory, 'latest.json'))), version, directory);
  } else throw new Error('Use preflight or verify.');
  console.log(`Release ${tag}: ${mode} passed.`);
}
