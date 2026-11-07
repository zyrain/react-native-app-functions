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
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseArgs = parseArgs;
exports.loadModel = loadModel;
exports.generate = generate;
exports.writeFileIfChanged = writeFileIfChanged;
exports.writeOutputs = writeOutputs;
exports.main = main;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const errors_1 = require("./errors");
const parse_1 = require("./parse");
const render_1 = require("./render");
const validate_1 = require("./validate");
const USAGE = 'usage: react-native-app-functions-codegen --config <appfunctions.config.ts> ' +
    '[--kotlin-out <dir> --res-out <dir> --manifest-out <dir>] [--swift-out <file.swift>]';
function parseArgs(argv) {
    const flags = {};
    for (let i = 0; i < argv.length; i += 2) {
        const flag = argv[i];
        const val = argv[i + 1];
        if (!flag?.startsWith('--') || val === undefined)
            throw new Error(USAGE);
        flags[flag.slice(2)] = val;
    }
    const { config, 'kotlin-out': kotlin, 'res-out': res, 'manifest-out': manifest, 'swift-out': swift, ...unknown } = flags;
    const androidFlags = [kotlin, res, manifest].filter((v) => v !== undefined);
    if (!config ||
        Object.keys(unknown).length > 0 ||
        (androidFlags.length !== 0 && androidFlags.length !== 3) ||
        (androidFlags.length === 0 && !swift)) {
        throw new Error(USAGE);
    }
    return {
        config,
        ...(kotlin && res && manifest && { android: { kotlin, res, manifest } }),
        ...(swift && { swift }),
    };
}
/** Parses and validates the config file. Throws `ConfigError` on invalid config. */
function loadModel(configPath) {
    if (!fs.existsSync(configPath)) {
        throw new errors_1.ConfigError([`config file not found: ${configPath}`]);
    }
    const source = fs.readFileSync(configPath, 'utf8');
    return (0, validate_1.validateConfig)((0, parse_1.parseConfigSource)(source, configPath));
}
/** Android files for the config file. Throws `ConfigError` on invalid config. */
function generate(configPath) {
    return (0, render_1.render)(loadModel(configPath));
}
/** Writes `contents` to `file` only when it changed (keeps Xcode from recompiling). */
function writeFileIfChanged(file, contents) {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === contents)
        return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
}
/**
 * Makes each output dir contain exactly the generated files: writes changed files only (keeps
 * timestamps stable for Gradle/KSP) and deletes stale ones. The dirs are owned by the codegen.
 */
function writeOutputs(files, outDirs) {
    for (const root of Object.keys(outDirs)) {
        const dir = outDirs[root];
        const wanted = new Map(files
            .filter((f) => f.root === root)
            .map((f) => [path.join(dir, f.path), f.contents]));
        for (const existing of listFiles(dir)) {
            if (!wanted.has(existing))
                fs.rmSync(existing);
        }
        for (const [file, contents] of wanted) {
            if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === contents)
                continue;
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, contents);
        }
        removeEmptyDirs(dir);
    }
}
function listFiles(dir) {
    if (!fs.existsSync(dir))
        return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? listFiles(p) : [p];
    });
}
function removeEmptyDirs(dir) {
    if (!fs.existsSync(dir))
        return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!e.isDirectory())
            continue;
        const p = path.join(dir, e.name);
        removeEmptyDirs(p);
        if (fs.readdirSync(p).length === 0)
            fs.rmdirSync(p);
    }
}
function main(argv) {
    try {
        const args = parseArgs(argv);
        const model = loadModel(args.config);
        // Render everything before writing anything, so an invalid config leaves outputs untouched.
        const android = args.android ? (0, render_1.render)(model) : undefined;
        const swift = args.swift ? (0, render_1.renderSwift)(model) : undefined;
        if (args.android && android)
            writeOutputs(android, args.android);
        if (args.swift && swift !== undefined)
            writeFileIfChanged(args.swift, swift);
        return 0;
    }
    catch (e) {
        if (e instanceof errors_1.ConfigError) {
            process.stderr.write(`react-native-app-functions: invalid appfunctions.config.ts\n${e.problems
                .map((p) => `  - ${p}`)
                .join('\n')}\n`);
            return 1;
        }
        process.stderr.write(`react-native-app-functions: ${e.message}\n`);
        return 1;
    }
}
if (require.main === module) {
    process.exitCode = main(process.argv.slice(2));
}
