/**
 * Expo config plugin for react-native-app-functions (Android).
 *
 * Applies the KSP Gradle plugin and this library's appfunctions.gradle script to the generated
 * Android project during `expo prebuild`, so Expo apps get the same wiring the README describes
 * for bare React Native. appfunctions.config.ts stays in the app root.
 */
const path = require("node:path");
const { withAppBuildGradle, withProjectBuildGradle } = require("expo/config-plugins");
const versions = require("./versions.json");

const KSP_CLASSPATH = `classpath("com.google.devtools.ksp:symbol-processing-gradle-plugin:${versions.ksp}")`;
const MARKER = "// react-native-app-functions";

function withKspClasspath(config) {
  return withProjectBuildGradle(config, (config) => {
    const gradle = config.modResults.contents;
    if (!gradle.includes("symbol-processing-gradle-plugin")) {
      config.modResults.contents = gradle.replace(
        /buildscript\s*\{[\s\S]*?dependencies\s*\{/,
        (match) => `${match}\n    ${KSP_CLASSPATH} ${MARKER}`,
      );
    }
    return config;
  });
}

function withAppFunctionsGradle(config) {
  return withAppBuildGradle(config, (config) => {
    let gradle = config.modResults.contents;
    const androidDir = path.join(config.modRequest.projectRoot, "android", "app");
    const script = path
      .relative(androidDir, path.join(__dirname, "android", "appfunctions.gradle"))
      .split(path.sep)
      .join("/");
    if (!gradle.includes('apply plugin: "com.google.devtools.ksp"')) {
      gradle = gradle.replace(
        /apply plugin: "com\.android\.application"\n/,
        (match) => `${match}apply plugin: "com.google.devtools.ksp" ${MARKER}\n`,
      );
    }
    if (!gradle.includes("appfunctions.gradle")) {
      gradle = `${gradle}\napply from: "${script}" ${MARKER}\n`;
    }
    config.modResults.contents = gradle;
    return config;
  });
}

module.exports = function withReactNativeAppFunctions(config) {
  return withAppFunctionsGradle(withKspClasspath(config));
};
