import { TargetSpecificOptions } from "../core"
import { CommonLinuxOptions } from "./linuxOptions"

/**
 * New-style snap configuration. Use this via the `snapcraft` key in your build config.
 * Selects the snapcraft core version and its per-core options.
 */
export interface SnapcraftOptions extends TargetSpecificOptions {
  /**
   * A snap of type base to be used as the execution environment for this snap; can only select one core for target.
   */
  readonly base: "core18" | "core20" | "core22" | "core24" | "custom"
  readonly core18?: SnapOptionsLegacy | null
  readonly core20?: SnapOptionsLegacy | null
  readonly core22?: SnapOptionsLegacy | null
  readonly core24?: SnapOptions24 | null
  /**
   * Pass-through custom snap configuration. electron-builder will read the
   * snapcraft.yaml at `yamlPath` and use it verbatim — no plugs, extensions,
   * organize mappings, or desktop files are injected.
   */
  readonly custom?: SnapOptionsCustom | null
}
export type SnapOptionsLegacy = Omit<SnapOptions, "base">

export interface SnapOptionsCustom {
  /**
   * Path to an existing `snapcraft.yaml` file, relative to `buildResourcesDir`.
   * electron-builder reads the file and passes it through without modification.
   */
  readonly yamlPath?: string | null
}

/**
 * Flat snap options. Used via the `snap` key in your build config (deprecated path).
 * Maintained for backward compatibility with electron-builder < 25.
 */
export interface SnapOptions extends CommonLinuxOptions, TargetSpecificOptions {
  /**
   * A snap of type base to be used as the execution environment for this snap. Examples: `core`, `core18`, `core20`, `core22`, `core24`. Defaults to `core24`
   */
  readonly base?: string | null

  /**
   * Whether to use the pre-built Electron snap template for faster builds.
   * Defaults to `true` when `stagePackages` is not customised.
   * Only applicable to x64 and armv7l builds.
   */
  readonly useTemplateApp?: boolean

  /**
   * The type of [confinement](https://snapcraft.io/docs/reference/confinement) supported by the snap.
   * @default strict
   */
  readonly confinement?: "devmode" | "strict" | "classic" | null

  /**
   * The custom environment. Defaults to `{"TMPDIR: "$XDG_RUNTIME_DIR"}`. If you set custom, it will be merged with default.
   */
  readonly environment?: { [key: string]: string } | null

  /**
   * The 78 character long summary. Defaults to [productName](./configuration.md#productName).
   */
  readonly summary?: string | null

  /**
   * The quality grade of the snap. It can be either `devel` (i.e. a development version of the snap, so not to be published to the "stable" or "candidate" channels) or "stable" (i.e. a stable release or release candidate, which can be released to all channels).
   * @default stable
   */
  readonly grade?: "devel" | "stable" | null

  /**
   * The list of features that must be supported by the core in order for this snap to install.
   */
  readonly assumes?: Array<string> | string | null

  /**
   * The list of debian packages needs to be installed for building this snap.
   */
  readonly buildPackages?: Array<string> | null

  /**
   * The list of Ubuntu packages to use that are needed to support the `app` part creation. Like `depends` for `deb`.
   * Defaults to `["libnspr4", "libnss3", "libxss1", "libappindicator3-1", "libsecret-1-0"]`.
   *
   * If list contains `default`, it will be replaced to default list, so, `["default", "foo"]` can be used to add custom package `foo` in addition to defaults.
   */
  readonly stagePackages?: Array<string> | null

  /**
   * The [hooks](https://docs.snapcraft.io/build-snaps/hooks) directory, relative to `build` (build resources directory).
   * @default build/snap-hooks
   */
  readonly hooks?: string | null

  /**
   * The list of [plugs](https://snapcraft.io/docs/reference/interfaces).
   * Defaults to `["desktop", "desktop-legacy", "home", "x11", "wayland", "unity7", "browser-support", "network", "gsettings", "audio-playback", "pulseaudio", "opengl"]`.
   *
   * If list contains `default`, it will be replaced to default list, so, `["default", "foo"]` can be used to add custom plug `foo` in addition to defaults.
   *
   * Additional attributes can be specified using object instead of just name of plug:
   * ```
   *[
   *  {
   *    "browser-sandbox": {
   *      "interface": "browser-support",
   *      "allow-sandbox": true
   *    },
   *  },
   *  "another-simple-plug-name"
   *]
   * ```
   */
  readonly plugs?: Array<string | PlugDescriptor> | PlugDescriptor | null

  /**
   * The list of [slots](https://snapcraft.io/docs/reference/interfaces).
   *
   * Additional attributes can be specified using object instead of just name of slot:
   * ```
   *[
   *  {
   *    "mpris": {
   *      "name": "chromium"
   *    },
   *  }
   *]
   *
   * In case you want your application to be a compliant MPris player, you will need to definie
   * The mpris slot with "chromium" name.
   * This electron has it [hardcoded](https://source.chromium.org/chromium/chromium/src/+/master:components/system_media_controls/linux/system_media_controls_linux.cc;l=51;bpv=0;bpt=1),
   * and we need to pass this name so snap [will allow it](https://forum.snapcraft.io/t/unable-to-use-mpris-interface/15360/7) in strict confinement.
   *
   */
  readonly slots?: Array<string | SlotDescriptor> | SlotDescriptor | null

