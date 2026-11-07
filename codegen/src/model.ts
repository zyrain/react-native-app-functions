/** Validated, normalised view of `appfunctions.config.ts`. Order follows the config. */

export const SCALARS = [
  'string',
  'int',
  'long',
  'double',
  'boolean',
  'localDate',
  'localDateTime',
  'instant',
] as const;
export type Scalar = (typeof SCALARS)[number];

/** Item types AppFunctions can serialize inside a `List` (see docs/VERIFIED.md). */
export const LIST_ITEM_SCALARS: readonly Scalar[] = [
  'string',
  'localDate',
  'localDateTime',
  'instant',
];

export type TypeRef =
  { kind: 'scalar'; scalar: Scalar } | { kind: 'named'; name: string };

export type ValueModel = {
  item: TypeRef;
  list: boolean;
  nullable: boolean;
  description?: string;
};

export type FieldModel = { name: string; value: ValueModel };

export type TypeModel = {
  name: string;
  description?: string;
  fields: FieldModel[];
};

export type FunctionModel = {
  name: string;
  description: string;
  /** User-visible name (iOS action title). Derived from `name` when the config omits it. */
  title: string;
  params: FieldModel[];
  returns: ValueModel;
  /** Who may call the function: `self` (the app's own agent) or the default trusted agents. */
  accessLevel: 'self' | 'trusted';
} & (
  | { handler: 'native' }
  /** Runs `registerAppFunctionHandler(name, …)` in JS via Headless JS. */
  | { handler: 'js'; timeoutMs: number }
);

export type AppFunctionsModel = {
  kotlinPackage: string;
  serviceName: string;
  /** Abstract class annotated with `@AppFunctionServiceEntryPoint`. Part of every function ID. */
  baseClassName: string;
  /** `appFunctionXmlFileName`, without extension. */
  xmlFileName: string;
  appDescription?: string;
  appDisplayDescription?: string;
  types: TypeModel[];
  functions: FunctionModel[];
};
