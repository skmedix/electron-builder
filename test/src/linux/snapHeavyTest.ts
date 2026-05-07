import { Arch, Platform } from "app-builder-lib"
import { log } from "builder-util"
import { execSync, spawnSync } from "child_process"
import { existsSync } from "fs"
import { readdir } from "fs/promises"
import * as path from "path"
import * as which from "which"
import { app, assertPack, EXTENDED_TIMEOUT, snapTarget } from "../helpers/packTester"
import { startXvfb } from "../helpers/launchAppCrossPlatform"

// very slow

// Guard: tests run when:
//   - RUN_SNAP_TESTS=true  (set by test-snap.sh inside the Docker container, where
//     "snap" the snapd client is absent but "snapcraft" is present), OR
//   - the "snap" snapd client is found in PATH (native Linux install), OR
//   - the "snapcraft" CLI is found in PATH (e.g. installed via pip / brew)
export const hasSnapInstalled = () => process.env.RUN_SNAP_TESTS === "true" || which.sync("snap", { nothrow: true }) != null || which.sync("snapcraft", { nothrow: true }) != null

// Whether install+launch tests should run. Requires unsquashfs on PATH (part of squashfs-tools,
// pre-installed in both snapcraft Docker images).
const canRunInstallTests = () => (process.env.RUN_SNAP_TESTS === "true" || process.platform === "linux") && which.sync("unsquashfs", { nothrow: true }) != null

// Optional core filter: SNAP_TEST_CORES=core24  (comma-separated)
// When unset every core is tested.
const requestedCores = process.env.SNAP_TEST_CORES ? process.env.SNAP_TEST_CORES.split(",").map(s => s.trim()) : null
const allCores = ["core24", "core22", "core20", "core18"]
const testCores = requestedCores ? allCores.filter(c => requestedCores.includes(c)) : allCores

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Find the single .snap file in outDir, throw if none or multiple. */
async function findSnapArtifact(outDir: string): Promise<string> {
  const entries = await readdir(outDir)
  const snaps = entries.filter(f => f.endsWith(".snap")).map(f => path.join(outDir, f))
  if (snaps.length === 0) {
    throw new Error(`No .snap artifact found in ${outDir}`)
  }
  if (snaps.length > 1) {
    throw new Error(`Multiple .snap artifacts found in ${outDir}: ${snaps.join(", ")}`)
  }
  return snaps[0]
}

/**
 * Extract a .snap file into `destDir` using unsquashfs and return the prime directory.
 * Throws if unsquashfs is not available or extraction fails.
 */
function extractSnap(snapPath: string, destDir: string): void {
  // -f: overwrite existing, -d: destination directory
  const result = spawnSync("unsquashfs", ["-f", "-d", destDir, snapPath], { stdio: "inherit" })
  if (result.status !== 0) {
    throw new Error(`unsquashfs failed with exit code ${result.status} for ${snapPath}`)
  }
}

/**
 * Verify the extracted snap directory contains the expected structure:
 * - snap.yaml (snapcraft metadata)
 * - meta/gui/<name>.desktop
 * - meta/gui/<name>.{png,svg,icns,...}  (icon — optional)
 * - app/<executableName> (the Electron binary)
 */
function assertSnapStructure(primeDir: string, appName: string, executableName: string): void {
  const required = [path.join(primeDir, "snap.yaml"), path.join(primeDir, "meta", "gui", `${appName}.desktop`), path.join(primeDir, "app", executableName)]
  for (const p of required) {
    if (!existsSync(p)) {
      throw new Error(`Expected snap file not found: ${p}`)
    }
  }
}

/**
 * Run the extracted Electron binary with --version to verify it starts and prints a version string.
 * Uses Xvfb so no physical display is required (matches the Docker environment).
 *
 * Returns the combined stdout output.
 */
function launchSnapBinary(binaryPath: string, timeoutMs = 15_000): string {
  const xvfb = startXvfb()
  try {
    const result = spawnSync(binaryPath, ["--version", "--no-sandbox"], {
      env: { ...process.env, DISPLAY: (xvfb as any).display },
      timeout: timeoutMs,
      encoding: "utf8",
    })
    if (result.error) {
      throw result.error
    }
    const output = (result.stdout ?? "") + (result.stderr ?? "")
    log.info({ binaryPath, output: output.trim(), exitCode: result.status }, "snap binary launch result")
    return output
  } finally {
    xvfb.stop()
  }
}

// ─── test suite ──────────────────────────────────────────────────────────────

