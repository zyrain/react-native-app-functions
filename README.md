# react-native-app-functions

Let on-device AI agents call into your React Native app: Android [AppFunctions](https://developer.android.com/ai/appfunctions) (Gemini and others) and iOS [App Intents](https://developer.apple.com/documentation/appintents) (Shortcuts, Siri). You declare the functions once in TypeScript, and you implement them in JavaScript, or natively in Kotlin and Swift.

> [!WARNING]
> **Alpha (`0.2.0-alpha.0`).** Android and iOS (new in this release), bare React Native 0.87+. Google's AppFunctions library is itself alpha (`androidx.appfunctions` `1.0.0-alpha13`), so breaking changes are expected.

> [!CAUTION]
> **There is no auth gate yet.** Any caller the OS lets use AppFunctions (system agents with `EXECUTE_APP_FUNCTIONS`) can call every function you declare, even when your app isn't running and no user is signed in. For now, **expose only read-only, non-sensitive data.** An app-provided auth check and in-app confirmation for destructive actions are the next milestone.

## What it does

AppFunctions are Android's equivalent of MCP tools. An app declares typed functions, the OS indexes them at install time, and an agent discovers and calls them. The official API is Kotlin-only and annotation-driven. This library lets you declare functions in a TypeScript config and generates the Kotlin for you:

```
appfunctions.config.ts                    your functions, types and descriptions
      │  build: Gradle task runs this library's code generator
      ▼
generated Kotlin + manifest + resources   @AppFunctionDeclaration service, data classes
      │  build: Google's KSP processor
      ▼
schema in the APK                         indexed by Android at install time
      │  runtime: an agent calls a function
      ▼
your handler                              'native': Kotlin, no JS runtime needed
                                          'js':     your JS function, run via Headless JS
```

## Requirements

- React Native **0.87+**. AppFunctions needs Android Gradle Plugin 9.1+ and compileSdk 37, which RN 0.87 provides.
- The KSP Gradle plugin (`com.google.devtools.ksp`), tested with `2.3.12`.
- Node 22.13+ (it runs during the Android build).
- Agents can see the functions on Android 16 and later. On older Android versions the app builds and runs normally, and the functions simply don't exist.

## Install

```sh
npm install react-native-app-functions@alpha
# or
yarn add react-native-app-functions@alpha
```

## Setup (Expo)

Tested with Expo SDK 58 (React Native 0.88) on Android and iOS; CI builds a new SDK 58 app with
exactly this setup (`.github/workflows/expo-plugin.yml`).

1. Install the library and `expo-build-properties`, which sets the Android SDK level AppFunctions
   needs:

   ```sh
   npx expo install react-native-app-functions expo-build-properties
   ```

2. Add both plugins to your app config:

   ```json
   {
     "expo": {
       "plugins": [
         "react-native-app-functions",
         ["expo-build-properties", { "android": { "compileSdkVersion": 37, "targetSdkVersion": 37 } }]
       ]
     }
   }
   ```

3. Create `appfunctions.config.ts` next to your `package.json` (step 3 of the bare React Native
   setup below) and run `npx expo prebuild`.

The plugin applies the Android and iOS setup described below: KSP and `appfunctions.gradle` in the
Gradle files, and `appfunctions_post_install` in the Podfile. It edits the native projects that
`expo prebuild` generates, using Expo's own code generator: each addition is a marked
`@generated` block, so running prebuild again neither duplicates nor loses it. Like Expo's own
plugins, it locates those blocks by matching lines of Expo's templates; if you customise the
native files and it cannot find a match, prebuild stops with an error, and you can apply the bare
React Native setup below by hand instead.

## Setup (bare React Native)

1. Add KSP to `android/build.gradle`:

   ```groovy
   buildscript {
     dependencies {
       classpath("com.google.devtools.ksp:symbol-processing-gradle-plugin:2.3.12")
     }
   }
   ```

2. In `android/app/build.gradle`, apply KSP and this library's script:

   ```groovy
   apply plugin: "com.google.devtools.ksp"
   // ... at the end of the file:
   apply from: "../../node_modules/react-native-app-functions/android/appfunctions.gradle"
   ```

3. Create `appfunctions.config.ts` next to your `package.json`:

   ```ts
   import { defineAppFunctions } from 'react-native-app-functions/config';

   export default defineAppFunctions({
     android: {
       kotlinPackage: 'com.example.app.appfunctions',
       serviceName: 'MyAppFunctionService',
       appDescription: 'What this app lets agents do, and how to use its functions.',
     },
     types: {
       Visit: {
         description: 'A scheduled visit.',
         fields: {
           id: { type: 'string', description: 'Unique id.' },
           site: { type: 'string', description: 'Site name.' },
           at: { type: 'localDateTime', nullable: true, description: 'Scheduled time.' },
         },
       },
     },
     functions: {
       listTodaysVisits: {
         description: "Lists today's visits. Read-only.",
         handler: 'native',
         returns: { type: 'list', of: 'Visit' },
       },
       getVisit: {
         description: 'Gets one visit by id. Read-only.',
         handler: 'js',
         params: { id: { type: 'string', description: 'The visit id.' } },
         returns: { type: 'Visit' },
       },
     },
   });
   ```

4. Build once (`npx react-native run-android`). Then implement the handlers, as described in the next two sections.

## Native handlers (`handler: 'native'`)

The build generates a `fun interface` per native function, plus an `AppFunctionsHandlers` interface. Implement it on your `Application`:

```kotlin
import com.example.app.appfunctions.AppFunctionsHandlers
import com.example.app.appfunctions.ListTodaysVisitsHandler

class MainApplication : Application(), ReactApplication, AppFunctionsHandlers {
  override val listTodaysVisitsHandler = ListTodaysVisitsHandler { visitsRepository.today() }
  // ...
}
```

Native handlers run on a background thread and don't touch the JS runtime. That makes them fast, and they work when the app isn't running. Prefer them for anything an agent calls often.

## JS handlers (`handler: 'js'`)

Register the handler in a module imported at the **top of `index.js`**, before `AppRegistry.registerComponent`. An agent call can start your app headless, without mounting any component:

```ts
// src/appFunctions.ts
import { AppFunctionError, registerAppFunctionHandler } from 'react-native-app-functions';
import type config from '../appfunctions.config';

registerAppFunctionHandler<typeof config, 'getVisit'>('getVisit', async ({ id }) => {
  const visit = await db.getVisit(id);
  if (!visit) throw new AppFunctionError('NOT_FOUND', `No visit "${id}"`);
  return visit; // type-checked against the config
});
```

```js
// index.js
import { AppRegistry } from 'react-native';
import './src/appFunctions';
// ...
```

- **Types:** argument and return types are derived from `typeof config`, with no extra codegen. A wrong field, a missing field or an unknown function name is a TypeScript error.
- **Errors:** throw `AppFunctionError(code, message)` to give the agent a specific error. The codes are `INVALID_ARGUMENT`, `NOT_FOUND`, `DENIED`, `PERMISSION_REQUIRED`, `LIMIT_EXCEEDED` and `ALREADY_EXISTS`. Any other error, an invalid return value or a timeout reaches the agent as an app error with your message.
- **Timeouts:** 10 s by default; set `timeoutMs` per function (100–600000).
- **How it runs:** the call runs as a Headless JS task. If the app isn't running, React Native starts first. Handlers share the JS thread with your UI, so keep them short.
- **Debug builds** load the JS bundle from Metro on a cold start. Without Metro running, JS functions time out (native functions still work). Release builds embed the bundle.

## iOS (App Intents)

The same `appfunctions.config.ts` generates one App Intent per function, so each function shows up as an action in Shortcuts (and Siri, by the shortcut's name). `js` functions run the same `registerAppFunctionHandler` handlers as on Android.

1. In `ios/Podfile`:

   ```ruby
   require_relative '../node_modules/react-native-app-functions/ios/appfunctions'
   # …
   post_install do |installer|
     react_native_post_install(installer, config[:reactNativePath], :mac_catalyst_enabled => false)
     appfunctions_post_install(installer)
   end
   ```

2. Run `pod install`. It generates `ios/<App>/AppFunctions.generated.swift`, adds it to your app target, and adds a build phase that regenerates it on every build. Add the file to `.gitignore`. If you have several app targets, pass `target: "MyApp"`.
3. Node for the build phase comes from `ios/.xcode.env` (`NODE_BINARY`), like React Native's own build phases.

- **`js` handlers:** when an action runs with the app killed, iOS launches it in the background, React Native loads your bundle, and the call waits (up to `timeoutMs`) for the handler. An `AppFunctionError` message is shown to the user as the action's error.
- **`native` handlers:** implement the generated `AppFunctionsHandlers` protocol in Swift and register it at launch: `AppFunctionsRegistry.handlers = MyHandlers()` in `application(_:didFinishLaunchingWithOptions:)`.
- **Requirements:** iOS 16+ for the intents (older iOS builds and runs without them). Tested on the iOS 26.5 simulator. The RN 0.87 template app doesn't launch on the iOS 27 simulator until it adopts `UIScene` (not specific to this library).
- **Differences:** declared types become `TransientAppEntity` results; a field named `id` is exposed as `<type>Id`. Dates are `Date` (local dates use the device time zone). Declared types can't be parameters on iOS yet. Each function's `title` (optional, derived from its name) is the action's name.
- **New actions** may not appear in Shortcuts until the app has been opened once after install.

## Config reference

| Field | Notes |
|---|---|
| `android.kotlinPackage` | Package for generated Kotlin, e.g. `com.example.app.appfunctions`. |
| `android.serviceName` | Generated service class. Function IDs are `<kotlinPackage>.Base<serviceName>#<function>`. |
| `android.appDescription` / `appDisplayDescription` | Optional. App-level text for agents and users. |
| `types.<Name>` | `{ description?, fields: { <name>: value } }`. Becomes a Kotlin data class. |
| `functions.<name>` | `{ description, title?, handler: 'native' \| 'js', params?, returns, timeoutMs? }`. `title` is the iOS action name. |
| value | `{ type, nullable?, description? }` or `{ type: 'list', of, nullable?, description? }`. |

Value types, and how JS handlers see them:

| Type | Kotlin | JS |
|---|---|---|
| `string`, `boolean` | `String`, `Boolean` | `string`, `boolean` |
| `int`, `long`, `double` | `Int`, `Long`, `Double` | `number` (`long` loses precision above 2^53) |
| `localDate` | `LocalDate` | `"2026-10-10"` |
| `localDateTime` | `LocalDateTime` | `"2026-10-10T08:30"` |
| `instant` | `Instant` | `"2026-10-10T08:30:00Z"` |
| a name from `types` | data class | object |
| `list` of `string`, a date/time type or a declared type | `List<…>` | array |

The config is **parsed at build time and never executed**, so use literal values only: no variables, imports of values, function calls or spreads. Write descriptions for an LLM: say what a function does, when to use it, and what values mean. An invalid config fails the build with a message naming the function and field.

## Testing without a system agent

On an Android 16 QPR (API 36.1) or Android 17 device or emulator:

```sh
adb shell cmd app_function list-app-functions
adb shell "cmd app_function execute-app-function --package <applicationId> \
  --function '<kotlinPackage>.Base<serviceName>#getVisit' --parameters '{\"id\":\"v-1\"}'"
```

For a UI, use Google's [AppFunctions Testing Agent](https://github.com/android/appfunctions/tree/main/agent): pick your app, then call functions with your own arguments.

On the Android 17 emulator its `run_privileged.sh` script picks up a wrong certificate fingerprint. The workaround is to allowlist the SHA-256 from `apksigner verify --print-certs` instead, then start its `ShellIdentityInstrumentation` with `adb shell am instrument -w`.

## Known limitations

- **iOS** is new and verified on the simulator through Shortcuts; real devices, Siri phrases (App Shortcuts) and Apple Intelligence are not verified yet.
- **Expo:** the config plugin is built in CI on Android and iOS; native handlers on iOS still need the manual registration described above.
- **Android 16.0 (the initial release)** indexes functions without descriptions or parameter schemas, and execution there hasn't been verified yet. Android 16 QPR and Android 17 are verified.
- Cold-start latency has only been measured on emulators (about 100–300 ms per call). Real-device numbers are welcome.
- Not yet supported: maps, enums (use `string` and describe the allowed values), lists of numbers or booleans, nested lists, functions with no return value.

## Roadmap

1. Auth gate (an app-provided check before every call) and in-app confirmation for destructive functions.
2. JS API for support detection and enabling or disabling functions at runtime, plus an in-app test screen.
3. iOS: App Shortcuts phrases for Siri, real-device verification.

## Feedback

This release is for validation. Please [open an issue](https://github.com/Alvinotuya84/react-native-app-functions/issues) with your RN version, device or emulator, Android version, and what worked or didn't.

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
