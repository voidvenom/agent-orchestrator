#!/usr/bin/env bash
# Build a Linux x64 fork AppImage + feed locally. This script never publishes.
set -euo pipefail
action_version=${1:-}
if [[ $# != 1 || ! $action_version =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  printf 'Usage: %s <stable-semver> (for example, 0.15.4)\n' "$0" >&2
  exit 2
fi
if [[ $(uname -s):$(uname -m) != Linux:x86_64 ]]; then
  printf 'This helper only builds Linux x64 AppImages.\n' >&2
  exit 2
fi
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
if [[ ! -x node_modules/.bin/electron-forge || ! -d ../packages/product-ui/node_modules ]]; then
  printf 'Install locked dependencies with npm ci in frontend and packages/product-ui.\n' >&2
  exit 2
fi
node - "$action_version" <<'JS'
const semver = require("semver");
const version = process.argv[2];
const base = require("./package.json").version;
if (!semver.valid(version) || !semver.gte(version, base)) {
  throw new Error(`Build version must be a valid stable release at least as new as ${base}`);
}
JS
export AO_RELEASE_REPO=voidvenom/agent-orchestrator VITE_AO_MANUAL_LINUX_UPDATES=1
export AO_MAKE_OUT="$PWD/out/voidvenom-linux-$action_version"
export BUILD_VERSION="$action_version"
# Refuse to overwrite an existing release tree, including a prior failed build.
mkdir -p -- out
mkdir -- "$AO_MAKE_OUT"
backup=$(mktemp)
cp -- package.json "$backup"
cleanup() {
  cp -- "$backup" package.json
  rm -f -- "$backup"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
node <<'JS'
const fs = require("node:fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.version = process.env.BUILD_VERSION;
fs.writeFileSync("package.json", JSON.stringify(pkg, null, "\t") + "\n");
JS
# Do not inherit npm's root allow-scripts setting into the locked nested install.
env -u npm_config_allow_scripts -u NPM_CONFIG_ALLOW_SCRIPTS -u npm_execpath node scripts/build-acp-runtime.mjs
npm run premake
node <<'JS'
const { api } = require("@electron-forge/core");
api.make({
  dir: process.cwd(),
  outDir: process.env.AO_MAKE_OUT,
  platform: "linux",
  arch: "x64",
  overrideTargets: ["appimage"],
  interactive: false,
}).catch((err) => { console.error(err); process.exitCode = 1; });
JS
export AO_RELEASE_DIR="$AO_MAKE_OUT/release"
mkdir -- "$AO_RELEASE_DIR"
install -m 755 -- "$AO_MAKE_OUT/make/Agent Orchestrator-$action_version.AppImage" \
  "$AO_RELEASE_DIR/Orchestrator-Custom-$action_version.AppImage"
node --input-type=module <<'JS'
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateFeeds, hashFile } from "./scripts/feed.mjs";
const dir = process.env.AO_RELEASE_DIR;
const version = process.env.BUILD_VERSION;
const file = `Orchestrator-Custom-${version}.AppImage`;
const image = join(dir, file);
// Calling the module API also works from paths with non-ASCII characters.
await generateFeeds(dir, version, "latest", new Date().toISOString());
const yml = readFileSync(join(dir, "latest-linux.yml"), "utf8");
const { sha512, size } = hashFile(image);
if (!yml.includes(`version: ${version}\n`) || !yml.includes(`url: ${file}\n`) ||
    !yml.includes(`sha512: ${sha512}\n`) || !yml.includes(`size: ${size}\n`)) {
  throw new Error("The updater feed does not match the staged AppImage");
}
const baked = readFileSync(join(process.env.AO_MAKE_OUT, "Agent Orchestrator-linux-x64", "resources", "app-update.yml"), "utf8");
if (!baked.includes("owner: voidvenom\n") || !baked.includes("repo: agent-orchestrator\n") ||
    !baked.includes("updaterCacheDirName: voidvenom-agent-orchestrator-updater\n")) {
  throw new Error("The build did not embed the fork-only feed/cache");
}
console.log(`Prepared, not published: ${image} and latest-linux.yml`);
JS
