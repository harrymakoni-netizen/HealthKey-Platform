import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Intentional effects hydrate and clear privacy-sensitive views after lifecycle events.
      "react-hooks/set-state-in-effect": "off",
      // Full navigations deliberately discard the previous React tree on shared devices.
      "@next/next/no-html-link-for-pages": "off",
      "@next/next/no-img-element": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "public/sw.js",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);
