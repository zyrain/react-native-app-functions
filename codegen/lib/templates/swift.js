"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SWIFT_FILE_NAME = void 0;
exports.iosProblems = iosProblems;
exports.swiftFile = swiftFile;
const validate_1 = require("../validate");
const shared_1 = require("./shared");
/** File name of the generated Swift source in the iOS app target. */
exports.SWIFT_FILE_NAME = 'AppFunctions.generated.swift';
const SWIFT_HEADER = `// ${shared_1.GENERATED_NOTE}`;
const SCALAR_SWIFT = {
    string: 'String',
    int: 'Int',
    long: 'Int',
    double: 'Double',
    boolean: 'Bool',
    // Time-zone dependent: a local date/time becomes the matching instant in the device's zone.
    localDate: 'Date',
    localDateTime: 'Date',
    instant: 'Date',
};
const SWIFT_KEYWORDS = new Set([
    'associatedtype',
    'class',
    'deinit',
    'enum',
    'extension',
    'fileprivate',
    'func',
    'import',
    'init',
    'inout',
    'internal',
    'let',
    'open',
    'operator',
    'private',
    'precedencegroup',
    'protocol',
    'public',
    'rethrows',
    'static',
    'struct',
    'subscript',
    'typealias',
    'var',
    'break',
    'case',
    'catch',
    'continue',
    'default',
    'defer',
    'do',
    'else',
    'fallthrough',
    'for',
    'guard',
    'if',
    'in',
    'repeat',
    'return',
    'throw',
    'switch',
    'where',
    'while',
    'as',
    'await',
    'false',
    'is',
    'nil',
    'super',
    'throws',
    'true',
    'try',
]);
/** Swift/Foundation names a declared type must not shadow in the generated file. */
const SWIFT_RESERVED_TYPE_NAMES = new Set([
    'Any',
    'Array',
    'Bool',
    'Character',
    'Data',
    'Date',
    'Decimal',
    'Dictionary',
    'Double',
    'Error',
    'Float',
    'Int',
    'Never',
    'Optional',
    'Result',
    'Set',
    'String',
    'URL',
    'UUID',
    'Void',
]);
/** Members of `TransientAppEntity` that a field with the same name would clash with. */
const ENTITY_MEMBERS = new Set(['id', 'displayRepresentation']);
/** Members of `AppIntent` that a parameter with the same name would clash with. */
const INTENT_MEMBERS = new Set(['perform', 'parameterSummary']);
const isNative = (f) => f.handler === 'native';
const isJs = (f) => f.handler === 'js';
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const upperFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** Identifier, backtick-escaped when it is a Swift keyword. */
const ident = (name) => SWIFT_KEYWORDS.has(name) ? `\`${name}\`` : name;
/** Argument label: only `inout`, `var` and `let` need escaping there. */
const label = (name) => ['inout', 'var', 'let'].includes(name) ? `\`${name}\`` : name;
const entityName = (type) => `${type}Entity`;
const intentName = (f) => `${upperFirst(f.name)}Intent`;
/** Swift property name of a field inside its entity (renamed when it clashes with an entity member). */
function entityProperty(t, field) {
    return ENTITY_MEMBERS.has(field)
        ? `${lowerFirst(t.name)}${upperFirst(field)}`
        : field;
}
/** Problems that only matter for the iOS output. Checked when the Swift file is generated. */
function iosProblems(m) {
    const problems = [];
    const typeNames = new Set(m.types.map((t) => t.name));
    const generated = new Set([
        'AppFunctionsHandlers',
        'AppFunctionsRegistry',
        'AppFunctionsIntentError',
        'AppFunctionsJson',
        ...m.types.map((t) => entityName(t.name)),
        ...m.functions.flatMap((f) => [
            intentName(f),
            (0, validate_1.handlerInterfaceName)(f.name),
        ]),
    ]);
    for (const t of m.types) {
        if (SWIFT_RESERVED_TYPE_NAMES.has(t.name) || generated.has(t.name)) {
            problems.push(`type "${t.name}": this name is reserved on iOS (Swift built-in or a generated type); pick another`);
        }
        const names = new Set(t.fields.map((f) => f.name));
        for (const f of t.fields) {
            if (f.name === 'self') {
                problems.push(`type "${t.name}", field "self": not a valid name on iOS`);
            }
            const prop = entityProperty(t, f.name);
            if (prop !== f.name && names.has(prop)) {
                problems.push(`type "${t.name}", field "${f.name}": on iOS it becomes "${prop}", which is already a field; rename one of them`);
            }
        }
    }
    for (const f of m.functions) {
        for (const p of f.params) {
            const where = `function "${f.name}", param "${p.name}"`;
            if (p.name === 'self' || INTENT_MEMBERS.has(p.name)) {
                problems.push(`${where}: this name is reserved on iOS; pick another`);
            }
            if (p.value.item.kind === 'named' && typeNames.has(p.value.item.name)) {
                problems.push(`${where}: declared types as parameters are not supported on iOS yet; pass scalar fields instead`);
            }
        }
    }
    return problems;
}
/** `AppFunctions.generated.swift`: App Intents for the iOS app target. */
function swiftFile(m) {
    const native = m.functions.filter(isNative);
    const js = m.functions.filter(isJs);
    // `AppFunctions` is the library pod; it holds the bridge that runs JS handlers.
    const imports = [
        'AppIntents',
        'Foundation',
        ...(js.length ? ['AppFunctions'] : []),
    ]
        .sort()
        .map((i) => `import ${i}\n`)
        .join('');
    const parts = [`${SWIFT_HEADER}\n${imports}`];
    parts.push(...m.types.map(structDecl));
    if (native.length) {
        parts.push(...native.map(handlerProtocol), registry(native));
    }
    if (m.functions.length)
        parts.push(ERROR_TYPE);
    if (js.length)
        parts.push(jsonCodec(m));
    parts.push(...m.types.map(entityDecl));
    parts.push(...m.functions.map(intentDecl));
    return parts.join('\n');
}
// Fixed helpers. String.raw keeps Swift's backslashes.
const SWIFT_JSON_HELPERS = String.raw `
  static func orNull<T>(_ v: T?, _ encode: (T) -> Any) -> Any {
    v.map(encode) ?? NSNull()
  }

  static func orNil<T>(_ v: Any?, _ decode: (Any) throws -> T) rethrows -> T? {
    guard let v = v, !(v is NSNull) else { return nil }
    return try decode(v)
  }

  static func obj(_ v: Any?, _ path: String) throws -> [String: Any] {
    guard let o = v as? [String: Any] else { throw invalid(path, "an object", v) }
    return o
  }

  static func string(_ v: Any?, _ path: String) throws -> String {
    guard let s = v as? String else { throw invalid(path, "a string", v) }
    return s
  }

  static func boolean(_ v: Any?, _ path: String) throws -> Bool {
    guard let n = v as? NSNumber, isBool(n) else { throw invalid(path, "a boolean", v) }
    return n.boolValue
  }

  static func double(_ v: Any?, _ path: String) throws -> Double {
    guard let n = v as? NSNumber, !isBool(n) else { throw invalid(path, "a number", v) }
    return n.doubleValue
  }

  static func long(_ v: Any?, _ path: String) throws -> Int {
    guard let n = v as? NSNumber, !isBool(n), let i = Int(exactly: n.doubleValue) else {
      throw invalid(path, "an integer", v)
    }
    return i
  }

  static func int(_ v: Any?, _ path: String) throws -> Int {
    let i = try long(v, path)
    guard Int(Int32.min)...Int(Int32.max) ~= i else { throw invalid(path, "a 32-bit integer", v) }
    return i
  }

  static func localDate(_ v: Any?, _ path: String) throws -> Date {
    try parse(v, path, "an ISO-8601 date like 2026-10-10", ["yyyy-MM-dd"])
  }

  static func localDateTime(_ v: Any?, _ path: String) throws -> Date {
    try parse(
      v, path, "an ISO-8601 local date-time like 2026-10-10T08:30",
      ["yyyy-MM-dd'T'HH:mm", "yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm:ss.SSS"])
  }

  static func instant(_ v: Any?, _ path: String) throws -> Date {
    let s = try string(v, path)
    for options: ISO8601DateFormatter.Options in [
      [.withInternetDateTime], [.withInternetDateTime, .withFractionalSeconds],
    ] {
      let f = ISO8601DateFormatter()
      f.formatOptions = options
      if let d = f.date(from: s) { return d }
    }
    throw invalid(path, "an ISO-8601 instant like 2026-10-10T08:30:00Z", v)
  }

  static func list<T>(_ v: Any?, _ path: String, _ item: (Any?, String) throws -> T) throws -> [T] {
    guard let a = v as? [Any] else { throw invalid(path, "an array", v) }
    return try a.enumerated().map { try item($0.element, "\(path)[\($0.offset)]") }
  }

  /// Local dates and date-times use the device's current time zone.
  static func encodeLocalDate(_ d: Date) -> String { formatter("yyyy-MM-dd").string(from: d) }

  static func encodeLocalDateTime(_ d: Date) -> String {
    formatter("yyyy-MM-dd'T'HH:mm:ss").string(from: d)
  }

  static func encodeInstant(_ d: Date) -> String { ISO8601DateFormatter().string(from: d) }

  private static func formatter(_ format: String) -> DateFormatter {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.calendar = Calendar(identifier: .iso8601)
    f.timeZone = TimeZone.current
    f.dateFormat = format
    f.isLenient = false
    return f
  }

  private static func parse(_ v: Any?, _ path: String, _ expected: String, _ formats: [String]) throws -> Date {
    let s = try string(v, path)
    for format in formats {
      if let d = formatter(format).date(from: s) { return d }
    }
    throw invalid(path, expected, v)
  }

  private static func isBool(_ n: NSNumber) -> Bool { CFGetTypeID(n) == CFBooleanGetTypeID() }

  private static func invalid(_ path: String, _ expected: String, _ v: Any?) -> InvalidValue {
    guard let v = v, !(v is NSNull) else {
      return InvalidValue(message: "\(path) is missing or null, expected \(expected)")
    }
    return InvalidValue(message: "\(path): expected \(expected), got \(describe(v))")
  }

  private static func describe(_ v: Any) -> String {
    switch v {
    case is [String: Any]: return "an object"
    case is [Any]: return "an array"
    case let s as String: return "\"\(s.prefix(40))\""
    case let n as NSNumber where isBool(n): return n.boolValue ? "true" : "false"
    default: return "\(v)"
    }
  }
`;
function docComment(text, indent) {
    if (text === undefined)
        return '';
    return text
        .split('\n')
        .map((l) => (l === '' ? `${indent}///\n` : `${indent}/// ${l}\n`))
        .join('');
}
function swiftString(s) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
/** Plain value type used by native handlers. */
function swiftType(v) {
    const item = v.item.kind === 'named' ? v.item.name : SCALAR_SWIFT[v.item.scalar];
    return (v.list ? `[${item}]` : item) + (v.nullable ? '?' : '');
}
/** Type the intent exposes to the system: declared types become their entities. */
function intentType(v) {
    const item = v.item.kind === 'named'
        ? entityName(v.item.name)
        : SCALAR_SWIFT[v.item.scalar];
    return (v.list ? `[${item}]` : item) + (v.nullable ? '?' : '');
}
/** Converts `expr` (a `swiftType(v)` value) to `intentType(v)`. */
function toIntent(v, expr) {
    if (v.item.kind !== 'named')
        return expr;
    const init = `${entityName(v.item.name)}.init`;
    if (v.list)
        return v.nullable ? `${expr}?.map(${init})` : `${expr}.map(${init})`;
    return v.nullable
        ? `${expr}.map(${init})`
        : `${entityName(v.item.name)}(${expr})`;
}
function structDecl(t) {
    const fields = t.fields
        .map((f) => `${docComment(f.value.description, '  ')}  var ${ident(f.name)}: ${swiftType(f.value)}\n`)
        .join('');
    return `${docComment(t.description, '')}struct ${t.name} {\n${fields}}\n`;
}
function handlerProtocol(f) {
    const params = f.params
        .map((p) => `${ident(p.name)}: ${swiftType(p.value)}`)
        .join(', ');
    return `/// Native implementation of the \`${f.name}\` AppFunction, provided by the app.
protocol ${(0, validate_1.handlerInterfaceName)(f.name)} {
  func ${ident(f.name)}(${params}) async throws -> ${swiftType(f.returns)}
}
`;
}
function registry(fns) {
    const props = fns
        .map((f) => `  var ${f.name}Handler: ${(0, validate_1.handlerInterfaceName)(f.name)} { get }\n`)
        .join('');
    return `/// Implemented by the app and registered in \`AppFunctionsRegistry.handlers\` at launch, so the
/// App Intents can reach the handlers without depending on React Native.
protocol AppFunctionsHandlers {
${props}}

enum AppFunctionsRegistry {
  /// Set this in \`application(_:didFinishLaunchingWithOptions:)\`.
  static var handlers: AppFunctionsHandlers?
}
`;
}
const ERROR_TYPE = `/// An error whose message Shortcuts and Siri show to the user.
@available(iOS 16.0, *)
struct AppFunctionsIntentError: Error, CustomLocalizedStringResourceConvertible {
  let message: String
  var localizedStringResource: LocalizedStringResource {
    LocalizedStringResource(stringLiteral: message)
  }
}
`;
/** Title and subtitle: the first two non-null, non-list string fields other than `id`. */
function displayRepresentation(t) {
    const shown = t.fields
        .filter((f) => f.name !== 'id' &&
        !f.value.list &&
        !f.value.nullable &&
        f.value.item.kind === 'scalar' &&
        f.value.item.scalar === 'string')
        .slice(0, 2)
        .map((f) => `"\\(${ident(entityProperty(t, f.name))})"`);
    const args = shown.length === 0
        ? `title: ${swiftString((0, validate_1.titleCase)(t.name))}`
        : shown.length === 1
            ? `title: ${shown[0]}`
            : `title: ${shown[0]}, subtitle: ${shown[1]}`;
    return `  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(${args})
  }
`;
}
function entityDecl(t) {
    const props = t.fields
        .map((f) => `  @Property(title: ${swiftString((0, validate_1.titleCase)(f.name))})\n  var ${ident(entityProperty(t, f.name))}: ${intentType(f.value)}\n`)
        .join('');
    const assigns = t.fields
        .map((f) => `    ${ident(entityProperty(t, f.name))} = ${toIntent(f.value, `value.${ident(f.name)}`)}\n`)
        .join('');
    return `@available(iOS 16.0, *)
struct ${entityName(t.name)}: TransientAppEntity {
  static let typeDisplayRepresentation: TypeDisplayRepresentation = ${swiftString((0, validate_1.titleCase)(t.name))}

${props}
${displayRepresentation(t)}
  init() {}

  init(_ value: ${t.name}) {
${assigns}  }
}
`;
}
function parameterDecl(p) {
    const description = p.value.description !== undefined
        ? `, description: ${swiftString(p.value.description.replace(/\n/g, ' '))}`
        : '';
    return `  @Parameter(title: ${swiftString((0, validate_1.titleCase)(p.name))}${description})
  var ${ident(p.name)}: ${swiftType(p.value)}
`;
}
function intentDecl(f) {
    const params = f.params.map(parameterDecl).join('');
    const args = f.params
        .map((p) => `${label(p.name)}: ${ident(p.name)}`)
        .join(', ');
    return `@available(iOS 16.0, *)
struct ${intentName(f)}: AppIntent {
  static let title: LocalizedStringResource = ${swiftString(f.title)}
  static let description = IntentDescription(
    ${swiftString(f.description.replace(/\n/g, ' '))}
  )
${params ? `\n${params}` : ''}
  func perform() async throws -> some IntentResult & ReturnsValue<${intentType(f.returns)}> {
${f.handler === 'native' ? nativeBody(f, args) : jsBody(f)}    return .result(value: ${toIntent(f.returns, 'value')})
  }
}
`;
}
function nativeBody(f, args) {
    return `    guard let handlers = AppFunctionsRegistry.handlers else {
      throw AppFunctionsIntentError(message: "The app did not register AppFunctionsHandlers")
    }
    let value = try await handlers.${f.name}Handler.${ident(f.name)}(${args})
`;
}
function jsBody(f) {
    const args = f.params.length
        ? `[\n${f.params
            .map((p) => `      ${swiftString(p.name)}: ${encodeSwift(p.value, ident(p.name))},\n`)
            .join('')}    ]`
        : '[:]';
    return `    let args: [String: Any] = ${args}
    let value: ${swiftType(f.returns)} = try await AppFunctionsJson.call(
      ${swiftString(f.name)}, args, timeoutMs: ${f.timeoutMs}
    ) { result in
      try ${decodeSwift(f.returns, 'result', '"result"', 'AppFunctionsJson.')}
    }
`;
}
const DATE_SCALARS = ['localDate', 'localDateTime', 'instant'];
/** Swift expression encoding `x` (of type `v`) into a JSON-serializable value. */
function encodeSwift(v, x) {
    const item = (y) => v.item.kind === 'scalar' && DATE_SCALARS.includes(v.item.scalar)
        ? `AppFunctionsJson.encode${upperFirst(v.item.scalar)}(${y})`
        : y;
    const nonNull = (y) => v.list && item('$0') !== '$0' ? `${y}.map { ${item('$0')} }` : item(y);
    return v.nullable
        ? `AppFunctionsJson.orNull(${x}) { ${nonNull('$0')} }`
        : nonNull(x);
}
/** Swift expression decoding `src` (a parsed JSON value) into `swiftType(v)`, failing with `path`. */
function decodeSwift(v, src, path, prefix) {
    const item = (y, p) => v.item.kind === 'named'
        ? `${prefix}decode${v.item.name}(${y}, ${p})`
        : `${prefix}${v.item.scalar}(${y}, ${p})`;
    const nonNull = (y) => v.list
        ? `${prefix}list(${y}, ${path}) { item, itemPath in try ${item('item', 'itemPath')} }`
        : item(y, path);
    return v.nullable
        ? `${prefix}orNil(${src}) { try ${nonNull('$0')} }`
        : nonNull(src);
}
function typeDecoder(t) {
    const args = t.fields
        .map((f) => `      ${label(f.name)}: ${decodeSwift(f.value, `o[${swiftString(f.name)}]`, `path + ${swiftString(`.${f.name}`)}`, '')}`)
        .join(',\n');
    return `
  static func decode${t.name}(_ v: Any?, _ path: String) throws -> ${t.name} {
    let o = try obj(v, path)
    return try ${t.name}(
${args}
    )
  }
`;
}
/** \`AppFunctionsJson\`: generated only when the config has \`js\` functions. */
function jsonCodec(m) {
    return `/// JSON encoding for values exchanged with JS handlers. Dates and times are ISO-8601 strings;
/// decoding is strict and reports the path of the first invalid value.
@available(iOS 16.0, *)
enum AppFunctionsJson {
  struct InvalidValue: Error {
    let message: String
  }

  /// Runs the JS handler \`name\` and decodes its result. Failures become messages for the user.
  static func call<T>(
    _ name: String, _ args: [String: Any], timeoutMs: Int, decode: (Any) throws -> T
  ) async throws -> T {
    let argsJson = String(decoding: try JSONSerialization.data(withJSONObject: args), as: UTF8.self)
    let resultJson: String
    do {
      resultJson = try await AppFunctionsJsBridge.shared.call(
        name: name, argsJson: argsJson, timeoutMs: timeoutMs)
    } catch let failure as AppFunctionsJsBridge.Failure {
      throw AppFunctionsIntentError(message: failure.message)
    }
    do {
      let result = try JSONSerialization.jsonObject(
        with: Data(resultJson.utf8), options: .fragmentsAllowed)
      return try decode(result)
    } catch let invalid as InvalidValue {
      throw AppFunctionsIntentError(message: "\\"\\(name)\\" returned an invalid value: \\(invalid.message)")
    } catch {
      throw AppFunctionsIntentError(message: "\\"\\(name)\\" returned invalid JSON")
    }
  }
${m.types.map(typeDecoder).join('')}${SWIFT_JSON_HELPERS}}
`;
}