  /**
   * Specifies any [parts](https://snapcraft.io/docs/reference/parts) that should be built before this part.
   * Defaults to `["desktop-gtk2""]`.
   *
   * If list contains `default`, it will be replaced to default list, so, `["default", "foo"]` can be used to add custom parts `foo` in addition to defaults.
   */
  readonly after?: Array<string> | null

  /**
   * Whether or not the snap should automatically start on login.
   * @default false
   */
  readonly autoStart?: boolean

  /**
   * Specifies any files to make accessible from locations such as `/usr`, `/var`, and `/etc`. See [snap layouts](https://snapcraft.io/docs/snap-layouts) to learn more.
   */
  readonly layout?: { [key: string]: { [key: string]: string } } | null

  /**
   * Specifies which files from the app part to stage and which to exclude. Individual files, directories, wildcards, globstars, and exclusions are accepted. See [Snapcraft filesets](https://snapcraft.io/docs/snapcraft-filesets) to learn more about the format.
   *
   * The defaults can be found in [snapcraft.ts](https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/src/targets/snap/snapcraft.ts).
   */
  readonly appPartStage?: Array<string> | null

  /**
   * An optional title for the snap, may contain uppercase letters and spaces. Defaults to `productName`. See [snap format documentation](https://snapcraft.io/docs/snap-format).
   */
  readonly title?: string | null

  /**
   * Sets the compression type for the snap. Can be xz, lzo, or null.
   */
  readonly compression?: "xz" | "lzo" | null

  /**
   * Allow running the program with native wayland support.
   */
  readonly allowNativeWayland?: boolean | null
}

export interface RemoteBuildOptions {
  // Whether to enable remote build. Explicit true/false required.
  enabled: boolean

  // Your Launchpad ID
  launchpadUsername?: string

  // Remote build (multi-architecture)
  // Example - buildFor: ['amd64', 'arm64', 'armhf']
  buildFor?: string[] // Target architectures

  // Auto-accept public upload
  acceptPublicUpload?: boolean

  // Remote build with private project
  privateProject?: string

  // Example: Remote build with credentials file (for CI/CD)
  sshKeyPath?: string
  // OR, generate credentials: snapcraft export-login credentials.txt
  credentialsFile?: string

  // Resume interrupted build
  recover?: boolean

  // Build timeout in seconds
  timeout?: number

  strategy?: "disable-fallback" | "force-fallback"

  /**
   * Allow running the program with native wayland support with --ozone-platform=wayland.
   * Disabled by default because of this issue in older Electron/Snap versions: https://github.com/electron-userland/electron-builder/issues/4007
   * @default false
   */
  readonly allowNativeWayland?: boolean | null
}

/**
 * Options for building a core24 snap. This is a fresh, forward-looking interface that does
 * not extend the legacy `SnapBaseOptions`. It inherits desktop-entry fields from
 * `CommonLinuxOptions` (categories, mimeTypes, executableArgs, etc.) and publish
 * configuration from `TargetSpecificOptions`.
 */
export interface SnapOptions24 extends CommonLinuxOptions, TargetSpecificOptions {
  // ─── Build environment (mutually exclusive) ─────────────────────────────────

  /**
   * Use [LXD](https://canonical.com/lxd) as the isolated build environment.
   * Preferred over Multipass on most Linux CI systems where nested virtualisation is unavailable.
   * Mutually exclusive with `useMultipass` and `useDestructiveMode`.
   */
  readonly useLXD?: boolean | null

  /**
   * Use [Multipass](https://multipass.run/) as the isolated build environment.
   * Mutually exclusive with `useLXD` and `useDestructiveMode`.
   */
  readonly useMultipass?: boolean | null

  /**
   * Build directly on the host without an isolated VM or container.
   * Equivalent to setting `SNAPCRAFT_BUILD_ENVIRONMENT=host`.
   * Required when building inside Docker (where nested virtualisation is unavailable).
   * The `gnome` extension is incompatible with this mode — do not include it in `extensions`.
   */
  readonly useDestructiveMode?: boolean | null

  /**
   * Configuration for a remote build on [Launchpad](https://launchpad.net/).
   * Enables multi-architecture builds (amd64, arm64, armhf) in CI without native hardware.
   */
  readonly remoteBuild?: RemoteBuildOptions | null

  // ─── Snapcraft extensions ────────────────────────────────────────────────────

