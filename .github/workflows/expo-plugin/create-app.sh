#!/usr/bin/env bash
# Creates ../test-app: a new Expo app (SDK $EXPO_SDK) with the packed library, the config plugin
# and the fixture in plugin/__fixtures__/expo-app.
set -euo pipefail

repo="$(pwd)"
yarn prepare
# npm pack, not yarn pack: yarn pack leaves out codegen/lib.
npm pack --ignore-scripts --pack-destination ..
tarball="$(ls ../react-native-app-functions-*.tgz)"

cd ..
npx --yes create-expo-app@latest test-app --template "blank-typescript@sdk-$EXPO_SDK" --no-install
cd test-app
cp "$repo"/plugin/__fixtures__/expo-app/{app.json,appfunctions.config.ts} .
npm install
npm install "$repo/$tarball"
npx expo install expo-build-properties
