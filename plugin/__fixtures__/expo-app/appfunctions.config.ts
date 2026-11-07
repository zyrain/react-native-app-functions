import { defineAppFunctions } from 'react-native-app-functions/config';

// Used by .github/workflows/expo-plugin.yml: one JS-handled function, enough to prove the Expo
// plugin wires code generation into both native builds.
export default defineAppFunctions({
  android: {
    kotlinPackage: 'io.github.appfunctions.expoplugin.appfunctions',
    serviceName: 'ExpoPluginAppFunctionService',
    appDescription: 'Test app for the Expo config plugin.',
    appDisplayDescription: 'Expo config plugin test',
  },
  functions: {
    greet: {
      description: 'Returns a greeting.',
      handler: 'js',
      returns: { type: 'string', description: 'The greeting.' },
    },
  },
});
