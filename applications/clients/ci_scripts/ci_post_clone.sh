#!/bin/bash
# Xcode Cloud post-clone hook (legacy; GitLab CI is the primary pipeline).
set -e

echo "Installing dependencies..."
brew install xcodegen imagemagick

cd "$CI_PRIMARY_REPOSITORY_PATH/applications/clients"

echo "Applying Silveran TestFlight identity..."
cp XCodeApps/Configs/Local.kyonifer.xcconfig XCodeApps/Configs/Local.xcconfig
perl -0777 -pi -e '
  s/CODE_SIGN_STYLE: Manual/CODE_SIGN_STYLE: Automatic/g;
  s/^\s*CODE_SIGN_IDENTITY: "Apple Distribution"\n//mg;
  s/^\s*PROVISIONING_PROFILE_SPECIFIER:\n\s*"match AppStore [^"]*"\n//mg;
  s/MARKETING_VERSION: 0.1/MARKETING_VERSION: 3.0/g;
  s/CFBundleDisplayName: "Storyteller"/CFBundleDisplayName: "Storyteller v3"/g;
' XCodeApps/project.yml

echo "Generating icons..."
./scripts/genicons

echo "Generating Xcode project..."
./scripts/genxproj

echo "Copying Package.resolved to Xcode project..."
mkdir -p Storyteller.xcodeproj/project.xcworkspace/xcshareddata/swiftpm
cp ../../Package.resolved Storyteller.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved

echo "Xcode project generated successfully"