  /**
   * [Snapcraft extensions](https://snapcraft.io/docs/snapcraft-extensions) to apply to the app.
   * Defaults to `["gnome"]` in normal builds (recommended for Electron apps on Ubuntu 24.04+).
   * Automatically set to `[]` in `useDestructiveMode` builds, where the gnome extension is
   * incompatible. Explicitly including `"gnome"` while `useDestructiveMode` is set will throw.
   * See: https://snapcraft.io/docs/gnome-extension
   */
  readonly extensions?: Array<string> | null

  // ─── Snap metadata ───────────────────────────────────────────────────────────

  /**
   * The type of [confinement](https://snapcraft.io/docs/reference/confinement) supported by the snap.
   * @default strict
   */
  readonly confinement?: "devmode" | "strict" | "classic" | null

  /**
   * The quality grade of the snap.
   * `devel` — not publishable to stable/candidate channels.
   * `stable` — suitable for all channels.
   * @default stable
   */
  readonly grade?: "devel" | "stable" | null

  /**
   * A short summary of the snap (max 78 characters). Defaults to `productName`.
   */
  readonly summary?: string | null

  /**
   * An optional display title (may contain uppercase letters and spaces). Defaults to `productName`.
   * See [snap format](https://snapcraft.io/docs/snap-format).
   */
  readonly title?: string | null

  /**
   * Compression algorithm for the snap file.
   */
  readonly compression?: "xz" | "lzo" | null

  /**
   * Features that must be supported by the host snapd before the snap can be installed.
   * See [assumes](https://snapcraft.io/docs/snapcraft-yaml-reference#assumes).
   */
  readonly assumes?: Array<string> | string | null

  // ─── Build packages / stage packages ────────────────────────────────────────

  /**
   * Debian packages required at **build** time (installed inside the build environment).
   */
  readonly buildPackages?: Array<string> | null

  /**
   * Ubuntu packages to **stage** alongside the app (equivalent to `depends` for deb).
   * Defaults to `["libnspr4", "libnss3", "libxss1", "libappindicator3-1", "libsecret-1-0"]`.
   * Supports the `"default"` keyword to reference the default list:
   * `["default", "my-extra-lib"]` appends `my-extra-lib` to the defaults.
   */
  readonly stagePackages?: Array<string> | null

  /**
   * Filesets controlling which files from the app part are staged into the snap.
   * Supports glob patterns and exclusions. See [filesets](https://snapcraft.io/docs/snapcraft-filesets).
   */
  readonly appPartStage?: Array<string> | null

  /**
   * Names of other snapcraft parts that must be built before the app part.
   */
  readonly after?: Array<string> | null

  // ─── Snap interfaces ─────────────────────────────────────────────────────────

  /**
   * [Plugs](https://snapcraft.io/docs/reference/interfaces) (consumed interfaces) for the app.
   * When the `gnome` extension is active, content-snap plugs (themes, GNOME platform, GPU)
   * are added automatically — only list custom plugs here.
   * Without any extension, defaults to the standard Electron plug set.
   *
   * Supports descriptor objects for plugs with attributes:
   * ```json
   * [{ "browser-sandbox": { "interface": "browser-support", "allow-sandbox": true } }]
   * ```
   */
  readonly plugs?: Array<string | PlugDescriptor> | PlugDescriptor | null

  /**
   * [Slots](https://snapcraft.io/docs/reference/interfaces) (provided interfaces) for the app.
   * Use for MPRIS, D-Bus services, etc.
   *
   * Example — expose MPRIS under the Chromium bus name:
   * ```json
   * [{ "mpris": { "name": "chromium" } }]
   * ```
   */
  readonly slots?: Array<string | SlotDescriptor> | SlotDescriptor | null

  /**
   * [Snap layouts](https://snapcraft.io/docs/snap-layouts) — bind-mount or symlink host paths
   * into the snap's namespace. User-provided layouts always override the extension defaults.
   */
  readonly layout?: { [key: string]: { [key: string]: string } } | null

  // ─── Runtime environment ─────────────────────────────────────────────────────

  /**
   * Additional environment variables injected into the snap's runtime environment.
   * Merged with the electron-builder defaults (`TMPDIR=$XDG_RUNTIME_DIR`).
   * User-supplied values take precedence.
   */
  readonly environment?: { [key: string]: string } | null

  /**
   * Whether the app should auto-start on login (creates an autostart desktop entry).
   * @default false
   */
  readonly autoStart?: boolean

  /**
   * Allow running the application with native Wayland support (`--ozone-platform=wayland`).
   * For core24 this defaults to `true`. Set to `false` to force X11 mode via XWayland.
   * @default true
   */
  readonly allowNativeWayland?: boolean | null

  // ─── Hooks ───────────────────────────────────────────────────────────────────

  /**
   * Directory containing [snap hooks](https://snapcraft.io/docs/snap-hooks), relative to
   * the build resources directory.
   * @default build/snap-hooks
   */
  readonly hooks?: string | null
}

export interface PlugDescriptor {
  [key: string]: { [key: string]: any } | null
}

export interface SlotDescriptor {
  [key: string]: { [key: string]: any } | null
}
