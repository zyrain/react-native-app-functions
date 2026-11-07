/**
 * The text edits the Expo config plugin (app.plugin.js) makes to the native projects that
 * `expo prebuild` generates. They are plain string functions so they can be tested without Expo.
 *
 * - Idempotent: applying an edit to its own output changes nothing.
 * - Existing setup is recognised only in code, never in comments.
 * - LF and CRLF files are both accepted; insertions use the file's own line ending.
 * - When the expected anchor is missing (a template this plugin does not recognise), the edit
 *   throws instead of silently leaving the project unconfigured.
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

const lineEnding = (text) => (text.includes('\r\n') ? '\r\n' : '\n');

/** Whether any line, outside comments, matches `pattern` (anchored at the line's code start). */
function hasCodeLine(text, pattern, commentPrefix) {
  return text.split(/\r?\n/).some((line) => {
    const code = line.trimStart();
    return !code.startsWith(commentPrefix) && pattern.test(code);
  });
}

/** Gradle code without block comments, so lines inside one are not mistaken for code. */
const withoutBlockComments = (gradle) =>
  gradle.replace(/\/\*[\s\S]*?\*\//g, '');

const gradleHas = (gradle, pattern) =>
  hasCodeLine(withoutBlockComments(gradle), pattern, '//');

const KSP_CLASSPATH =
  /^classpath\s*\(?\s*["']com\.google\.devtools\.ksp:symbol-processing-gradle-plugin[:"']/;
const KSP_APPLIED =
  /^(apply\s+plugin\s*:\s*["']com\.google\.devtools\.ksp["']|id\s*\(?\s*["']com\.google\.devtools\.ksp["'])/;
const SCRIPT_APPLIED =
  /^apply\s+from\s*:\s*["'][^"']*\/appfunctions\.gradle["']/;

/** android/build.gradle: adds the KSP Gradle plugin to the buildscript classpath. */
function addKspClasspath(gradle, kspVersion) {
  if (gradleHas(gradle, KSP_CLASSPATH)) return gradle;
  const anchor = /buildscript\s*\{[\s\S]*?dependencies\s*\{[ \t]*/;
  if (!anchor.test(gradle)) {
    throw new AppFunctionsPluginError(
      'android/build.gradle',
      'no `buildscript { dependencies { … } }` block'
    );
  }
  const eol = lineEnding(gradle);
  return gradle.replace(
    anchor,
    (match) =>
      `${match}${eol}    classpath("com.google.devtools.ksp:symbol-processing-gradle-plugin:${kspVersion}") ${MARKER}`
  );
}

/**
 * android/app/build.gradle: applies the KSP plugin after the Android application plugin and applies
 * this library's appfunctions.gradle, given as a path relative to android/app.
 */
function applyAppFunctionsGradle(gradle, scriptPath) {
  const eol = lineEnding(gradle);
  let result = gradle;
  if (!gradleHas(result, KSP_APPLIED)) {
    const anchor =
      /^[ \t]*apply\s+plugin\s*:\s*["']com\.android\.application["'][ \t]*\r?\n/m;
    if (!anchor.test(result)) {
      throw new AppFunctionsPluginError(
        'android/app/build.gradle',
        'no `apply plugin: "com.android.application"` line'
      );
    }
    result = result.replace(
      anchor,
      (match) =>
        `${match}apply plugin: "com.google.devtools.ksp" ${MARKER}${eol}`
    );
  }
  if (!gradleHas(result, SCRIPT_APPLIED)) {
    result = `${result.replace(/(\r?\n)*$/, eol)}apply from: "${scriptPath}" ${MARKER}${eol}`;
  }
  return result;
}

const POD_REQUIRE = /^require\b.*["']ios\/appfunctions["']/;
const POD_HOOK = /^appfunctions_post_install\s*\(/;

/**
 * ios/Podfile: loads this library's ios/appfunctions.rb (located with Node, like Expo's own
 * requires, so it works with any node_modules layout) and calls `appfunctions_post_install` at the
 * end of the existing `post_install` block, after React Native's post-install step.
 */
function addPodfileSetup(podfile) {
  const eol = lineEnding(podfile);
  let result = podfile;
  if (!hasCodeLine(result, POD_REQUIRE, '#')) {
    const requireLine =
      'require File.join(File.dirname(`node --print "require.resolve(\'react-native-app-functions/package.json\')"`), "ios/appfunctions") ' +
      PODFILE_MARKER;
    const lastRequire = [...result.matchAll(/^require\b[^\r\n]*/gm)].pop();
    if (lastRequire) {
      const at = lastRequire.index + lastRequire[0].length;
      result = `${result.slice(0, at)}${eol}${requireLine}${result.slice(at)}`;
    } else {
      result = `${requireLine}${eol}${result}`;
    }
  }
  if (!hasCodeLine(result, POD_HOOK, '#')) {
    const opening =
      /^([ \t]*)post_install\s+do\s*\|\s*installer\s*\|[ \t]*\r?\n/m.exec(
        result
      );
    if (!opening) {
      throw new AppFunctionsPluginError(
        'ios/Podfile',
        'no `post_install do |installer|` block'
      );
    }
    const indent = opening[1];
    const bodyStart = opening.index + opening[0].length;
    const end = new RegExp(`^${indent}end[ \\t]*\\r?$`, 'm').exec(
      result.slice(bodyStart)
    );
    if (!end) {
      throw new AppFunctionsPluginError(
        'ios/Podfile',
        'cannot find the end of the `post_install` block'
      );
    }
    const at = bodyStart + end.index;
    result = `${result.slice(0, at)}${indent}  appfunctions_post_install(installer) ${PODFILE_MARKER}${eol}${result.slice(at)}`;
  }
  return result;
}

module.exports = {
  AppFunctionsPluginError,
  addKspClasspath,
  applyAppFunctionsGradle,
  addPodfileSetup,
};
