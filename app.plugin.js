/**
 * Expo config plugin for react-native-app-functions.
 *
 * During `expo prebuild` it applies the setup the README describes for bare React Native:
 * - Android: the KSP Gradle plugin and this library's appfunctions.gradle;
 * - iOS: this library's ios/appfunctions.rb, called from the Podfile's post_install block.
 *
 * appfunctions.config.ts stays in the app root. The edits themselves are in plugin/transforms.js.
 */
const path = require('node:path');
const {
  withAppBuildGradle,
  withPodfile,
  withProjectBuildGradle,
} = require('expo/config-plugins');
const versions = require('./versions.json');
const {
  addKspClasspath,
  addPodfileSetup,
  applyAppFunctionsGradle,
} = require('./plugin/transforms');

function withAndroid(config) {
  config = withProjectBuildGradle(config, (mod) => {
    mod.modResults.contents = addKspClasspath(
      mod.modResults.contents,
      versions.ksp
    );
    return mod;
  });
  return withAppBuildGradle(config, (mod) => {
    const appDir = path.join(mod.modRequest.projectRoot, 'android', 'app');
    const script = path
      .relative(appDir, path.join(__dirname, 'android', 'appfunctions.gradle'))
      .split(path.sep)
      .join('/');
    mod.modResults.contents = applyAppFunctionsGradle(
      mod.modResults.contents,
      script
    );
    return mod;
  });
}

function withIos(config) {
  return withPodfile(config, (mod) => {
    mod.modResults.contents = addPodfileSetup(mod.modResults.contents);
    return mod;
  });
}

module.exports = function withReactNativeAppFunctions(config) {
  return withIos(withAndroid(config));
};
