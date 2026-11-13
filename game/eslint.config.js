// Lint for the game client: npm run lint (from game/). CI runs it before the build.
// It replaces the 2017 tslint.json, and keeps the rules from it that still catch something:
// quotes, semicolons, unused code, == instead of ===, the app- selector prefix and the like.
// Rules whose job the TypeScript compiler or the Angular template compiler now does are left out.
// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const stylistic = require('@stylistic/eslint-plugin');

module.exports = tseslint.config(
    {
        ignores: [
            'dist/**',
            '.angular/**',
            'node_modules/**',
            // Copied in from the repo root by copy-shared.js before each build; not game code.
            'src/app/game-model.ts',
            'src/app/name-flag.ts',
            'src/app/name-lists.ts',
        ],
    },
    {
        files: ['src/**/*.ts'],
        extends: [
            eslint.configs.recommended,
            ...tseslint.configs.recommended,
        ],
        processor: angular.processInlineTemplates,
        plugins: {
            '@angular-eslint': angular.tsPlugin,
            '@stylistic': stylistic,
        },
        rules: {
            // tslint: quotemark single (it never checked backticks), semicolon always, eofline,
            // no-trailing-whitespace, max-line-length 140
            '@stylistic/quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: 'always' }],
            '@stylistic/semi': ['error', 'always'],
            '@stylistic/eol-last': 'error',
            '@stylistic/no-trailing-spaces': 'error',
            '@stylistic/max-len': ['error', { code: 140, ignoreUrls: true }],

            // tslint: curly, triple-equals allow-null-check, radix, no-var-keyword, prefer-const, forin
            curly: 'error',
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            radix: 'error',
            'no-var': 'error',
            'prefer-const': 'error',
            'guard-for-in': 'error',
            // tslint: no-arg, no-bitwise, no-construct, no-eval, no-debugger, no-string-throw
            'no-caller': 'error',
            'no-bitwise': 'error',
            'no-new-wrappers': 'error',
            'no-eval': 'error',
            'no-debugger': 'error',
            'no-throw-literal': 'error',
            // tslint: no-console for debug, info, time, timeEnd and trace (log, warn and error stay allowed)
            'no-restricted-properties': ['error',
                ...['debug', 'info', 'time', 'timeEnd', 'trace'].map((property) => ({ object: 'console', property })),
            ],
            // tslint: no-shadowed-variable, no-unused-expression, no-inferrable-types ignore-params,
            // interface-over-type-literal, callable-types, unified-signatures
            'no-shadow': 'off',
            '@typescript-eslint/no-shadow': 'error',
            '@typescript-eslint/no-inferrable-types': ['error', { ignoreParameters: true }],
            '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
            '@typescript-eslint/prefer-function-type': 'error',
            '@typescript-eslint/unified-signatures': 'error',
            '@typescript-eslint/no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],

            // tslint had no-empty off and no rule against `any`; the game uses both on purpose.
            'no-empty': 'off',
            '@typescript-eslint/no-empty-function': 'off',
            '@typescript-eslint/no-explicit-any': 'off',

            // codelyzer: selector prefixes, class suffixes, no input/output renames, lifecycle and pipe interfaces
            '@angular-eslint/component-selector': ['error', { type: 'element', prefix: 'app', style: 'kebab-case' }],
            '@angular-eslint/directive-selector': ['error', { type: 'attribute', prefix: 'app', style: 'camelCase' }],
            '@angular-eslint/component-class-suffix': 'error',
            '@angular-eslint/directive-class-suffix': 'error',
            '@angular-eslint/no-input-rename': 'error',
            '@angular-eslint/no-output-rename': 'error',
            '@angular-eslint/use-lifecycle-interface': 'error',
            '@angular-eslint/use-pipe-transform-interface': 'error',
            // Not wanted here: every class must stay `standalone: false` (see test/component-settings.test.js).
            '@angular-eslint/prefer-standalone': 'off',
        },
    },
    {
        files: ['src/**/*.html'],
        plugins: { '@angular-eslint/template': angular.templatePlugin },
        languageOptions: { parser: angular.templateParser },
        rules: {
            '@angular-eslint/template/banana-in-box': 'error',
            '@angular-eslint/template/no-negated-async': 'error',
        },
    },
);
