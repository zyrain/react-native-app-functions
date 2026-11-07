"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_JS_TIMEOUT_MS = void 0;
exports.validateConfig = validateConfig;
exports.handlerInterfaceName = handlerInterfaceName;
exports.titleCase = titleCase;
exports.snakeCase = snakeCase;
const errors_1 = require("./errors");
const model_1 = require("./model");
const KOTLIN_HARD_KEYWORDS = new Set([
    'as',
    'break',
    'class',
    'continue',
    'do',
    'else',
    'false',
    'for',
    'fun',
    'if',
    'in',
    'interface',
    'is',
    'null',
    'object',
    'package',
    'return',
    'super',
    'this',
    'throw',
    'true',
    'try',
    'typealias',
    'typeof',
    'val',
    'var',
    'when',
    'while',
]);
/** Kotlin/stdlib names a declared type must not shadow in generated code. */
const RESERVED_TYPE_NAMES = new Set([
    'Any',
    'Boolean',
    'Double',
    'Float',
    'Instant',
    'Int',
    'List',
    'LocalDate',
    'LocalDateTime',
    'Long',
    'Nothing',
    'String',
    'Unit',
]);
exports.DEFAULT_JS_TIMEOUT_MS = 10_000;
const MIN_JS_TIMEOUT_MS = 100;
const MAX_JS_TIMEOUT_MS = 600_000;
const LOWER_CAMEL = /^[a-z][A-Za-z0-9]*$/;
const UPPER_CAMEL = /^[A-Z][A-Za-z0-9]*$/;
const PACKAGE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
/** Validates the parsed config. Collects every problem and throws them together. */
function validateConfig(raw) {
    const problems = [];
    const fail = (where, message) => problems.push(`${where}: ${message}`);
    const root = asObject(raw);
    if (!root)
        throw new errors_1.ConfigError(['config: the default export must be an object']);
    checkKeys(root, ['android', 'types', 'functions'], 'config', fail);
    // android
    const android = asObject(root.android);
    let kotlinPackage = '';
    let serviceName = '';
    let appDescription;
    let appDisplayDescription;
    if (!android) {
        fail('android', 'required object is missing');
    }
    else {
        checkKeys(android, [
            'kotlinPackage',
            'serviceName',
            'appDescription',
            'appDisplayDescription',
        ], 'android', fail);
        kotlinPackage =
            requireString(android.kotlinPackage, 'android.kotlinPackage', fail) ?? '';
        if (kotlinPackage &&
            (!PACKAGE.test(kotlinPackage) ||
                kotlinPackage.split('.').some((s) => KOTLIN_HARD_KEYWORDS.has(s)))) {
            fail('android.kotlinPackage', `"${kotlinPackage}" is not a valid Kotlin package (lowercase segments separated by dots, no keywords)`);
        }
        serviceName =
            requireString(android.serviceName, 'android.serviceName', fail) ?? '';
        if (serviceName && !UPPER_CAMEL.test(serviceName)) {
            fail('android.serviceName', `"${serviceName}" must be an UpperCamelCase class name`);
        }
        appDescription = optionalText(android.appDescription, 'android.appDescription', fail);
        appDisplayDescription = optionalText(android.appDisplayDescription, 'android.appDisplayDescription', fail);
    }
    const baseClassName = `Base${serviceName}`;
    // types (names first, so values can reference any declared type)
    const typesObj = root.types === undefined ? {} : asObject(root.types);
    if (!typesObj)
        fail('types', 'must be an object');
    const typeNames = new Set(Object.keys(typesObj ?? {}));
    const functionsObj = asObject(root.functions);
    const functionNames = Object.keys(functionsObj ?? {});
    const generatedNames = new Set([
        serviceName,
        baseClassName,
        'AppFunctionsHandlers',
        'AppFunctionsJson',
        ...functionNames.map(handlerInterfaceName),
    ]);
    const types = [];
    for (const [name, specRaw] of Object.entries(typesObj ?? {})) {
        const where = `type "${name}"`;
        if (!UPPER_CAMEL.test(name))
            fail(where, 'type names must be UpperCamelCase');
        else if (RESERVED_TYPE_NAMES.has(name) || generatedNames.has(name)) {
            fail(where, 'this name is reserved (Kotlin built-in or a generated class); pick another');
        }
        const spec = asObject(specRaw);
        if (!spec) {
            fail(where, 'must be an object with `fields`');
            continue;
        }
        checkKeys(spec, ['description', 'fields'], where, fail);
        const description = optionalText(spec.description, `${where}, description`, fail);
        const fieldsObj = asObject(spec.fields);
        if (!fieldsObj || Object.keys(fieldsObj).length === 0) {
            fail(where, '`fields` must be an object with at least one field');
            continue;
        }
        const fields = Object.entries(fieldsObj).map(([fieldName, v]) => field(fieldName, v, `${where}, field "${fieldName}"`, typeNames, fail));
        types.push({
            name,
            ...(description !== undefined && { description }),
            fields,
        });
    }
    // functions
    const functions = [];
    if (!functionsObj) {
        fail('functions', 'required object is missing');
    }
    else if (functionNames.length === 0) {
        fail('functions', 'declare at least one function');
    }
    for (const [name, specRaw] of Object.entries(functionsObj ?? {})) {
        const where = `function "${name}"`;
        if (!LOWER_CAMEL.test(name) || KOTLIN_HARD_KEYWORDS.has(name)) {
            fail(where, 'function names must be lowerCamelCase and not a Kotlin keyword');
        }
        const spec = asObject(specRaw);
        if (!spec) {
            fail(where, 'must be an object');
            continue;
        }
        checkKeys(spec, ['description', 'title', 'handler', 'timeoutMs', 'accessLevel', 'params', 'returns'], where, fail);
        const description = optionalText(spec.description, `${where}, field "description"`, fail);
        if (description === undefined && spec.description === undefined) {
            fail(`${where}, field "description"`, 'required: agents choose functions by their description');
        }
        let title = titleCase(name);
        if (spec.title !== undefined) {
            if (typeof spec.title !== 'string' ||
                spec.title.trim() === '' ||
                spec.title.includes('\n')) {
                fail(`${where}, field "title"`, 'must be a non-empty single line');
            }
            else {
                title = spec.title;
            }
        }
        let accessLevel = 'trusted';
        if (spec.accessLevel !== undefined) {
            if (spec.accessLevel !== 'self' && spec.accessLevel !== 'trusted') {
                fail(`${where}, field "accessLevel"`, 'must be "self" or "trusted"');
            }
            else {
                accessLevel = spec.accessLevel;
            }
        }
        const handler = spec.handler === 'js' ? 'js' : 'native';
        if (spec.handler !== 'native' && spec.handler !== 'js') {
            fail(`${where}, field "handler"`, 'must be "native" or "js"');
        }
        let timeoutMs = exports.DEFAULT_JS_TIMEOUT_MS;
        if (spec.timeoutMs !== undefined) {
            if (handler !== 'js') {
                fail(`${where}, field "timeoutMs"`, 'only applies to "js" handlers');
            }
            else if (typeof spec.timeoutMs !== 'number' ||
                !Number.isInteger(spec.timeoutMs) ||
                spec.timeoutMs < MIN_JS_TIMEOUT_MS ||
                spec.timeoutMs > MAX_JS_TIMEOUT_MS) {
                fail(`${where}, field "timeoutMs"`, `must be a whole number of milliseconds between ${MIN_JS_TIMEOUT_MS} and ${MAX_JS_TIMEOUT_MS}`);
            }
            else {
                timeoutMs = spec.timeoutMs;
            }
        }
        const paramsObj = spec.params === undefined ? {} : asObject(spec.params);
        if (!paramsObj)
            fail(`${where}, field "params"`, 'must be an object');
        const params = Object.entries(paramsObj ?? {}).map(([p, v]) => field(p, v, `${where}, param "${p}"`, typeNames, fail));
        if (spec.returns === undefined) {
            fail(`${where}, field "returns"`, 'required');
            continue;
        }
        const returns = value(spec.returns, `${where}, field "returns"`, typeNames, fail);
        functions.push({
            name,
            description: description ?? '',
            title,
            accessLevel,
            ...(handler === 'js'
                ? { handler: 'js', timeoutMs }
                : { handler: 'native' }),
            params,
            returns,
        });
    }
    if (problems.length > 0)
        throw new errors_1.ConfigError(problems);
    return {
        kotlinPackage,
        serviceName,
        baseClassName,
        xmlFileName: snakeCase(serviceName),
        ...(appDescription !== undefined && { appDescription }),
        ...(appDisplayDescription !== undefined && { appDisplayDescription }),
        types,
        functions,
    };
}
function handlerInterfaceName(functionName) {
    return (functionName.charAt(0).toUpperCase() + functionName.slice(1) + 'Handler');
}
/** `listTodaysRecords` → `List Todays Records`, `scheduledAt` → `Scheduled At`. */
function titleCase(name) {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .replace(/^./, (c) => c.toUpperCase());
}
/** `FieldAppFunctionService` → `field_app_function_service` (Google sample convention). */
function snakeCase(name) {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
        .toLowerCase();
}
function field(name, raw, where, typeNames, fail) {
    if (!LOWER_CAMEL.test(name) || KOTLIN_HARD_KEYWORDS.has(name)) {
        fail(where, 'names must be lowerCamelCase and not a Kotlin keyword');
    }
    return { name, value: value(raw, where, typeNames, fail) };
}
function value(raw, where, typeNames, fail) {
    const fallback = {
        item: { kind: 'scalar', scalar: 'string' },
        list: false,
        nullable: false,
    };
    const spec = asObject(raw);
    if (!spec) {
        fail(where, 'must be an object like `{ type: "string" }`');
        return fallback;
    }
    checkKeys(spec, ['type', 'of', 'nullable', 'description'], where, fail);
    const description = optionalText(spec.description, `${where}, description`, fail);
    if (spec.nullable !== undefined && typeof spec.nullable !== 'boolean') {
        fail(where, '`nullable` must be true or false');
    }
    const nullable = spec.nullable === true;
    const base = { nullable, ...(description !== undefined && { description }) };
    if (typeof spec.type !== 'string') {
        fail(where, '`type` is required');
        return fallback;
    }
    if (spec.type === 'list') {
        if (typeof spec.of !== 'string') {
            fail(where, 'lists need `of`, the item type');
            return fallback;
        }
        const item = typeRef(spec.of, where, typeNames, fail);
        if (spec.of === 'list') {
            fail(where, 'nested lists are not supported by AppFunctions; wrap the inner list in a declared type');
        }
        else if (item?.kind === 'scalar' &&
            !model_1.LIST_ITEM_SCALARS.includes(item.scalar)) {
            fail(where, `lists of "${item.scalar}" are not supported by AppFunctions (supported: ${model_1.LIST_ITEM_SCALARS.join(', ')} and declared types); wrap the value in a declared type`);
        }
        return { ...base, item: item ?? fallback.item, list: true };
    }
    if (spec.of !== undefined)
        fail(where, '`of` is only valid with `type: "list"`');
    const item = typeRef(spec.type, where, typeNames, fail);
    return { ...base, item: item ?? fallback.item, list: false };
}
function typeRef(name, where, typeNames, fail) {
    if (model_1.SCALARS.includes(name))
        return { kind: 'scalar', scalar: name };
    if (typeNames.has(name))
        return { kind: 'named', name };
    if (name === 'list')
        return undefined;
    const declared = [...typeNames];
    fail(where, `unknown type "${name}" (built-in: ${model_1.SCALARS.join(', ')}, list${declared.length ? `; declared: ${declared.join(', ')}` : ''})`);
    return undefined;
}
function asObject(v) {
    return v !== undefined && typeof v === 'object' && !Array.isArray(v)
        ? v
        : undefined;
}
function checkKeys(obj, allowed, where, fail) {
    for (const key of Object.keys(obj)) {
        if (!allowed.includes(key))
            fail(where, `unknown key "${key}" (allowed: ${allowed.join(', ')})`);
    }
}
function requireString(v, where, fail) {
    if (typeof v !== 'string' || v.trim() === '') {
        fail(where, 'required non-empty string');
        return undefined;
    }
    return v;
}
/** Optional description-like text. Comment delimiters would break the generated KDoc. */
function optionalText(v, where, fail) {
    if (v === undefined)
        return undefined;
    if (typeof v !== 'string' || v.trim() === '') {
        fail(where, 'must be a non-empty string');
        return undefined;
    }
    if (v.includes('*/') || v.includes('/*')) {
        fail(where, 'must not contain "/*" or "*/"');
        return undefined;
    }
    return v;
}
