"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseConfigSource = parseConfigSource;
const path = __importStar(require("node:path"));
const typescript_1 = __importDefault(require("typescript"));
const errors_1 = require("./errors");
/**
 * Extracts the default export of `appfunctions.config.ts` as plain data, without executing it.
 *
 * Accepted: `export default defineAppFunctions({...})` or `export default {...}`, optionally with
 * `as const` / `satisfies`. Values may only be string and number literals, booleans, arrays and
 * object literals.
 */
function parseConfigSource(source, fileName) {
    const sf = typescript_1.default.createSourceFile(fileName, source, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    const problems = [];
    const where = (node) => {
        const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        return `${path.basename(fileName)}:${line + 1}:${character + 1}`;
    };
    const exportDefault = sf.statements.find(typescript_1.default.isExportAssignment);
    if (!exportDefault || exportDefault.isExportEquals) {
        throw new errors_1.ConfigError([
            `${path.basename(fileName)}: expected \`export default defineAppFunctions({...})\``,
        ]);
    }
    let root = unwrap(exportDefault.expression);
    if (typescript_1.default.isCallExpression(root)) {
        const callee = root.expression;
        const arg = root.arguments[0];
        if (!typescript_1.default.isIdentifier(callee) ||
            callee.text !== 'defineAppFunctions' ||
            root.arguments.length !== 1 ||
            arg === undefined) {
            throw new errors_1.ConfigError([
                `${where(root)}: expected \`defineAppFunctions({...})\` with a single object literal`,
            ]);
        }
        root = unwrap(arg);
    }
    const toLiteral = (node) => {
        node = unwrap(node);
        if (typescript_1.default.isStringLiteral(node) || typescript_1.default.isNoSubstitutionTemplateLiteral(node)) {
            return node.text;
        }
        if (typescript_1.default.isNumericLiteral(node))
            return Number(node.text);
        if (node.kind === typescript_1.default.SyntaxKind.TrueKeyword)
            return true;
        if (node.kind === typescript_1.default.SyntaxKind.FalseKeyword)
            return false;
        if (typescript_1.default.isArrayLiteralExpression(node)) {
            const items = [];
            for (const el of node.elements) {
                const v = toLiteral(el);
                if (v !== undefined)
                    items.push(v);
            }
            return items;
        }
        if (typescript_1.default.isObjectLiteralExpression(node)) {
            const obj = {};
            for (const prop of node.properties) {
                if (!typescript_1.default.isPropertyAssignment(prop)) {
                    problems.push(`${where(prop)}: only \`key: value\` properties are allowed (no shorthand, spreads or methods)`);
                    continue;
                }
                const key = typescript_1.default.isIdentifier(prop.name) || typescript_1.default.isStringLiteral(prop.name)
                    ? prop.name.text
                    : undefined;
                if (key === undefined) {
                    problems.push(`${where(prop.name)}: property names must be plain identifiers or strings`);
                    continue;
                }
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    problems.push(`${where(prop.name)}: duplicate key "${key}"`);
                    continue;
                }
                const v = toLiteral(prop.initializer);
                if (v !== undefined)
                    obj[key] = v;
            }
            return obj;
        }
        problems.push(`${where(node)}: only literal values are allowed (strings, numbers, booleans, objects, arrays); found ${describe(node)}. The config is read at build time and never executed.`);
        return undefined;
    };
    const result = toLiteral(root);
    if (problems.length > 0)
        throw new errors_1.ConfigError(problems);
    if (result === undefined ||
        typeof result !== 'object' ||
        Array.isArray(result)) {
        throw new errors_1.ConfigError([
            `${where(root)}: the default export must be an object literal`,
        ]);
    }
    return result;
}
function unwrap(node) {
    while (typescript_1.default.isParenthesizedExpression(node) ||
        typescript_1.default.isAsExpression(node) ||
        typescript_1.default.isSatisfiesExpression(node) ||
        typescript_1.default.isNonNullExpression(node) ||
        typescript_1.default.isTypeAssertionExpression(node)) {
        node = node.expression;
    }
    return node;
}
function describe(node) {
    if (typescript_1.default.isIdentifier(node))
        return `a variable (\`${node.text}\`)`;
    if (typescript_1.default.isNumericLiteral(node))
        return 'a number';
    if (typescript_1.default.isTemplateExpression(node))
        return 'a template string with ${...}';
    if (typescript_1.default.isCallExpression(node))
        return 'a function call';
    if (node.kind === typescript_1.default.SyntaxKind.NullKeyword)
        return 'null';
    return typescript_1.default.SyntaxKind[node.kind] ?? 'an expression';
}
