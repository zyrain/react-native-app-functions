"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.render = render;
exports.renderSwift = renderSwift;
const errors_1 = require("./errors");
const android_1 = require("./templates/android");
const json_1 = require("./templates/json");
const kotlin_1 = require("./templates/kotlin");
const shared_1 = require("./templates/shared");
const swift_1 = require("./templates/swift");
/** All generated files for a validated config. Pure: same model in, same files out. */
function render(m) {
    const pkg = (0, shared_1.kotlinPackagePath)(m);
    const files = [
        {
            root: 'kotlin',
            path: `${pkg}/${m.baseClassName}.kt`,
            contents: (0, kotlin_1.serviceFile)(m),
        },
        ...m.types.map((t) => ({
            root: 'kotlin',
            path: `${pkg}/${t.name}.kt`,
            contents: (0, kotlin_1.typeFile)(m, t),
        })),
        ...((0, kotlin_1.hasNative)(m)
            ? [
                {
                    root: 'kotlin',
                    path: `${pkg}/AppFunctionsHandlers.kt`,
                    contents: (0, kotlin_1.handlersFile)(m),
                },
            ]
            : []),
        ...((0, kotlin_1.hasJs)(m)
            ? [
                {
                    root: 'kotlin',
                    path: `${pkg}/AppFunctionsJson.kt`,
                    contents: (0, json_1.jsonFile)(m),
                },
            ]
            : []),
        {
            root: 'manifest',
            path: 'AndroidManifest.xml',
            contents: (0, android_1.manifestFile)(m),
        },
    ];
    if ((0, android_1.hasAppMetadata)(m)) {
        files.push({
            root: 'res',
            path: `xml/${android_1.APP_METADATA_RES}.xml`,
            contents: (0, android_1.appMetadataFile)(m),
        });
    }
    if (m.appDisplayDescription !== undefined) {
        files.push({
            root: 'res',
            path: 'values/appfunctions_strings.xml',
            contents: (0, android_1.stringsFile)(m),
        });
    }
    return files;
}
/** `AppFunctions.generated.swift` for the iOS app target. Throws `ConfigError` on iOS-only problems. */
function renderSwift(m) {
    const problems = (0, swift_1.iosProblems)(m);
    if (problems.length > 0)
        throw new errors_1.ConfigError(problems);
    return (0, swift_1.swiftFile)(m);
}
