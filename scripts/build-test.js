import esbuild from "esbuild";

const modules = [
  { in: "src/plan.ts", out: "test/dist/plan.js" },
  { in: "src/generate/client-stub.ts", out: "test/dist/client-stub.js" },
  { in: "src/generate/env-module.ts", out: "test/dist/env-module.js" },
  { in: "src/generate/service-worker.ts", out: "test/dist/service-worker.js" },
  { in: "src/generate/wrangler.ts", out: "test/dist/wrangler.js" },
  { in: "src/generate/types.ts", out: "test/dist/types.js" },
  { in: "src/transform/inject-env.ts", out: "test/dist/inject-env.js" },
  { in: "src/analyze/metafile.ts", out: "test/dist/metafile.js" },
];

for (const mod of modules) {
  await esbuild.build({
    entryPoints: [mod.in],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile: mod.out,
    external: ["esbuild"],
  });
}

console.log(`Built ${modules.length} test modules`);
