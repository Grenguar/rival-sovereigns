import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// docs/03-determinism.md §3 — these are implementation-defined in ECMAScript and
// differ between V8, SpiderMonkey and JavaScriptCore. One differing bit diverges
// the whole simulation.
const BANNED_MATH = [
  'random', 'pow', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'exp', 'log', 'log2', 'log10', 'hypot', 'cbrt', 'sinh', 'cosh', 'tanh',
].map((name) => ({
  object: 'Math',
  property: name,
  message: `Math.${name} is non-deterministic across engines. See docs/03-determinism.md`,
}));

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', '**/*.gen.ts'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,

  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // ---- The determinism gate. Never add an eslint-disable for anything below. ----
  // src/content is included deliberately: content is loaded straight into the
  // simulation, and docs/03-determinism.md §6 lists "a Math.random in a content
  // file" as one of the likeliest causes of a divergence.
  {
    files: ['src/core/**/*.ts', 'src/content/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...BANNED_MATH,
        { object: 'Date', property: 'now', message: 'Wall-clock time is banned in core. Use tick counts.' },
        { object: 'performance', property: 'now', message: 'Wall-clock time is banned in core. Use tick counts.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "BinaryExpression[operator='**']",
          message: 'The ** operator is non-deterministic. Use a curve LUT — docs/03-determinism.md',
        },
        {
          selector: "AssignmentExpression[operator='**=']",
          message: 'The **= operator is non-deterministic. Use a curve LUT.',
        },
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'Wall-clock time is banned in core. Use tick counts.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['pixi.js', 'pixi.js/*', 'react', 'react/*', 'react-dom', 'react-dom/*'],
              message: 'src/core must stay free of rendering dependencies.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'No DOM in core.' },
        { name: 'document', message: 'No DOM in core.' },
        { name: 'navigator', message: 'No DOM in core.' },
      ],
    },
  },

  // Tools and tests run in Node at build time — determinism does not apply there.
  {
    files: ['tools/**/*.ts', 'tests/**/*.ts', '*.config.ts', 'eslint.config.js'],
    rules: { 'no-console': 'off' },
  },
);