describe.heavy.ifEnv(hasSnapInstalled())("snap heavy", { sequential: true, timeout: EXTENDED_TIMEOUT }, () => {
  for (const _core of testCores) {
    const core = _core as any

    // ── build-only test (always runs when snap tooling is present) ─────────────
    test(`snap full (${core})`, ({ expect }) =>
      app(expect, {
        targets: snapTarget,
        config: {
          extraMetadata: { name: "se-wo-template" },
          productName: "Snap Electron App (full build)",
          snapcraft: { base: core },
          electronFuses: {
            runAsNode: true,
            enableCookieEncryption: true,
            enableNodeOptionsEnvironmentVariable: true,
            enableNodeCliInspectArguments: true,
            enableEmbeddedAsarIntegrityValidation: true,
            onlyLoadAppFromAsar: true,
            loadBrowserProcessSpecificV8Snapshot: true,
            grantFileProtocolExtraPrivileges: undefined, // unsupported on current electron version in our tests
          },
        },
      }))

    // ── integration: structure + launch (requires unsquashfs) ──────────────────
    test.ifEnv(canRunInstallTests())(`snap install+launch (${core})`, async ({ expect }) => {
      let snapPath: string | undefined

      await assertPack(
        expect,
        "test-app-one",
        {
          targets: snapTarget,
          config: {
            extraMetadata: { name: "se-wo-template" },
            productName: "Snap Electron App",
            snapcraft: { base: core },
          },
        },
        {
          // Capture the built snap artifact path for post-build assertions.
          packed: async context => {
            snapPath = await findSnapArtifact(context.outDir)
          },
        }
      )

      if (!snapPath) {
        throw new Error("snap artifact path was not captured — packed callback may not have been called")
      }

      // ── 1. artifact sanity ────────────────────────────────────────────────
      expect(existsSync(snapPath)).toBe(true)
      const snapFileName = path.basename(snapPath)
      // Expected pattern: <name>_<version>_<arch>.snap
      expect(snapFileName).toMatch(/^se-wo-template_[\d.]+_amd64\.snap$/)
      log.info({ snapPath }, "snap artifact found")

      // ── 2. extract and inspect structure ─────────────────────────────────
      const tmpExtractDir = path.join(path.dirname(snapPath), "extracted-snap")
      extractSnap(snapPath, tmpExtractDir)

      assertSnapStructure(tmpExtractDir, "se-wo-template", "se-wo-template")

      // Verify snap.yaml contains expected keys
      const snapYamlPath = path.join(tmpExtractDir, "snap.yaml")
      const snapYamlContent = require("fs").readFileSync(snapYamlPath, "utf8")
      expect(snapYamlContent).toContain("name: se-wo-template")
      expect(snapYamlContent).toContain(`base: ${core}`)
      expect(snapYamlContent).toContain("confinement:")

      // Verify the desktop file is present and has required fields
      const desktopPath = path.join(tmpExtractDir, "meta", "gui", "se-wo-template.desktop")
      const desktopContent = require("fs").readFileSync(desktopPath, "utf8")
      expect(desktopContent).toContain("[Desktop Entry]")
      expect(desktopContent).toContain("Type=Application")
      expect(desktopContent).toContain("Exec=")

      log.info({ tmpExtractDir }, "snap structure validated")

      // ── 3. launch the extracted binary and verify it starts ───────────────
      // Electron honours --version and exits 0 immediately — no window, no sandbox needed.
      const binaryPath = path.join(tmpExtractDir, "app", "se-wo-template")
      expect(existsSync(binaryPath)).toBe(true)

      // Make sure the binary is executable (unsquashfs should preserve permissions,
      // but double-check so the error message is clear if it fails).
      execSync(`chmod +x "${binaryPath}"`)

      const output = launchSnapBinary(binaryPath)
      // Electron prints its version to stdout when --version is passed
      expect(output).toMatch(/v?\d+\.\d+\.\d+/)
      log.info({ output: output.trim() }, "snap binary launched successfully")
    })

    // armhf cross-compilation in host/destructive-mode on amd64 is not supported
    // by snapcraft 8 for core24; only test armhf for legacy cores.
    if (core !== "core24") {
      test(`snap full (${core} armhf)`, ({ expect }) =>
        app(expect, {
          targets: Platform.LINUX.createTarget("snap", Arch.armv7l),
          config: {
            extraMetadata: { name: "se-wo-template" },
            productName: "Snap Electron App (full build)",
          },
        }))
    }
  }
})
