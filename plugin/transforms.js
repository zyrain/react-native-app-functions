/**
 * The text edits the Expo config plugin (app.plugin.js) makes to the native projects that
 * `expo prebuild` generates. They are plain string functions so they can be tested without Expo.
 *
 * Every edit is idempotent: applying it to its own output changes nothing. When the expected anchor
 * is missing (a template this plugin does not recognise), it throws instead of silently leaving the
 * project unconfigured.
 */
const MARKER = '// react-native-app-functions';
const PODFILE_MARKER = '# react-native-app-functions';

class AppFunctionsPluginError extends Error {
  constructor(file, message) {
    super(
      `react-native-app-functions: cannot configure ${file}: ${message}. ` +
        'Apply the setup from the README by hand.'
    );
    this.name = 'AppFunctionsPluginError';
  }
}

/** android/build.gradle: adds the KSP Gradle plugin to the buildscript classpath. */
function addKspClasspath(gradle, kspVersion) {
  if (gradle.includes('symbol-processing-gradle-plugin')) return gradle;
  const anchor = /buildscript\s*\{[\s\S]*?dependencies\s*\{/;
  if (!anchor.test(gradle)) {
    throw new AppFunctionsPluginError(
      'android/build.gradle',
      'no `buildscript { dependencies { … } }` block'
    );
  }
  return gradle.replace(
    anchor,
    (match) =>
      `${match}\n    classpath("com.google.devtools.ksp:symbol-processing-gradle-plugin:${kspVersion}") ${MARKER}`
  );
}

/**
 * android/app/build.gradle: applies the KSP plugin after the Android application plugin and applies
 * this library's appfunctions.gradle, given as a path relative to android/app.
 */
function applyAppFunctionsGradle(gradle, scriptPath) {
  let result = gradle;
  if (!result.includes('apply plugin: "com.google.devtools.ksp"')) {
    const anchor = /apply plugin: "com\.android\.application"\n/;
    if (!anchor.test(result)) {
      throw new AppFunctionsPluginError(
        'android/app/build.gradle',
        'no `apply plugin: "com.android.application"` line'
      );
    }
    result = result.replace(
      anchor,
      (match) => `${match}apply plugin: "com.google.devtools.ksp" ${MARKER}\n`
    );
  }
  if (!result.includes('appfunctions.gradle')) {
    result = `${result.replace(/\n*$/, '\n')}apply from: "${scriptPath}" ${MARKER}\n`;
  }
  return result;
}

/**
 * ios/Podfile: loads this library's ios/appfunctions.rb (located with Node, like Expo's own
 * requires, so it works with any node_modules layout) and calls `appfunctions_post_install` at the
 * end of the existing `post_install` block, after React Native's post-install step.
 */
function addPodfileSetup(podfile) {
  let result = podfile;
  if (!result.includes('appfunctions')) {
    const requireLine =
      'require File.join(File.dirname(`node --print "require.resolve(\'react-native-app-functions/package.json\')"`), "ios/appfunctions") ' +
      PODFILE_MARKER;
    const lastRequire = [...result.matchAll(/^require .*$/gm)].pop();
    result = lastRequire
      ? `${result.slice(0, lastRequire.index + lastRequire[0].length)}\n${requireLine}${result.slice(lastRequire.index + lastRequire[0].length)}`
      : `${requireLine}\n${result}`;
  }
  if (!result.includes('appfunctions_post_install(')) {
    const opening = /^([ \t]*)post_install do \|installer\|[ \t]*\n/m.exec(
      result
    );
    if (!opening) {
      throw new AppFunctionsPluginError(
        'ios/Podfile',
        'no `post_install do |installer|` block'
      );
    }
    const indent = opening[1];
    const closing = new RegExp(`^${indent}end[ \\t]*$`, 'm');
    const rest = result.slice(opening.index + opening[0].length);
    const end = closing.exec(rest);
    if (!end) {
      throw new AppFunctionsPluginError(
        'ios/Podfile',
        'cannot find the end of the `post_install` block'
      );
    }
    const at = opening.index + opening[0].length + end.index;
    result = `${result.slice(0, at)}${indent}  appfunctions_post_install(installer) ${PODFILE_MARKER}\n${result.slice(at)}`;
  }
  return result;
}

module.exports = {
  AppFunctionsPluginError,
  addKspClasspath,
  applyAppFunctionsGradle,
  addPodfileSetup,
};
