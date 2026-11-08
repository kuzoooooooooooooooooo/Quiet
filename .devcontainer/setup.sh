#!/usr/bin/env bash
set -euo pipefail
sudo apt-get update
sudo apt-get install -y --no-install-recommends libwebkit2gtk-4.1-dev build-essential pkg-config libxdo-dev libssl-dev librsvg2-dev libayatana-appindicator3-dev patchelf
npm ci
cargo fetch --manifest-path src-tauri/Cargo.toml
printf '\nQuiet is ready. Run: npm run dev\n'
