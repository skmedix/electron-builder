import { Arch, Platform } from "app-builder-lib"
import { log } from "builder-util"
import { execSync, spawnSync } from "child_process"
import { existsSync, readFileSync } from "fs"
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

// Whether install+launch tests should run. Requires unsquashfs on PATH (squashfs-tools).
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

/** Extract a .snap file into destDir using unsquashfs. */
function extractSnap(snapPath: string, destDir: string): void {
  const result = spawnSync("unsquashfs", ["-f", "-d", destDir, snapPath], { stdio: "inherit" })
  if (result.status !== 0) {
    throw new Error(`unsquashfs failed with exit code ${result.status} for ${snapPath}`)
  }
}

/**
 * Resolve the Electron binary path inside an extracted snap.
 *
 * core24 snaps use an `organize` mapping that places all app files under `app/`,
 * so the binary is at `<prime>/app/<exe>`.
 *
 * Legacy snaps (core18/20/22) do not use `organize`, so the binary is at the
 * root of the snap: `<prime>/<exe>`.
 */
function resolveSnapBinaryPath(primeDir: string, executableName: string, core: string): string {
  if (core === "core24") {
    return path.join(primeDir, "app", executableName)
  }
  return path.join(primeDir, executableName)
}

/**
 * Verify the extracted snap directory contains the expected structure.
 * Metadata lives at meta/snap.yaml (compiled by snapcraft, not the build-time snapcraft.yaml).
 */
function assertSnapStructure(primeDir: string, appName: string, binaryPath: string): void {
  const required = [path.join(primeDir, "meta", "snap.yaml"), path.join(primeDir, "meta", "gui", `${appName}.desktop`), binaryPath]
  for (const p of required) {
    if (!existsSync(p)) {
      throw new Error(`Expected snap file not found: ${p}`)
    }
  }
}

/**
 * Run the Electron binary with --version to verify it starts.
 * Electron prints its version to stdout and exits 0 — no window or sandbox required.
 * Uses Xvfb so no physical display is needed.
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

/**
 * Full install+launch integration test for a single snap.
 * Build → extract → assert structure → run binary --version.
 */
async function runInstallLaunchTest(expect: any, core: "core18" | "core20" | "core22" | "core24"): Promise<void> {
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
      packed: async context => {
        snapPath = await findSnapArtifact(context.outDir)
      },
    }
  )

  if (!snapPath) {
    throw new Error("snap artifact path was not captured")
  }

  // ── 1. artifact sanity ──────────────────────────────────────────────────
  expect(existsSync(snapPath)).toBe(true)
  expect(path.basename(snapPath)).toMatch(/^se-wo-template_[\d.]+_amd64\.snap$/)
  log.info({ snapPath }, "snap artifact found")

  // ── 2. extract and inspect structure ────────────────────────────────────
  const extractDir = path.join(path.dirname(snapPath), "extracted-snap")
  extractSnap(snapPath, extractDir)

  const binaryPath = resolveSnapBinaryPath(extractDir, "se-wo-template", core)
  assertSnapStructure(extractDir, "se-wo-template", binaryPath)

  // Verify compiled snap metadata
  const snapYaml = readFileSync(path.join(extractDir, "meta", "snap.yaml"), "utf8")
  expect(snapYaml).toContain("name: se-wo-template")
  expect(snapYaml).toContain(`base: ${core}`)
  expect(snapYaml).toContain("confinement:")

  // Verify desktop file
  const desktopContent = readFileSync(path.join(extractDir, "meta", "gui", "se-wo-template.desktop"), "utf8")
  expect(desktopContent).toContain("[Desktop Entry]")
  expect(desktopContent).toContain("Type=Application")
  expect(desktopContent).toContain("Exec=")
  log.info({ extractDir }, "snap structure validated")

  // ── 3. launch binary ────────────────────────────────────────────────────
  execSync(`chmod +x "${binaryPath}"`)
  const output = launchSnapBinary(binaryPath)
  // Electron responds to --version by printing its version (e.g. "v32.0.0") and exiting 0
  expect(output).toMatch(/v?\d+\.\d+\.\d+/)
  log.info({ output: output.trim() }, "snap binary launched successfully")
}

