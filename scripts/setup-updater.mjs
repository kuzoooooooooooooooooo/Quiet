// Run locally or in your own Codespace. Private key contents never go to logs or Git.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repository, validatePublicKey } from './release.mjs';

const directory = join(homedir(), '.quiet-updater');
const key = join(directory, 'quiet.key');
const run = (cmd, args, input) =>
  execFileSync(cmd, args, { input, stdio: ['pipe', 'pipe', 'pipe'] });
try {
  run('gh', ['auth', 'status']);
  const variables = JSON.parse(
    run('gh', ['variable', 'list', '--repo', repository, '--json', 'name,value']).toString(),
  );
  const existingPublicKey = variables
    .find((item) => item.name === 'TAURI_UPDATER_PUBLIC_KEY')
    ?.value?.trim();
  const secrets = JSON.parse(
    run('gh', ['secret', 'list', '--repo', repository, '--json', 'name']).toString(),
  );
  if (
    !existsSync(key) &&
    (existingPublicKey || secrets.some((item) => item.name === 'TAURI_SIGNING_PRIVATE_KEY'))
  ) {
    throw new Error(
      'Updater signing is already configured on GitHub. Restore your original key backup to ~/.quiet-updater before running setup; do not generate a replacement.',
    );
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!existsSync(key)) {
    if (existsSync(key + '.pub'))
      throw new Error(
        'A public key exists without its private key. Restore your backup; do not replace a released signing key.',
      );
    run(process.execPath, [
      fileURLToPath(new URL('../node_modules/@tauri-apps/cli/tauri.js', import.meta.url)),
      'signer',
      'generate',
      '--ci',
      '--write-keys',
      key,
    ]);
  }
  chmodSync(key, 0o600);
  const publicKey = readFileSync(key + '.pub', 'utf8').trim();
  validatePublicKey(publicKey);
  if (existingPublicKey && existingPublicKey !== publicKey)
    throw new Error(
      'Local and GitHub signing keys differ. Restore the original key pair before continuing.',
    );
  run(
    'gh',
    ['secret', 'set', 'TAURI_SIGNING_PRIVATE_KEY', '--repo', repository],
    readFileSync(key),
  );
  run('gh', ['variable', 'set', 'TAURI_UPDATER_PUBLIC_KEY', '--repo', repository], publicKey);
  console.log(`Updater configured for ${repository}.`);
  console.log(
    `Back up ${directory} privately before deleting this Codespace. Keep this key for every future release.`,
  );
} catch (error) {
  // CLI failures may contain signing material; never print their captured output.
  console.error(
    error instanceof Error && !('stderr' in error)
      ? error.message
      : 'Setup failed. Check gh authentication and repository Secrets/Variables permissions, then run this command again. Existing keys are kept.',
  );
  process.exitCode = 1;
}
