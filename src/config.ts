/**
 * Types for `appfunctions.config.ts`.
 *
 * The config is read statically at build time by the codegen (it is parsed, never executed), so
 * it must be a plain object literal: strings, booleans, nested objects. No variables, calls or
 * spreads.
 */

/** Built-in value types. */
export type AppFunctionScalarType =
  | 'string'
  | 'int'
  | 'long'
  | 'double'
  | 'boolean'
  | 'localDate'
  | 'localDateTime'
  | 'instant';

/** A built-in type, or the name of a type declared under `types`. */
export type AppFunctionTypeName = AppFunctionScalarType | (string & {});

type Described = {
  /** Shown to the agent. Write it for an LLM: what it is, units, allowed values. */
  description?: string;
};

export type AppFunctionValueSpec = Described & {
  /** `null` is allowed. Nullable parameters are optional for the caller. */
  nullable?: boolean;
} & (
    | { type: AppFunctionTypeName }
    | {
        type: 'list';
        /** Item type. AppFunctions supports lists of `string`, date/time types and declared types. */
        of: AppFunctionTypeName;
      }
  );

export type AppFunctionTypeSpec = Described & {
  fields: Record<string, AppFunctionValueSpec>;
};

export type AppFunctionSpec = {
  /** Shown to the agent. Say what the function does and when to use it. */
  description: string;
  /**
   * Short user-visible name, e.g. "Create Note". iOS shows it in Shortcuts and Siri. Default:
   * derived from the function name (`createNote` → "Create Note").
   */
  title?: string;
  /**
   * `native`: implemented in Kotlin by the app (fast, works without the JS runtime).
   * `js`: implemented with `registerAppFunctionHandler`, run as a Headless JS task.
   */
  handler: 'native' | 'js';
  /** `js` only: how long to wait for the handler, in ms. Default 10000. */
  timeoutMs?: number;
  /**
   * Android: who may call the function. `self` limits it to the app's own agent (for example the
   * ML Kit Agent API); `trusted` (default) also allows trusted system agents such as Gemini.
   */
  accessLevel?: 'self' | 'trusted';
  params?: Record<string, AppFunctionValueSpec>;
  returns: AppFunctionValueSpec;
};

export type AppFunctionsConfig = {
  android: {
    /** Kotlin package for the generated sources, e.g. `com.example.app.appfunctions`. */
    kotlinPackage: string;
    /** Name of the generated service class, e.g. `MyAppFunctionService`. */
    serviceName: string;
    /** App-level description for agents (`AppFunctionAppMetadata`). */
    appDescription?: string;
    /** Short user-visible description of what agents can do in this app. */
    appDisplayDescription?: string;
  };
  types?: Record<string, AppFunctionTypeSpec>;
  functions: Record<string, AppFunctionSpec>;
};

/** Identity helper that type-checks `appfunctions.config.ts`. */
export function defineAppFunctions<const T extends AppFunctionsConfig>(
  config: T
): T {
  return config;
}
