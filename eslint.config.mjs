import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Icons are picked in one place: components import them by meaning from @/components/shared/icons.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/shared/icons/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "lucide-react",
              message: "Import icons by meaning from @/components/shared/icons (add new ones there).",
            },
          ],
        },
      ],
    },
  },
  // Must come after the Next configs: turns off the ESLint rules that conflict with Prettier.
  prettier,
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts", "src/lib/nms-core/**"]),
]);

export default eslintConfig;
