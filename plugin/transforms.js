/**
 * The edits the Expo config plugin (app.plugin.js) makes to the native projects `expo prebuild`
 * generates from Expo's templates.
 *
 * They use Expo's own code generator (`CodeGenerator.mergeContents` from expo/config-plugins), the
 * same mechanism Expo's first-party plugins use: each insertion is a tagged
 * `@generated begin … @generated end` block placed relative to an anchor line, so prebuild can run
 * again without duplicating it and a changed block replaces the old one. Like Expo's plugins, the
 * anchors target Expo's generated files; customised native files may need the README's manual
 * setup instead. When an anchor is missing, the edit throws rather than leaving the project
 * unconfigured. CRLF files are accepted and keep their line endings.
 */
const { CodeGenerator } = require('expo/config-plugins');

const TAG = 'react-native-app-functions';

class AppFunctionsPluginError extends Error {
  constructor(file, message) {
    super(
      `react-native-app-functions: cannot configure ${file}: ${message}. ` +
        'Apply the setup from the README by hand.'
    );
    this.name = 'AppFunctionsPluginError';
  }
}

/** Runs `edit` on LF text and restores CRLF line endings if the file used them. */
function withLineEndings(text, edit) {
  const crlf = text.includes('\r\n');
  const result = edit(crlf ? text.replace(/\r\n/g, '\n') : text);
  return crlf ? result.replace(/\r?\n/g, '\r\n') : result;
}

/** `mergeContents`, reporting a missing anchor as an AppFunctionsPluginError. */
function merge(file, missing, options) {
  try {
    return CodeGenerator.mergeContents(options).contents;
  } catch (error) {
    if (error && error.code === 'ERR_NO_MATCH') {
      throw new AppFunctionsPluginError(file, missing);
    }
    throw error;
  }
}

/** android/build.gradle: adds the KSP Gradle plugin to the buildscript classpath. */
function addKspClasspath(gradle, kspVersion) {
  return withLineEndings(gradle, (src) =>
    merge('android/build.gradle', 'no `buildscript { dependencies {` line', {
      src,
      newSrc: `    classpath("com.google.devtools.ksp:symbol-processing-gradle-plugin:${kspVersion}")`,
      tag: `${TAG}-ksp-classpath`,
      anchor: /^\s*dependencies\s*\{/,
      offset: 1,
      comment: '//',
    })
  );
}

/**
 * android/app/build.gradle: applies the KSP plugin after the Android application plugin, and this
 * library's appfunctions.gradle (a path relative to android/app) at the end of the file, where the
 * README places it.
 */
function applyAppFunctionsGradle(gradle, scriptPath) {
  return withLineEndings(gradle, (src) => {
    const withKsp = merge(
      'android/app/build.gradle',
      'no `apply plugin: "com.android.application"` line',
      {
        src,
        newSrc: 'apply plugin: "com.google.devtools.ksp"',
        tag: `${TAG}-ksp`,
        anchor: /^\s*apply\s+plugin\s*:\s*["']com\.android\.application["']/,
        offset: 1,
        comment: '//',
      }
    );
    return appendGenerated(withKsp, {
      newSrc: `apply from: "${scriptPath}"`,
      tag: `${TAG}-script`,
      comment: '//',
    });
  });
}

/** Appends a tagged block at the end of the file, in mergeContents' format. */
function appendGenerated(src, { newSrc, tag, comment }) {
  const header = CodeGenerator.createGeneratedHeaderComment(
    newSrc,
    tag,
    comment
  );
  if (src.includes(header)) return src;
  const base = CodeGenerator.removeGeneratedContents(src, tag) ?? src;
  return `${base.replace(/\n*$/, '\n')}${header}\n${newSrc}\n${comment} @generated end ${tag}\n`;
}

/**
 * ios/Podfile: loads this library's ios/appfunctions.rb (located with Node, like Expo's own
 * requires, so any node_modules layout works) and calls `appfunctions_post_install` in the
 * `post_install` block.
 */
function addPodfileSetup(podfile) {
  return withLineEndings(podfile, (src) => {
    const withRequire = merge('ios/Podfile', 'no `require` line', {
      src,
      newSrc:
        'require File.join(File.dirname(`node --print "require.resolve(\'react-native-app-functions/package.json\')"`), "ios/appfunctions")',
      tag: `${TAG}-require`,
      anchor: /^require\s/,
      offset: 0,
      comment: '#',
    });
    return merge('ios/Podfile', 'no `post_install do |installer|` line', {
      src: withRequire,
      newSrc: '    appfunctions_post_install(installer)',
      tag: `${TAG}-post-install`,
      anchor: /^\s*post_install\s+do\s*\|\s*installer\s*\|/,
      offset: 1,
      comment: '#',
    });
  });
}

module.exports = {
  AppFunctionsPluginError,
  addKspClasspath,
  applyAppFunctionsGradle,
  addPodfileSetup,
};
