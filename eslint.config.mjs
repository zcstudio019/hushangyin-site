import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "tests/v1/*.cjs",
      "tests/v16/*.cjs",
      "tests/v101/*.cjs",
      "tests/v102/*.cjs",
      "tests/v103/*.cjs",
      "tests/v151/*.cjs",
      "tests/v152/*.cjs",
      "tests/v153/*.cjs",
      "tests/review-fix/*.cjs",
      "tests/review-permission/*.cjs",
      "tests/independent-reviewer/*.cjs",
      "tests/faq-approval/*.cjs",
      "tests/review-risk/*.cjs",
      "tests/ai-config/*.cjs",
      "tests/ai-entry/*.cjs",
      "tests/article-version/*.cjs",
      "tests/fact-check/*.cjs",
      "tests/analytics/*.cjs",
      "tests/analytics-acceptance/*.cjs",
    ],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  globalIgnores([".next/**", "node_modules/**", "backups/**", "public/**"]),
]);
