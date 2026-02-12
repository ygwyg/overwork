import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/cli.js",
  banner: { js: "#!/usr/bin/env node" },
  external: ["esbuild"],
  sourcemap: true,
});

console.log("Built dist/cli.js");
