#!/bin/bash
# Run snap heavy tests using Canonical's purpose-built snapcraft rock images.
#
# Two images are used so each core is tested against the snapcraft version that
# Canonical officially supports for it:
#
#   dockerfile-snapcraft-legacy  →  ghcr.io/canonical/snapcraft:7_core22
#     Tests: core18, core20, core22
#
#   dockerfile-snapcraft          →  ghcr.io/canonical/snapcraft:8_core24
#     Tests: core24  (snapcraft 8 is also backward-compatible with older bases)
#
# Both containers build with SNAPCRAFT_BUILD_ENVIRONMENT=host (destructive mode)
# so no LXD or Multipass daemon is required.  --privileged is needed for
# overlayfs access during the snapcraft prime stage.
#
# Usage
# ─────
#   # Build both images and run all cores
#   ./test/src/linux/test-snap.sh
#
#   # Run only the core24 pass (skip legacy image build + run)
#   SKIP_LEGACY=1 ./test/src/linux/test-snap.sh
#
#   # Run only the legacy pass (skip core24 image build + run)
#   SKIP_CORE24=1 ./test/src/linux/test-snap.sh
#
#   # Pass extra docker flags (e.g. a proxy)
#   ADDITIONAL_DOCKER_ARGS="-e http_proxy=http://..." ./test/src/linux/test-snap.sh
#
# Prerequisites
# ─────────────
#   docker   — daemon must be running and support --privileged
#   pnpm     — installed in the host environment

set -e

# Dump snapcraft logs from a host-mounted directory on failure.
# The volume mount -v SNAPCRAFT_LOG_DIR:/root/.local/state/snapcraft/log is added
# to every docker run so logs survive container removal (--rm).
dump_snapcraft_logs() {
  local log_dir="$1"
  if compgen -G "${log_dir}/*.log" >/dev/null 2>&1; then
    echo "--- snapcraft logs ---" >&2
    for f in "${log_dir}"/*.log; do
      echo "=== $f ===" >&2
      cat "$f" >&2
    done
    echo "--- end snapcraft logs ---" >&2
  fi
}

CWD=$(dirname "$0")
# Resolve absolute repo root (three levels up: linux/ → src/ → test/ → .)
REPO_ROOT=$(cd "$CWD/../../.." && pwd)

export TEST_FILES="snapTest,snapHeavyTest"
export DEBUG="${DEBUG:-electron-builder}"
export SKIPPED_TESTS="none"

# Common docker flags forwarded to every test run.
#
#   RUN_SNAP_TESTS=true
#     Activates the test guard in snapHeavyTest.ts even when the snapd client
#     ("snap") is absent — these images have snapcraft but not snapd.
#
#   SNAPCRAFT_BUILD_ENVIRONMENT=host
#     Standard snapcraft env-var that selects destructive / host-build mode
#     without needing LXD or Multipass inside the container.
#
#   --privileged
#     overlayfs / bind-mount access required during snapcraft's prime stage.
# Temp dir on the host for snapcraft logs; mounted into every container so
# logs survive container exit (docker run --rm removes the container but not
# host-mounted volumes).
SNAPCRAFT_LOG_DIR=$(mktemp -d)
trap 'rm -rf "$SNAPCRAFT_LOG_DIR"' EXIT

COMMON_DOCKER_ARGS="--privileged \
  -e RUN_SNAP_TESTS=true \
  -e SNAPCRAFT_BUILD_ENVIRONMENT=host \
  -e SKIPPED_TESTS=${SKIPPED_TESTS:-} \
  -v ${SNAPCRAFT_LOG_DIR}:/root/.local/state/snapcraft/log \
  ${ADDITIONAL_DOCKER_ARGS:-}"

# ── Pass 1: legacy cores (core18 / core20 / core22) via snapcraft 7 ──────────

if [[ -z "${SKIP_LEGACY:-}" ]]; then
  docker build \
    --platform=linux/amd64 \
    -f "$CWD/dockerfile-snapcraft-legacy" \
    -t snapcraft-legacy-test \
    "$REPO_ROOT"

  TEST_RUNNER_IMAGE_TAG="snapcraft-legacy-test" \
    ADDITIONAL_DOCKER_ARGS="$COMMON_DOCKER_ARGS -e SNAP_TEST_CORES=core18,core20,core22" \
    pnpm test-linux \
  || { dump_snapcraft_logs "$SNAPCRAFT_LOG_DIR"; exit 1; }
fi

# ── Pass 2: core24 via snapcraft 8 ────────────────────────────────────────────

if [[ -z "${SKIP_CORE24:-}" ]]; then
  docker build \
    --platform=linux/amd64 \
    -f "$CWD/dockerfile-snapcraft" \
    -t snapcraft-core24-test \
    "$REPO_ROOT"

  TEST_RUNNER_IMAGE_TAG="snapcraft-core24-test" \
    ADDITIONAL_DOCKER_ARGS="$COMMON_DOCKER_ARGS -e SNAP_TEST_CORES=core24" \
    pnpm test-linux \
  || { dump_snapcraft_logs "$SNAPCRAFT_LOG_DIR"; exit 1; }
fi
