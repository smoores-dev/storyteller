#!/usr/bin/env bash

set -euo pipefail

APK="AndroidApp/app/build/outputs/apk/debug/app-debug.apk"
PUBLISHED_APK="${CI_PROJECT_DIR:-$PWD}/storyteller-debug.apk"

"${ANDROID_HOME}/build-tools/36.0.0/apksigner" verify --verbose --print-certs "${APK}"

actual_cert=$(
    "${ANDROID_HOME}/build-tools/36.0.0/apksigner" verify --print-certs "${APK}" \
        | sed -n 's/^Signer #1 certificate SHA-256 digest: //p'
)
expected_cert="${ANDROID_SIGNING_CERT_SHA256:-}"

# Ephemeral-key builds install under a different signature and break sideloaded
# upgrades, so only shared-key APKs are uploaded.
if [[ -n "${expected_cert}" && "${actual_cert}" == "${expected_cert}" ]]; then
    cp "${APK}" "${PUBLISHED_APK}"
    echo "Publishing APK signed with ${actual_cert}."
    exit 0
fi

if [[ "${CI_COMMIT_BRANCH:-}" == "main" ]]; then
    echo "main built with certificate ${actual_cert}, expected ${expected_cert:-<unset>}." >&2
    exit 1
fi

echo "Built with the ephemeral debug key (${actual_cert}), not publishing an APK."
