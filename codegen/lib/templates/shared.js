"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XML_HEADER = exports.KOTLIN_HEADER = exports.GENERATED_NOTE = void 0;
exports.kotlinType = kotlinType;
exports.kotlinImportsFor = kotlinImportsFor;
exports.importBlock = importBlock;
exports.kdoc = kdoc;
exports.kotlinPackagePath = kotlinPackagePath;
exports.escapeXmlAttr = escapeXmlAttr;
exports.escapeAndroidString = escapeAndroidString;
exports.GENERATED_NOTE = 'GENERATED — do not edit. Source: appfunctions.config.ts (react-native-app-functions).';
exports.KOTLIN_HEADER = `// ${exports.GENERATED_NOTE}`;
exports.XML_HEADER = `<!-- ${exports.GENERATED_NOTE} -->`;
const SCALAR_KOTLIN = {
    string: { type: 'String' },
    int: { type: 'Int' },
    long: { type: 'Long' },
    double: { type: 'Double' },
    boolean: { type: 'Boolean' },
    localDate: { type: 'LocalDate', import: 'java.time.LocalDate' },
    localDateTime: { type: 'LocalDateTime', import: 'java.time.LocalDateTime' },
    instant: { type: 'Instant', import: 'java.time.Instant' },
};
function kotlinType(v) {
    const item = typeRefKotlin(v.item);
    return (v.list ? `List<${item}>` : item) + (v.nullable ? '?' : '');
}
function typeRefKotlin(t) {
    return t.kind === 'named' ? t.name : SCALAR_KOTLIN[t.scalar].type;
}
/** `java.time` imports needed to reference these values. */
function kotlinImportsFor(values) {
    const imports = new Set();
    for (const v of values) {
        if (v.item.kind === 'scalar') {
            const imp = SCALAR_KOTLIN[v.item.scalar].import;
            if (imp)
                imports.add(imp);
        }
    }
    return [...imports];
}
function importBlock(imports) {
    const sorted = [...new Set(imports)].sort();
    return sorted.length
        ? sorted.map((i) => `import ${i}`).join('\n') + '\n\n'
        : '';
}
/** KDoc block. A single short line becomes `/** text *\/`. */
function kdoc(lines, indent) {
    const flat = lines.flatMap((l) => l.split('\n'));
    if (flat.length === 1)
        return `${indent}/** ${flat[0]} */\n`;
    const body = flat
        .map((l) => (l === '' ? `${indent} *` : `${indent} * ${l}`))
        .join('\n');
    return `${indent}/**\n${body}\n${indent} */\n`;
}
function kotlinPackagePath(model) {
    return model.kotlinPackage.split('.').join('/');
}
function escapeXmlAttr(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '&#10;');
}
/** Android string resource escaping (aapt2) on top of XML escaping. */
function escapeAndroidString(s) {
    const escaped = s
        .replace(/\\/g, '\\\\')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n');
    return /^[@?]/.test(escaped) ? `\\${escaped}` : escaped;
}
