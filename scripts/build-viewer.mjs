import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: ["viewer/client.cjs"],
  outfile: ".runtime/viewer/pilly-viewer.js",
  bundle: true,
  minify: true,
  platform: "browser",
  target: ["es2022"],
  define: { "globalThis.isElectron": "false", __dirname: '""' },
  plugins: [
    {
      name: "viewer-browser-adapters",
      setup(build) {
        build.onResolve({ filter: /\/utils(?:\.electron\.js)?$/ }, (args) => {
          if (args.importer.includes("prismarine-viewer"))
            return {
              path: require.resolve("prismarine-viewer/viewer/lib/utils.web.js"),
            };
        });
        build.onResolve({ filter: /^canvas$/ }, () => ({
          path: "canvas",
          namespace: "browser-canvas",
        }));
        build.onLoad({ filter: /.*/, namespace: "browser-canvas" }, () => ({
          contents:
            "exports.createCanvas = (width, height) => Object.assign(document.createElement('canvas'), {width, height});",
        }));
      },
    },
  ],
});
console.log("Pilly viewer built.");
