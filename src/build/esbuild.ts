import * as esbuild from "esbuild";
import path from "path";
import fs from "fs/promises";
import { SplitPlan, SplitConfig } from "../types.js";
import { generateClientStub } from "../generate/client-stub.js";
import { generateEnvModule } from "../generate/env-module.js";
import { generateServiceWorker } from "../generate/service-worker.js";
import { generateStubTypes } from "../generate/types.js";
import { generateEntryShim } from "../transform/inject-env.js";
import {
  generateMainWranglerJsonc,
  generateServiceWranglerJsonc,
} from "../generate/wrangler.js";

export interface BuildResult {
  mainSize: number;
  services: Array<{ name: string; size: number }>;
}

export async function buildSplitWorkers(
  config: SplitConfig,
  plans: SplitPlan[],
): Promise<BuildResult> {
  const outputDir = path.resolve(config.output);
  const mainDir = path.join(outputDir, "main");
  const stubsDir = path.join(mainDir, "src", "__stubs");

  await fs.mkdir(stubsDir, { recursive: true });
  await fs.mkdir(path.join(mainDir, "dist"), { recursive: true });

  await fs.writeFile(path.join(stubsDir, "_env.js"), generateEnvModule());

  const stubPaths = new Map<string, string>();
  for (const plan of plans) {
    const stubFileName = `${plan.packageName.replace(/[@/]/g, "_")}.stub.js`;
    const stubPath = path.join(stubsDir, stubFileName);
    await fs.writeFile(stubPath, generateClientStub(plan));
    await fs.writeFile(
      stubPath.replace(/\.js$/, ".d.ts"),
      generateStubTypes(plan),
    );
    stubPaths.set(plan.packageName, stubPath);
  }

  const shimPath = path.join(mainDir, "src", "_entry.js");
  const relativeOriginal = path.relative(
    path.dirname(shimPath),
    path.resolve(config.entry),
  );
  await fs.writeFile(
    shimPath,
    generateEntryShim(
      relativeOriginal.startsWith(".")
        ? relativeOriginal
        : `./${relativeOriginal}`,
    ),
  );

  const stubPlugin: esbuild.Plugin = {
    name: "overwork-stub",
    setup(build) {
      for (const [pkgName, stubPath] of stubPaths) {
        const escaped = pkgName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const filter = new RegExp(`^${escaped}($|/)`);
        build.onResolve({ filter }, () => ({ path: stubPath }));
      }
    },
  };

  const sharedOptions: Partial<esbuild.BuildOptions> = {
    bundle: true,
    write: true,
    platform: "neutral",
    format: "esm" as const,
    target: "es2022",
    mainFields: ["module", "main"],
    nodePaths: [
      path.resolve(path.dirname(config.entry), "node_modules"),
      path.resolve("node_modules"),
    ],
    external: [
      "cloudflare:workers", "cloudflare:*", "node:*",
      "module", "url", "path", "fs", "fs/promises", "process",
      "assert", "util", "v8", "os", "crypto", "stream", "events",
    ],
    metafile: true,
  };

  const mainResult = await esbuild.build({
    ...sharedOptions,
    entryPoints: [shimPath],
    outfile: path.join(mainDir, "dist", "index.js"),
    plugins: [stubPlugin],
  });

  await fs.writeFile(
    path.join(mainDir, "wrangler.jsonc"),
    generateMainWranglerJsonc(config, plans),
  );

  const services: Array<{ name: string; size: number }> = [];

  for (const plan of plans) {
    const serviceDir = path.join(outputDir, plan.serviceName);
    await fs.mkdir(path.join(serviceDir, "dist"), { recursive: true });
    await fs.mkdir(path.join(serviceDir, "src"), { recursive: true });

    const serviceSource = generateServiceWorker(plan);
    const serviceSrcPath = path.join(serviceDir, "src", "index.js");
    await fs.writeFile(serviceSrcPath, serviceSource);

    await fs.writeFile(
      path.join(serviceDir, "wrangler.jsonc"),
      generateServiceWranglerJsonc(config, plan),
    );

    const serviceResult = await esbuild.build({
      ...sharedOptions,
      entryPoints: [serviceSrcPath],
      outfile: path.join(serviceDir, "dist", "index.js"),
    });

    const serviceOutput = Object.values(serviceResult.metafile!.outputs)[0];
    services.push({ name: plan.serviceName, size: serviceOutput.bytes });
  }

  const mainOutput = Object.values(mainResult.metafile!.outputs)[0];

  return { mainSize: mainOutput.bytes, services };
}
