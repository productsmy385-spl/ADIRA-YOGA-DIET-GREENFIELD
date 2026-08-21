import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
  ]),

  {
    name: "adira/design-tokens",
    files: ["src/**/*.{ts,tsx}"],
    // Colour is defined once, in src/app/globals.css, and reached through semantic
    // token names. A raw hex in a component — whether as a style value or as a Tailwind
    // arbitrary value like `bg-[#2f5d43]` — is how a design system quietly stops being
    // one: the token file says the brand green changed, and three components disagree.
    ignores: ["src/lib/branding.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?\\b/]",
          message:
            "Hardcoded colour. Use a design token from src/app/globals.css " +
            "(e.g. bg-primary, text-muted-foreground) instead of a hex value.",
        },
        {
          selector: "TemplateElement[value.raw=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?\\b/]",
          message:
            "Hardcoded colour in a template literal. Use a design token from " +
            "src/app/globals.css instead.",
        },
      ],
    },
  },

  {
    name: "adira/server-boundary",
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // Repositories are the only place SQL lives (ADR-005). A service or a
              // route reaching for the pool directly is how parameterised SQL leaks
              // upward and how an organization_id scope gets skipped.
              group: ["**/server/db/pool"],
              importNames: ["pool"],
              message:
                "Import query/queryOne/transaction rather than the raw pool, and only " +
                "from within src/server/repositories or src/server/db.",
            },
          ],
        },
      ],
    },
  },

  {
    // The repository layer and the health probe legitimately hold the pool.
    name: "adira/server-boundary-exemptions",
    files: [
      "src/server/db/**/*.ts",
      "src/server/repositories/**/*.ts",
      "src/app/api/health/route.ts",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]);

export default eslintConfig;
