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
