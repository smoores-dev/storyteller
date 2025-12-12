#!/bin/bash

set -e

# This script runs after EAS build completes
# Environment variables from EAS:
# - EAS_BUILD_PLATFORM (android/ios)
# - EAS_BUILD_ID
# - EAS_BUILD_PROFILE

APP_VERSION=$(node -p "require('./package.json').version")

RELEASE_TAG="v${APP_VERSION}"
ARTIFACT_NAME=app-release.apk

ARTIFACT_PATH=/home/expo/workingdir/build/mobile/android/app/build/outputs/apk/release/${ARTIFACT_NAME}

API_URL="https://gitlab.com/api/v4/projects/${GITLAB_PROJECT_ID}"

PACKAGE_URL="${API_URL}/packages/generic/mobile-apk/${APP_VERSION}/${ARTIFACT_NAME}"

echo "Uploading to GitLab..."
curl --fail-with-body \
     --header "PRIVATE-TOKEN: ${GITLAB_TOKEN}" \
     --upload-file "${ARTIFACT_PATH}" \
     ${PACKAGE_URL}

echo "Ensuring that release exists with name mobile-${RELEASE_TAG}"
curl --fail-with-body \
     --request GET \
     --header "PRIVATE-TOKEN: ${GITLAB_TOKEN}" \
     --header "Content-Type: application/json" \
     "${API_URL}/releases/mobile-${RELEASE_TAG}" \
     2>/dev/null

echo "Adding link to GitLab release..."
curl --fail-with-body \
     --request POST \
     --header "PRIVATE-TOKEN: ${GITLAB_TOKEN}" \
     --data "name=Android APK" \
     --data "url=${PACKAGE_URL}" \
     --data "link_type=package" \
     "${API_URL}/releases/mobile-${RELEASE_TAG}/assets/links"

echo "Successfully uploaded artifact and added to release mobile-${RELEASE_TAG}"
