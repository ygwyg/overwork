import * as esbuild from "esbuild";
import path from "path";
import { createRequire } from "module";
import { DependencyInfo } from "../types.js";

function nodeResolvePlugin(): esbuild.Plugin {
  const require = createRequire(path.resolve("package.json"));
  return {
    name: "node-resolve-fallback",
    setup(build) {
      build.onResolve({ filter: /^[^./]/ }, (args) => {
        try {
          const resolved = require.resolve(args.path);
          return { path: resolved };
        } catch {
          return undefined;
        }
      });
    },
  };
}

export async function analyzeBundle(
  entryPoint: string,
): Promise<{ deps: DependencyInfo[]; totalBytes: number }> {
  const result = await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    metafile: true,
    platform: "neutral",
    format: "esm",
    target: "es2022",
    logLevel: "silent",
    mainFields: ["module", "main"],
    plugins: [nodeResolvePlugin()],
    external: ["cloudflare:workers", "cloudflare:*"],
  });

  const metafile = result.metafile!;
  const outputKey = Object.keys(metafile.outputs)[0];
  const output = metafile.outputs[outputKey];
  const totalBytes = output.bytes;

  const packageSizes = new Map<
    string,
    { bytes: number; files: Array<{ path: string; bytes: number }> }
  >();

  for (const [inputPath, info] of Object.entries(output.inputs)) {
    const pkgName = extractPackageName(inputPath);
    if (!pkgName) continue;

    const existing = packageSizes.get(pkgName) ?? { bytes: 0, files: [] };
    existing.bytes += info.bytesInOutput;
    existing.files.push({ path: inputPath, bytes: info.bytesInOutput });
    packageSizes.set(pkgName, existing);
  }

  const deps: DependencyInfo[] = Array.from(packageSizes.entries())
    .map(([name, { bytes, files }]) => ({
      name,
      bytes,
      percentage: Math.round((bytes / totalBytes) * 100),
      files,
    }))
    .sort((a, b) => b.bytes - a.bytes);

  return { deps, totalBytes };
}

function extractPackageName(inputPath: string): string | null {
  const nmIndex = inputPath.indexOf("node_modules/");
  if (nmIndex === -1) return null;

  const afterNm = inputPath.slice(nmIndex + "node_modules/".length);

  if (afterNm.startsWith("@")) {
    const parts = afterNm.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  }

  return afterNm.split("/")[0];
}

export function formatReport(
  deps: DependencyInfo[],
  totalBytes: number,
): string {
  const lines = [
    `Bundle size: ${formatBytes(totalBytes)}`,
    "",
    "Dependencies by size:",
    "─".repeat(60),
  ];

  for (const dep of deps.slice(0, 15)) {
    const bar = "█".repeat(Math.max(1, Math.round(dep.percentage / 2)));
    lines.push(
      `  ${dep.name.padEnd(30)} ${formatBytes(dep.bytes).padStart(10)} ${String(dep.percentage).padStart(3)}% ${bar}`,
    );
  }

  return lines.join("\n");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