// ─── test suites ─────────────────────────────────────────────────────────────

describe.heavy.ifEnv(hasSnapInstalled())("snap heavy", { sequential: true, timeout: EXTENDED_TIMEOUT }, () => {
  for (const _core of testCores) {
    const core = _core as any

    // ── build-only test (always runs when snap tooling is present) ───────────
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
            grantFileProtocolExtraPrivileges: undefined,
          },
        },
      }))

    // ── install+launch integration (requires unsquashfs) ────────────────────
    test.ifEnv(canRunInstallTests())(`snap install+launch (${core})`, async ({ expect }) => {
      await runInstallLaunchTest(expect, core as "core18" | "core20" | "core22" | "core24")
    })

    // armhf cross-compilation is not supported for core24 in host/destructive-mode
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

// ─── core24 native Linux tests ───────────────────────────────────────────────
//
// These tests run on a native Linux GH runner (no Docker required) where snapcraft
// and unsquashfs are available. They exercise the full build → extract → launch
// pipeline for core24 specifically, including the gnome extension path and the
// destructive-mode (no gnome extension) path.

describe.heavy.ifLinux.ifEnv(hasSnapInstalled())("snap core24 native", { sequential: true, timeout: EXTENDED_TIMEOUT }, () => {
  test("core24 build + install + launch", async ({ expect }) => {
    await runInstallLaunchTest(expect, "core24")
  })

  test("core24 destructive-mode (no gnome extension)", async ({ expect }) => {
    let snapPath: string | undefined

    await assertPack(
      expect,
      "test-app-one",
      {
        targets: snapTarget,
        config: {
          extraMetadata: { name: "se-wo-template" },
          productName: "Snap Electron App",
          snapcraft: {
            base: "core24",
            core24: {
              useDestructiveMode: true,
              // gnome extension is incompatible with destructive-mode — must not be set
              extensions: [],
            },
          },
        },
      },
      {
        packed: async context => {
          snapPath = await findSnapArtifact(context.outDir)
        },
      }
    )

    if (!snapPath) {
      throw new Error("snap artifact path was not captured")
    }

    expect(existsSync(snapPath)).toBe(true)

    const extractDir = path.join(path.dirname(snapPath), "extracted-snap-destructive")
    extractSnap(snapPath, extractDir)

    const snapYaml = readFileSync(path.join(extractDir, "meta", "snap.yaml"), "utf8")
    expect(snapYaml).toContain("name: se-wo-template")
    expect(snapYaml).toContain("base: core24")
    // gnome extension must not be present in destructive-mode builds
    expect(snapYaml).not.toContain("gnome")

    const binaryPath = resolveSnapBinaryPath(extractDir, "se-wo-template", "core24")
    expect(existsSync(binaryPath)).toBe(true)

    execSync(`chmod +x "${binaryPath}"`)
    const output = launchSnapBinary(binaryPath)
    expect(output).toMatch(/v?\d+\.\d+\.\d+/)
  })

  test("core24 with custom stagePackages", async ({ expect }) => {
    let snapPath: string | undefined

    await assertPack(
      expect,
      "test-app-one",
      {
        targets: snapTarget,
        config: {
          extraMetadata: { name: "se-wo-template" },
          productName: "Snap Electron App",
          snapcraft: {
            base: "core24",
            core24: {
              stagePackages: ["default", "libdrm2"],
            },
          },
        },
      },
      {
        packed: async context => {
          snapPath = await findSnapArtifact(context.outDir)
        },
      }
    )

    expect(existsSync(snapPath!)).toBe(true)

    const extractDir = path.join(path.dirname(snapPath!), "extracted-snap-custom-stage")
    extractSnap(snapPath!, extractDir)

    const snapYaml = readFileSync(path.join(extractDir, "meta", "snap.yaml"), "utf8")
    // custom stage-package should be reflected in the snap metadata
    expect(snapYaml).toContain("name: se-wo-template")
    log.info({ snapPath }, "core24 custom stagePackages snap validated")
  })
})
