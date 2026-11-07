"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigError = void 0;
/** One or more problems with the user's config. Every message is meant to be shown verbatim. */
class ConfigError extends Error {
    problems;
    constructor(problems) {
        super(problems.join('\n'));
        this.problems = problems;
        this.name = 'ConfigError';
    }
}
exports.ConfigError = ConfigError;
