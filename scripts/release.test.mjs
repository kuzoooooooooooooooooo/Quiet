import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repository, validateVersions, validatePublicKey, validateManifest } from './release.mjs';
const cargo = '[package]\nname = "quiet-workspace"\nversion = "0.6.0"\n[dependencies]\nx = "0.1"';
test('only matching stable tags can be released', () => {
  assert.equal(
    validateVersions('v0.6.0', { version: '0.6.0' }, { version: '0.6.0' }, cargo),
    '0.6.0',
  );
  for (const tag of ['main', 'v0.6.0-beta.1', 'v0.7.0']) {
    assert.throws(() => validateVersions(tag, { version: '0.6.0' }, { version: '0.6.0' }, cargo));
  }
  assert.throws(() =>
    validateVersions('v0.6.0', { version: '0.6.0' }, { version: '0.5.0' }, cargo),
  );
  assert.throws(() =>
    validateVersions(
      'v0.6.0',
      { version: '0.6.0' },
      { version: '0.6.0' },
      cargo.replace('0.6.0', '0.5.0'),
    ),
  );
});
test('missing, placeholder and private key data cannot be used as a public key', () => {
  for (const value of ['', 'YOUR_KEY', Buffer.from('not a public key').toString('base64')]) {
    assert.throws(() => validatePublicKey(value));
  }
  const publicKey = Buffer.from(
    'untrusted comment: minisign public key\n' + Buffer.alloc(42).toString('base64'),
  ).toString('base64');
  assert.doesNotThrow(() => validatePublicKey(publicKey));
});
test('a release must contain the installer and the matching manifest signature', () => {
  const directory = mkdtempSync(join(tmpdir(), 'quiet-release-'));
  const installer = 'Quiet_0.6.0_x64-setup.exe';
  const manifest = {
    version: '0.6.0',
    platforms: {
      'windows-x86_64': {
        url: `https://github.com/${repository}/releases/download/v0.6.0/${installer}`,
        signature: 'test-signature',
      },
    },
  };
  try {
    assert.throws(() => validateManifest(manifest, '0.6.0', directory));
    writeFileSync(join(directory, installer), 'fixture installer');
    writeFileSync(join(directory, installer + '.sig'), 'test-signature\n');
    assert.doesNotThrow(() => validateManifest(manifest, '0.6.0', directory));
    assert.throws(() => validateManifest(manifest, '0.7.0', directory));
    const platform = manifest.platforms['windows-x86_64'];
    const originalUrl = platform.url;
    platform.url = originalUrl.replace('github.com', 'example.com');
    assert.throws(() => validateManifest(manifest, '0.6.0', directory));
    platform.url = originalUrl;
    platform.signature = 'wrong-signature';
    assert.throws(() => validateManifest(manifest, '0.6.0', directory));
    assert.throws(() => validateManifest({ version: '0.6.0', platforms: {} }, '0.6.0', directory));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
