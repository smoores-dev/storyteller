#!/bin/bash
# Xcode Cloud post-clone hook (legacy; GitLab CI is the primary pipeline).
set -e

echo "Installing dependencies..."
brew install xcodegen imagemagick

cd "$CI_PRIMARY_REPOSITORY_PATH/applications/clients"

echo "Generating icons..."
./scripts/genicons

echo "Generating Xcode project..."
./scripts/genxproj

echo "Copying Package.resolved to Xcode project..."
mkdir -p Storyteller.xcodeproj/project.xcworkspace/xcshareddata/swiftpm
cp ../../Package.resolved Storyteller.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved

echo "Xcode project generated successfully"
