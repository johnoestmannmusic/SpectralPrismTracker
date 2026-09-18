// ESLint flat config for the Lantern terminal music player (TypeScript + Ink/React).
//
// TypeScript is pinned to v7 for the compiler, but typescript-eslint's parser
// hard-errors on TS >= 7 (typescript-eslint#10940). We therefore run the linter
// against a side-by-side TypeScript 6 API (`typescript6`, an npm alias) by
// redirecting `require("typescript")` for the lint process only. This keeps
// `tsc` on v7 while ESLint stays usable.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Module = require("node:module");
const ts6Path = require.resolve("typescript6");
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "typescript") {
    return originalLoad.call(this, ts6Path, parent, isMain);
  }
  return originalLoad.call(this, request, parent, isMain);
};

const js = (await import("@eslint/js")).default;
const tseslint = (await import("typescript-eslint")).default;
const reactHooks = (await import("eslint-plugin-react-hooks")).default;
const prettier = (await import("eslint-config-prettier")).default;
const globals = (await import("globals")).default;

const TS_FILES = ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"];
const JS_FILES = ["**/*.js", "**/*.mjs", "**/*.cjs"];

// `tseslint.configs.recommended` assumes it owns the parser for every file;
// re-scope it to TS files so `.mjs` scripts keep the default espree parser.
const tsRecommended = tseslint.configs.recommended.map((config) => ({
  ...config,
  files: TS_FILES,
}));

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "native/**",
      "assets/**",
      "test-results/**",
      "coverage/**",
      "src/wasm/vendor/**",
      ".pi/**",
    ],
  },
  js.configs.recommended,
  ...tsRecommended,
  {
    files: [...TS_FILES, ...JS_FILES],
    languageOptions: {
      globals: { ...globals.node },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      // React hooks correctness (the two long-standing rules; keep the noisy
      // React Compiler rules from the v7 preset out of the baseline).
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: TS_FILES,
    rules: {
      // Baseline-signal rules: keep them visible without blocking the build.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  // Keep formatting out of ESLint's hands; Prettier owns it.
  prettier,
);
