import { Arch, Platform } from "app-builder-lib"
import { app, EXTENDED_TIMEOUT, snapTarget } from "../helpers/packTester"
import * as which from "which"

// very slow

// Guard: tests run when:
//   - RUN_SNAP_TESTS=true  (set by test-snap.sh inside the Docker container, where
//     "snap" the snapd client is absent but "snapcraft" is present), OR
//   - the "snap" snapd client is found in PATH (native Linux install), OR
//   - the "snapcraft" CLI is found in PATH (e.g. installed via pip / brew)
export const hasSnapInstalled = () => process.env.RUN_SNAP_TESTS === "true" || which.sync("snap", { nothrow: true }) != null || which.sync("snapcraft", { nothrow: true }) != null

// Optional core filter: SNAP_TEST_CORES=core24  (comma-separated)
// When unset every core is tested.
const requestedCores = process.env.SNAP_TEST_CORES ? process.env.SNAP_TEST_CORES.split(",").map(s => s.trim()) : null
const allCores = ["core24", "core22", "core20", "core18"]
const testCores = requestedCores ? allCores.filter(c => requestedCores.includes(c)) : allCores

describe.heavy.ifEnv(hasSnapInstalled())("snap heavy", { sequential: true, timeout: EXTENDED_TIMEOUT }, () => {
  for (const _core of testCores) {
    const core = _core as any
    test(`snap full (${core})`, ({ expect }) =>
      app(expect, {
        targets: snapTarget,
        config: {
          extraMetadata: {
            name: "se-wo-template",
          },
          productName: "Snap Electron App (full build)",
          snapcraft: {
            core,
          },
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

    // armhf cross-compilation in host/destructive-mode on amd64 is not supported
    // by snapcraft 8 for core24; only test armhf for legacy cores.
    if (core !== "core24") {
      test("snap full (armhf)", ({ expect }) =>
        app(expect, {
          targets: Platform.LINUX.createTarget("snap", Arch.armv7l),
          config: {
            extraMetadata: {
              name: "se-wo-template",
            },
            productName: "Snap Electron App (full build)",
          },
        }))
    }
  }
})
