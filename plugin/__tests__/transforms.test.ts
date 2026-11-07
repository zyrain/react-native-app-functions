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
const crlf = (text: string) => text.replace(/\r?\n/g, '\r\n');
const onlyCrlf = (text: string) => !/(^|[^\r])\n/.test(text);
const count = (text: string, needle: string) => text.split(needle).length - 1;

describe('android/build.gradle', () => {
  const original = fixture('build.gradle');

  it('adds the KSP plugin to the buildscript classpath in a generated block', () => {
    const result = addKspClasspath(original, '2.3.12');
    expect(result).toMatch(
      /dependencies \{\n\/\/ @generated begin react-native-app-functions-ksp-classpath[^\n]*\n {4}classpath\("com\.google\.devtools\.ksp:symbol-processing-gradle-plugin:2\.3\.12"\)\n\/\/ @generated end react-native-app-functions-ksp-classpath\n/
    );
    expect(result).toMatchSnapshot();
  });

  it('is idempotent', () => {
    const once = addKspClasspath(original, '2.3.12');
    expect(addKspClasspath(once, '2.3.12')).toBe(once);
  });

  it('replaces its block when the KSP version changes', () => {
    const updated = addKspClasspath(
      addKspClasspath(original, '2.3.12'),
      '2.4.0'
    );
    expect(updated).toContain('symbol-processing-gradle-plugin:2.4.0');
    expect(updated).not.toContain('symbol-processing-gradle-plugin:2.3.12');
    expect(count(updated, '@generated begin')).toBe(1);
  });

  it('fails when there is no dependencies block', () => {
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
    expect(lines[1]).toMatch(
      /^\/\/ @generated begin react-native-app-functions-ksp /
    );
    expect(lines[2]).toBe('apply plugin: "com.google.devtools.ksp"');
    expect(result.trimEnd().split('\n').slice(-2)).toEqual([
      `apply from: "${SCRIPT}"`,
      '// @generated end react-native-app-functions-script',
    ]);
    expect(result).toMatchSnapshot();
  });

  it('is idempotent', () => {
    const once = applyAppFunctionsGradle(original, SCRIPT);
    expect(applyAppFunctionsGradle(once, SCRIPT)).toBe(once);
  });

  it('replaces the script block when the path changes', () => {
    const updated = applyAppFunctionsGradle(
      applyAppFunctionsGradle(original, SCRIPT),
      '../other/appfunctions.gradle'
    );
    expect(updated).toContain('apply from: "../other/appfunctions.gradle"');
    expect(updated).not.toContain(SCRIPT);
    expect(count(updated, 'react-native-app-functions-script')).toBe(2);
  });

  it('fails without the Android application plugin', () => {
    expect(() =>
      applyAppFunctionsGradle('apply plugin: "com.android.library"\n', SCRIPT)
    ).toThrow(AppFunctionsPluginError);
  });
});

describe('ios/Podfile', () => {
  const original = fixture('Podfile');

  it('requires appfunctions.rb, resolved through Node, before the other requires', () => {
    const lines = addPodfileSetup(original).split('\n');
    expect(lines[0]).toMatch(
      /^# @generated begin react-native-app-functions-require /
    );
    expect(lines[1]).toContain(
      "require.resolve('react-native-app-functions/package.json')"
    );
    expect(lines[1]).toContain('"ios/appfunctions")');
  });

  it('calls appfunctions_post_install in the post_install block', () => {
    const result = addPodfileSetup(original);
    expect(result).toMatch(
      /\n {2}post_install do \|installer\|\n# @generated begin react-native-app-functions-post-install[^\n]*\n {4}appfunctions_post_install\(installer\)\n# @generated end react-native-app-functions-post-install\n {4}react_native_post_install\(/
    );
    expect(result).toMatchSnapshot();
  });

  it('is idempotent', () => {
    const once = addPodfileSetup(original);
    expect(addPodfileSetup(once)).toBe(once);
  });

  it('fails without a post_install block', () => {
    expect(() =>
      addPodfileSetup("require 'json'\ntarget 'App' do\nend\n")
    ).toThrow(AppFunctionsPluginError);
  });
});

describe('CRLF line endings', () => {
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
