// @vitest-environment node
import type { UpdateInfo } from "builder-util-runtime";
import type { AppUpdater } from "electron-updater";
import { ElectronHttpExecutor } from "electron-updater/out/electronHttpExecutor";
import { describe, expect, it, vi } from "vitest";
import { ForkAppImageProvider } from "./fork-appimage-provider";

const artifact = "Orchestrator-Custom-0.15.5.AppImage";
const manifest = `version: 0.15.5
files:
  - url: ${artifact}
    sha512: test-digest
    size: 42
path: ${artifact}
sha512: test-digest
releaseDate: "2026-11-22T00:00:00.000Z"
`;

function provider() {
  const executor = new ElectronHttpExecutor();
  const request = vi.spyOn(executor, "request").mockResolvedValue(manifest);
  const updater = { channel: "latest", isAddNoCacheQuery: false } as unknown as AppUpdater;
  return {
    fixed: new ForkAppImageProvider({ provider: "custom", updateProvider: ForkAppImageProvider }, updater, {
      platform: "linux", executor, isUseMultipleRangeRequest: true,
    }),
    request,
  };
}

describe("the fork Linux AppImage feed", () => {
  it("reads only the stable manifest and resolves the artifact at its exact release tag", async () => {
    const { fixed, request } = provider();
    const info = await fixed.getLatestVersion();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      protocol: "https:",
      hostname: "github.com",
      path: "/voidvenom/agent-orchestrator/releases/latest/download/latest-linux.yml",
    }), undefined);
    expect(fixed.isUseMultipleRangeRequest).toBe(false);
    const [file] = fixed.resolveFiles(info);
    expect(file.url.href).toBe(`https://github.com/voidvenom/agent-orchestrator/releases/download/v0.15.5/${artifact}`);
    expect(file.info).toMatchObject({ sha512: "test-digest", size: 42 });
  });

  it.each(["https://example.com/file.AppImage", "../other.AppImage", "another.AppImage"])(
    "does not accept an unexpected artifact URL %s", async (url) => {
      const { fixed } = provider();
      const info = await fixed.getLatestVersion();
      expect(() => fixed.resolveFiles({ ...info, files: [{ ...info.files[0], url }] })).toThrow("unexpected AppImage");
    },
  );

  it.each(["v0.15.5", "0.15.5-nightly.1", "0.15.5+test"])("rejects non-canonical stable version %s", async (version) => {
    const { fixed } = provider();
    const info: UpdateInfo = await fixed.getLatestVersion();
    expect(() => fixed.resolveFiles({ ...info, version })).toThrow("stable version");
  });
});
