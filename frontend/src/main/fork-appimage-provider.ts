import type { AppUpdater } from "electron-updater";
import type { CustomPublishOptions, UpdateInfo } from "builder-util-runtime";
import { GenericProvider } from "electron-updater/out/providers/GenericProvider";
import { resolveFiles, type ProviderRuntimeOptions } from "electron-updater/out/providers/Provider";
import semver from "semver";
import { manualLinuxUpdateRepo } from "../shared/manual-linux-updates";

const releaseRoot = `https://github.com/${manualLinuxUpdateRepo.owner}/${manualLinuxUpdateRepo.repo}/releases/`;

/** The fork serves a stable manifest without relying on the delayed GitHub Atom feed. */
export class ForkAppImageProvider extends GenericProvider {
  constructor(_options: CustomPublishOptions, updater: AppUpdater, runtime: ProviderRuntimeOptions) {
    super({ provider: "generic", url: `${releaseRoot}latest/download/` }, updater, {
      ...runtime,
      isUseMultipleRangeRequest: false,
    });
  }

  override async getLatestVersion(): Promise<UpdateInfo> {
    const info = await super.getLatestVersion();
    this.resolveFiles(info);
    return info;
  }

  override resolveFiles(updateInfo: UpdateInfo) {
    const version = semver.valid(updateInfo.version);
    if (!version || version !== updateInfo.version || !/^\d+\.\d+\.\d+$/.test(version)) {
      throw new Error("The fork update manifest does not identify a stable version.");
    }
    // Resolve against the checked release, not a /latest redirect that can
    // advance between Check and Download. Mirror the fork helper's filename.
    const base = new URL(`${releaseRoot}download/v${version}/`);
    const expected = new URL(`Orchestrator-Custom-${version}.AppImage`, base);
    const files = resolveFiles(updateInfo, base);
    if (files.length !== 1 || files[0]?.url.href !== expected.href) {
      throw new Error("The fork update manifest identifies an unexpected AppImage.");
    }
    return files;
  }
}
