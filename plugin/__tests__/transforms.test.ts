import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  AppFunctionsPluginError,
  addKspClasspath,
  addPodfileSetup,
  applyAppFunctionsGradle,
} from '../transforms';

const fixture = (name: string) =>
  fs.readFileSync(
    path.join(__dirname, '../__fixtures__/expo-sdk-58', name),
    'utf8'
  );

const SCRIPT =
  '../../node_modules/react-native-app-functions/android/appfunctions.gradle';

describe('android/build.gradle', () => {
  const original = fixture('build.gradle');

  it('adds the KSP plugin to the buildscript classpath', () => {
    const result = addKspClasspath(original, '2.3.12');
    expect(result).toContain(
      'classpath("com.google.devtools.ksp:symbol-processing-gradle-plugin:2.3.12")'
    );
    expect(result).toMatchSnapshot();
  });

  it('is idempotent', () => {
    const once = addKspClasspath(original, '2.3.12');
    expect(addKspClasspath(once, '2.3.12')).toBe(once);
  });

  it('keeps a KSP classpath the app already declares', () => {
    const declared = addKspClasspath(original, '9.9.9');
    expect(addKspClasspath(declared, '2.3.12')).toBe(declared);
  });

  it('fails when there is no buildscript dependencies block', () => {
    expect(() => addKspClasspath('plugins { id "x" }\n', '2.3.12')).toThrow(
      AppFunctionsPluginError
    );
  });
});

describe('android/app/build.gradle', () => {
  const original = fixture('app.build.gradle');

  it('applies KSP after the Android application plugin and appfunctions.gradle at the end', () => {
    const result = applyAppFunctionsGradle(original, SCRIPT);
    const lines = result.split('\n');
    expect(lines[0]).toBe('apply plugin: "com.android.application"');
    expect(lines[1]).toBe(
      'apply plugin: "com.google.devtools.ksp" // react-native-app-functions'
    );
    expect(result.trimEnd().split('\n').pop()).toBe(
      `apply from: "${SCRIPT}" // react-native-app-functions`
    );
    expect(result).toMatchSnapshot();
  });

  it('is idempotent', () => {
    const once = applyAppFunctionsGradle(original, SCRIPT);
    expect(applyAppFunctionsGradle(once, SCRIPT)).toBe(once);
  });

  it('fails without the Android application plugin', () => {
    expect(() =>
      applyAppFunctionsGradle('apply plugin: "com.android.library"\n', SCRIPT)
    ).toThrow(AppFunctionsPluginError);
  });
});

describe('ios/Podfile', () => {
  const original = fixture('Podfile');

  it('requires appfunctions.rb after the existing requires, resolved through Node', () => {
    const result = addPodfileSetup(original);
    const requires = result
      .split('\n')
      .filter((line: string) => line.startsWith('require '));
    expect(requires[requires.length - 1]).toContain(
      "require.resolve('react-native-app-functions/package.json')"
    );
    expect(requires[requires.length - 1]).toContain('"ios/appfunctions"');
  });

  it("calls appfunctions_post_install last in the post_install block, after React Native's step", () => {
    const result = addPodfileSetup(original);
    const call = result.indexOf('appfunctions_post_install(installer)');
    expect(call).toBeGreaterThan(result.indexOf('react_native_post_install('));
    const block = result.slice(result.indexOf('post_install do |installer|'));
    expect(block).toMatch(
      /:ccache_enabled => ccache_enabled\?\(podfile_properties\),\n {4}\)\n {4}appfunctions_post_install\(installer\) # react-native-app-functions\n {2}end\nend\n/
    );
    expect(result).toMatchSnapshot();
  });

  it('is idempotent', () => {
    const once = addPodfileSetup(original);
    expect(addPodfileSetup(once)).toBe(once);
  });

  it('fails without a post_install block', () => {
    expect(() => addPodfileSetup("target 'App' do\nend\n")).toThrow(
      AppFunctionsPluginError
    );
  });
});

