# Windows releases

Quiet uses public GitHub Releases in `kuzoooooooooooooooooo/Quiet`. The updater checks
`https://github.com/kuzoooooooooooooooooo/Quiet/releases/latest/download/latest.json`.
It accepts only newer versions and verifies the downloaded installer with the public
key compiled into the app. The first updater-enabled version must be installed manually.

## One-time setup in your Codespace

After merging the updater changes, run:

```bash
git pull --ff-only
npm ci
npm run release:setup
```

The setup command requires an authenticated GitHub CLI (`gh auth status`) with permission
to manage this repository's Actions secrets and variables. If your Codespace's built-in
credential cannot do that, authenticate the CLI with your own account:

```bash
unset GH_TOKEN GITHUB_TOKEN
gh auth login --web --git-protocol https --scopes repo,workflow
npm run release:setup
```

Alternatively, configure the values in GitHub's **Settings → Secrets and variables → Actions**. Never put a key
or token in chat, a workflow file, or Git.

Setup generates a signing key pair at `~/.quiet-updater/quiet.key` and `.key.pub`, then sets:

| GitHub setting | Name                        | Value                              |
| -------------- | --------------------------- | ---------------------------------- |
| Secret         | `TAURI_SIGNING_PRIVATE_KEY` | Entire contents of `quiet.key`     |
| Variable       | `TAURI_UPDATER_PUBLIC_KEY`  | Entire contents of `quiet.key.pub` |

The helper generates an unencrypted private key so Actions can use it without a password;
GitHub stores the secret encrypted. Keep a private backup of the key directory before
deleting your Codespace. The helper reuses an existing local pair and refuses to replace
an existing GitHub signing identity with a newly generated key.

For a password-protected pair generated manually with `npx tauri signer generate`, also
set the secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to its password. The setup helper is
for the unencrypted pair it generates; do not use it to replace an existing protected key.

The same signing identity must be kept for all updates. Losing or replacing it breaks
updates for installed copies. Signing-key migration needs a release trusted by the old key.
Updater signing is separate from a Windows Authenticode certificate; these installers
are not Windows code-signed yet and Windows may show an unknown-publisher prompt.

## Publish 0.6.0

Ensure these changes are on `main` and the signing setup succeeded. Then:

```bash
git switch main
git pull --ff-only
git tag v0.6.0
git push origin v0.6.0
```

Open **Actions → Release Windows**. The workflow validates the tag against all three
version files and refuses to replace an already-published version. It builds a Windows
x64 NSIS installer and signed update assets, uploads them to a draft release, downloads
the uploaded files for consistency checks, then publishes the complete release.

The app's updater only sees published stable releases. If a build fails, inspect the run
and retry after fixing its cause; an incomplete draft is not an update. Never manually
publish a failed draft. Publishing a GitHub Release directly does not run the build;
**pushing the version tag is the trigger**.

Download the `*-setup.exe` from **Releases → Quiet v0.6.0 → Assets** and install it once.
An older 0.5 app does not have an updater and cannot bootstrap this itself.

## Future releases

1. Update the version together in `package.json`, `package-lock.json`,
   `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` and `src-tauri/tauri.conf.json`.
2. Merge the tested changes to `main`.
3. Push a matching stable tag, for example `v0.6.1`.
4. After **Release Windows** succeeds, installed apps offer the newer version.

`Build Windows` is a separate unsigned artifact build for pull requests and manual checks.
It does not publish a release. `npm run desktop:build` likewise does not require the signing
key; signing is enabled only by `src-tauri/tauri.release.conf.json` in the release workflow.

## Validate before publishing

```bash
npm run build
npm test
npm run test:release
npm run test:rust
```

Browser tests use an updater adapter to exercise checks, errors, progress and installation
ordering; they do not run a Windows installer. Verify the full native path with two real
signed releases on Windows (for example install 0.6.0, then publish 0.6.1): check for updates,
install, and confirm the version and project data after relaunch.
