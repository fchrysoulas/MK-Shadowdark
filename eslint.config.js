export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**"
    ]
  },
  {
    files: [
      "scripts/**/*.js",
      "tests/**/*.mjs",
      "tools/**/*.mjs"
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module"
    },
    rules: {
      "no-debugger": "error",
      "no-dupe-keys": "error",
      "no-unreachable": "error",
      "no-constant-condition": ["error", { "checkLoops": false }],
      "no-self-assign": "error",
      "no-sparse-arrays": "error",
      "no-unexpected-multiline": "error",
      "no-unsafe-finally": "error",
      "valid-typeof": "error"
    }
  }
];
