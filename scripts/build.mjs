// Bundles the action into a single ESM file that the Actions runner executes with node24.
import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  minify: false,
  sourcemap: false,
  legalComments: "none",
  // Some transitive dependencies are CommonJS and call require(); give them one.
  banner: {
    js: "import { createRequire as __ctaCreateRequire } from 'node:module'; const require = __ctaCreateRequire(import.meta.url);",
  },
  logLevel: "info",
});
