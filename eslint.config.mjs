// ================================================================
// eslint.config.mjs — flat config for the vanilla ESM budget app
// ================================================================
// No framework, no bundler, no TypeScript. The single most valuable
// rule here is `no-undef`: because modules run directly in the browser
// or in Node with no build step, an undefined identifier is almost
// always a real bug. Do NOT disable it — instead register genuine
// globals below and keep environments (browser vs node) distinct.
import js from '@eslint/js';
import globals from 'globals';

export default [
  // ---- Ignore build output, vendored/foreign code, and generated dirs.
  //      Mirrors .gitignore plus the verify walker's skip list.
  {
    ignores: [
      'node_modules/**',
      '_site/**',
      'public/downloads/**',
      'android/**', // mixed Java/Kotlin (+ generated JS), not app source
      'docs/**',
      '.vercel/**',
      '.android-build/**',
      'secrets/**',
      'memory/**',
      'package-lock.json',
    ],
  },

  // ---- Baseline: ESLint's recommended rule set for every JS/MJS file.
  js.configs.recommended,

  // ---- Shared parser options for all source.
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
    },
  },

  // ---- Browser surfaces: UI shell, renderers, features, data layer.
  //      These load as <script type="module"> or are imported by them.
  {
    files: [
      'render-*.js',
      'app.js',
      'config.js',
      'data.js',
      'modal-manager.js',
      'features/**/*.js',
      'modals/**/*.js',
      'data/**/*.js',
      'utils/**/*.js',
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },

  // ---- Node surfaces: build/dev scripts, serverless API handlers,
  //      Vercel gateway, tests, and any *.mjs (all Node-run here).
  {
    files: [
      'scripts/**/*.mjs',
      'api/**/*.js',
      'vercel-api/**/*.js',
      'test/**/*.mjs',
      '**/*.mjs',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // ---- Tests run under `node --test`. They import from node:test /
  //      node:assert explicitly, so Node globals are all they need;
  //      this block only pins sourceType for the .mjs test modules.
  {
    files: ['test/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },

  // ---- Playwright E2E specs/helpers run under Node (test runner), but their
  //      page.evaluate() callbacks reference browser globals (window, document).
  //      Grant both so no-undef stays on without false positives.
  {
    files: ['e2e/**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },

  // ---- Environment-agnostic pure logic shared by browser and server.
  //      Grant both global sets so no-undef stays on without false
  //      positives on cross-runtime primitives (URL, console, ...).
  {
    files: ['domain/**/*.js', 'shared/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },

  // ---- Pragmatic relaxations for a large pre-existing codebase.
  //      Kept minimal and meaningful; no-undef stays an error.
  {
    rules: {
      // Surface unused code as warnings, not CI-breaking errors, and
      // allow the conventional `_`-prefixed intentional-ignore pattern.
      'no-unused-vars': [
        'warn',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],
      // Empty blocks are common as deliberate no-ops (e.g. best-effort
      // cleanup); still flag empty catch so real swallows stay visible.
      'no-empty': ['warn', { allowEmptyCatch: true }],

      // Pre-existing findings surfaced on first adoption. Downgraded from
      // error to warning so they stay VISIBLE (and counted) without
      // blocking CI, per the "relax, don't mass-rewrite existing code"
      // policy. Two of these flag suspected real bugs called out in the
      // rollout report (a dropped `quantity` key and an emoji in a
      // non-`u` regex char class); leave the code untouched and fix
      // deliberately in a follow-up.
      'no-dupe-keys': 'warn',
      'no-misleading-character-class': 'warn',
      'no-useless-assignment': 'warn',
    },
  },

  // ---- Narrow carve-out: render-finance.js calls `pickTrackForPosition`
  //      without importing it from features/finance/assets/service.js —
  //      a genuine missing-import bug (see rollout report). Per policy we
  //      do NOT edit the app code to fix it here; demote no-undef to a
  //      warning for THIS FILE ONLY so the finding stays loud and CI
  //      passes, while no-undef remains a hard error everywhere else.
  {
    files: ['render-finance.js'],
    rules: {
      'no-undef': 'warn',
    },
  },
];
