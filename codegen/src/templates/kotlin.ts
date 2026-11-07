import type { AppFunctionsModel, FunctionModel, TypeModel } from '../model';
import { handlerInterfaceName } from '../validate';
import { decodeExpr, encodeExpr } from './json';
import {
  KOTLIN_HEADER,
  importBlock,
  kdoc,
  kotlinImportsFor,
  kotlinType,
} from './shared';

/** AppFunction exceptions a JS handler can select with `AppFunctionError(code, …)`. */
const JS_ERROR_EXCEPTIONS: [code: string, exception: string][] = [
  ['INVALID_ARGUMENT', 'AppFunctionInvalidArgumentException'],
  ['NOT_FOUND', 'AppFunctionElementNotFoundException'],
  ['DENIED', 'AppFunctionDeniedException'],
  ['PERMISSION_REQUIRED', 'AppFunctionPermissionRequiredException'],
  ['LIMIT_EXCEEDED', 'AppFunctionLimitExceededException'],
  ['ALREADY_EXISTS', 'AppFunctionElementAlreadyExistsException'],
];

const hasNative = (m: AppFunctionsModel) =>
  m.functions.some((f) => f.handler === 'native');
const hasJs = (m: AppFunctionsModel) =>
  m.functions.some((f) => f.handler === 'js');

/** `Base<serviceName>.kt`: the `@AppFunctionServiceEntryPoint` class KSP turns into the service. */
export function serviceFile(m: AppFunctionsModel): string {
  const native = hasNative(m);
  const js = hasJs(m);
  const imports = [
    'androidx.annotation.RequiresApi',
    'androidx.appfunctions.AppFunctionAppUnknownException',
    'androidx.appfunctions.AppFunctionDeclaration',
    'androidx.appfunctions.AppFunctionService',
    'androidx.appfunctions.AppFunctionServiceEntryPoint',
    ...(native
      ? ['kotlinx.coroutines.Dispatchers', 'kotlinx.coroutines.withContext']
      : []),
    ...(js
      ? [
          ...JS_ERROR_EXCEPTIONS.map(([, e]) => `androidx.appfunctions.${e}`),
          'io.github.alvinotuya.appfunctions.JsBridge',
          'kotlin.coroutines.resume',
          'kotlinx.coroutines.suspendCancellableCoroutine',
          'kotlinx.coroutines.withTimeoutOrNull',
          'org.json.JSONObject',
          'org.json.JSONTokener',
        ]
      : []),
    ...(m.functions.some(
      (f) => f.handler === 'js' && f.params.some((p) => p.value.list)
    )
      ? ['org.json.JSONArray']
      : []),
    ...kotlinImportsFor(
      m.functions.flatMap((f) => [f.returns, ...f.params.map((p) => p.value)])
    ),
    ...(m.functions.some((f) => f.accessLevel === 'self')
      ? [
          'androidx.appfunctions.AppFunctionAccessLevel',
          'androidx.appfunctions.ExperimentalAppFunctionsApi',
          'androidx.appfunctions.metadata.AppFunctionMetadata',
        ]
      : []),
  ];
  const handlersProperty = native
    ? `
  private val handlers: AppFunctionsHandlers
    get() =
      applicationContext as? AppFunctionsHandlers
        ?: throw AppFunctionAppUnknownException(
          "Application does not implement AppFunctionsHandlers"
        )
`
    : '';
  return `${KOTLIN_HEADER}
package ${m.kotlinPackage}

${importBlock(imports)}${kdoc(
    [
      `AppFunctions entry point. KSP generates the concrete \`${m.serviceName}\` subclass and`,
      `\`assets/${m.xmlFileName}.xml\` (plus \`${m.xmlFileName}-v1.xml\`) from this class.`,
    ],
    ''
  )}@RequiresApi(36)
@AppFunctionServiceEntryPoint(
  serviceName = "${m.serviceName}",
  appFunctionXmlFileName = "${m.xmlFileName}",
)
abstract class ${m.baseClassName} : AppFunctionService() {
${handlersProperty}${m.functions.map(declaration).join('')}${js ? JS_HELPERS : ''}}
`;
}

function declaration(f: FunctionModel): string {
  const tags = [
    ...f.params
      .filter((p) => p.value.description !== undefined)
      .map((p) => `@param ${p.name} ${p.value.description}`),
    ...(f.returns.description !== undefined
      ? [`@return ${f.returns.description}`]
      : []),
  ];
  const doc = kdoc(
    tags.length ? [f.description, '', ...tags] : [f.description],
    '  '
  );
  const signature = f.params.length
    ? `(\n${f.params
        .map(
          (p) =>
            `    ${p.name}: ${kotlinType(p.value)}${p.value.nullable ? ' = null' : ''},\n`
        )
        .join('')}  )`
    : '()';
  const access =
    f.accessLevel === 'self'
      ? `  @OptIn(ExperimentalAppFunctionsApi::class)
  @AppFunctionAccessLevel(level = AppFunctionMetadata.ACCESS_LEVEL_SELF, isCompatEnforcementEnabled = true)