describe('existing setup is recognised only in code, not in comments', () => {
  it('adds the KSP classpath when only a comment mentions it', () => {
    const gradle = fixture('build.gradle').replace(
      'buildscript {',
      '// classpath("com.google.devtools.ksp:symbol-processing-gradle-plugin:1.0")\nbuildscript {'
    );
    expect(addKspClasspath(gradle, '2.3.12')).toContain(
      'classpath("com.google.devtools.ksp:symbol-processing-gradle-plugin:2.3.12")'
    );
  });

  it('applies KSP and appfunctions.gradle when only comments mention them', () => {
    const gradle =
      fixture('app.build.gradle') +
      '\n// apply plugin: "com.google.devtools.ksp"\n/* apply from: "../appfunctions.gradle" */\n// see appfunctions.gradle\n';
    const result = applyAppFunctionsGradle(gradle, SCRIPT);
    expect(result).toContain(
      'apply plugin: "com.google.devtools.ksp" // react-native-app-functions'
    );
    expect(result).toContain(
      `apply from: "${SCRIPT}" // react-native-app-functions`
    );
  });

  it('adds the Podfile require and hook when only comments mention appfunctions', () => {
    const podfile = fixture('Podfile')
      .replace(
        "require 'json'",
        "require 'json'\n# appfunctions: see ios/appfunctions"
      )
      .replace(
        '  post_install do |installer|\n',
        '  post_install do |installer|\n    # appfunctions_post_install(installer)\n'
      );
    const result = addPodfileSetup(podfile);
    expect(result).toMatch(
      /^require .*"ios\/appfunctions"\) # react-native-app-functions$/m
    );
    expect(result).toMatch(
      /^ {4}appfunctions_post_install\(installer\) # react-native-app-functions$/m
    );
  });
});

describe('CRLF line endings', () => {
  const crlf = (text: string) => text.replace(/\r?\n/g, '\r\n');
  const onlyCrlf = (text: string) => !/(^|[^\r])\n/.test(text);

  it('configures android/build.gradle', () => {
    const result = addKspClasspath(crlf(fixture('build.gradle')), '2.3.12');
    expect(result).toContain('symbol-processing-gradle-plugin:2.3.12');
    expect(onlyCrlf(result)).toBe(true);
    expect(addKspClasspath(result, '2.3.12')).toBe(result);
  });

  it('configures android/app/build.gradle', () => {
    const result = applyAppFunctionsGradle(
      crlf(fixture('app.build.gradle')),
      SCRIPT
    );
    expect(result).toContain('apply plugin: "com.google.devtools.ksp"');
    expect(result).toContain(`apply from: "${SCRIPT}"`);
    expect(onlyCrlf(result)).toBe(true);
    expect(applyAppFunctionsGradle(result, SCRIPT)).toBe(result);
  });

  it('configures ios/Podfile', () => {
    const result = addPodfileSetup(crlf(fixture('Podfile')));
    expect(result).toContain('"ios/appfunctions")');
    expect(result).toContain('    appfunctions_post_install(installer)');
    expect(onlyCrlf(result)).toBe(true);
    expect(addPodfileSetup(result)).toBe(result);
  });
});

describe('ordinary spacing and quoting', () => {
  it('accepts single quotes and extra spaces in the application plugin line', () => {
    const gradle = fixture('app.build.gradle').replace(
      'apply plugin: "com.android.application"',
      "apply plugin:  'com.android.application'  "
    );
    expect(applyAppFunctionsGradle(gradle, SCRIPT)).toContain(
      'apply plugin: "com.google.devtools.ksp"'
    );
  });

  it('recognises a KSP plugin applied with the plugins DSL', () => {
    const gradle = fixture('app.build.gradle').replace(
      'apply plugin: "com.android.application"',
      'apply plugin: "com.android.application"\nplugins { }\n  id("com.google.devtools.ksp")'
    );
    expect(applyAppFunctionsGradle(gradle, SCRIPT)).not.toContain(
      'apply plugin: "com.google.devtools.ksp"'
    );
  });

  it('accepts extra spaces in the post_install block opening', () => {
    const podfile = fixture('Podfile').replace(
      'post_install do |installer|',
      'post_install do | installer |'
    );
    expect(addPodfileSetup(podfile)).toContain(
      'appfunctions_post_install(installer)'
    );
  });
});