`
      : '';
  const head = `
${doc}${access}  @AppFunctionDeclaration(isDescribedByKDoc = true)
  suspend fun ${f.name}${signature}: ${kotlinType(f.returns)}`;

  if (f.handler === 'native') {
    const args = f.params.map((p) => p.name).join(', ');
    return `${head} =
    withContext(Dispatchers.IO) { handlers.${f.name}Handler.${f.name}(${args}) }
`;
  }
  const puts = f.params
    .map(
      (p) =>
        `    args.put("${p.name}", ${encodeExpr(p.value, p.name, 'AppFunctionsJson.')})\n`
    )
    .join('');
  return `${head} {
    val args = JSONObject()
${puts}    val result = callJs("${f.name}", args, ${f.timeoutMs}L)
    return decodeJsResult("${f.name}") { ${decodeExpr(f.returns, 'result', '"result"', 'AppFunctionsJson.')} }
  }
`;
}

const JS_HELPERS = `
  /** Runs the JS handler [name] via Headless JS and returns its parsed JSON result. */
  private suspend fun callJs(name: String, args: JSONObject, timeoutMs: Long): Any? {
    val result =
      withTimeoutOrNull(timeoutMs) {
        suspendCancellableCoroutine<JsBridge.Result> { cont ->
          val call =
            JsBridge.call(applicationContext, name, args.toString(), timeoutMs) { cont.resume(it) }
          cont.invokeOnCancellation { call.cancel() }
        }
      }
        ?: throw AppFunctionAppUnknownException(
          "JS handler \\"$name\\" did not respond within $timeoutMs ms"
        )
    return when (result) {
      is JsBridge.Result.Success -> JSONTokener(result.json).nextValue()
      is JsBridge.Result.Failure -> throw jsFailure(result)
    }
  }

  private fun jsFailure(failure: JsBridge.Result.Failure): Exception =
    when (failure.code) {
${JS_ERROR_EXCEPTIONS.map(([code, e]) => `      "${code}" -> ${e}(failure.message)\n`).join('')}      else -> AppFunctionAppUnknownException(failure.message)
    }

  private inline fun <T> decodeJsResult(name: String, decode: () -> T): T =
    try {
      decode()
    } catch (e: AppFunctionsJson.InvalidValueException) {
      throw AppFunctionAppUnknownException("\\"$name\\" returned an invalid value: \${e.message}")
    }
`;

/** `<TypeName>.kt`: one `@AppFunctionSerializable` data class. */
export function typeFile(m: AppFunctionsModel, t: TypeModel): string {
  const imports = [
    'androidx.appfunctions.AppFunctionSerializable',
    ...kotlinImportsFor(t.fields.map((f) => f.value)),
  ];
  const props = t.fields
    .map(
      (f) =>
        (f.value.description !== undefined
          ? kdoc([f.value.description], '  ')
          : '') + `  val ${f.name}: ${kotlinType(f.value)},\n`
    )
    .join('');
  return `${KOTLIN_HEADER}
package ${m.kotlinPackage}

${importBlock(imports)}${t.description !== undefined ? kdoc([t.description], '') : ''}@AppFunctionSerializable(isDescribedByKDoc = true)
data class ${t.name}(
${props})
`;
}

/** `AppFunctionsHandlers.kt`: what the app implements for `native` functions. */
export function handlersFile(m: AppFunctionsModel): string {
  const nativeFns = m.functions.filter((f) => f.handler === 'native');
  const imports = kotlinImportsFor(
    nativeFns.flatMap((f) => [f.returns, ...f.params.map((p) => p.value)])
  );
  const interfaces = nativeFns
    .map((f) => {
      const params = f.params
        .map((p) => `${p.name}: ${kotlinType(p.value)}`)
        .join(', ');
      return `${kdoc([`Native implementation of the \`${f.name}\` AppFunction, provided by the app.`], '')}fun interface ${handlerInterfaceName(f.name)} {
  suspend fun ${f.name}(${params}): ${kotlinType(f.returns)}
}
`;
    })
    .join('\n');
  const props = nativeFns
    .map((f) => `  val ${f.name}Handler: ${handlerInterfaceName(f.name)}\n`)
    .join('');
  return `${KOTLIN_HEADER}
package ${m.kotlinPackage}

${importBlock(imports)}${interfaces}
${kdoc(
  [
    "Implemented by the app's [android.app.Application] so the AppFunction service can reach the",
    'handlers without depending on React Native or a DI framework.',
  ],
  ''
)}interface AppFunctionsHandlers {
${props}}
`;
}

export { hasJs, hasNative };
