import * as esbuild from "esbuild";
import path from "path";
import { createRequire } from "module";

function buildResolvers(fromDir: string) {
  const resolvers = [];
  let dir = path.resolve(fromDir);
  const root = path.parse(dir).root;
   while (dir !== root) {
     try {
       resolvers.push(createRequire(path.join(dir, "package.json")));
     } catch {
       // Directory doesn't have a package.json, skip
     }
     dir = path.dirname(dir);
   }
  return resolvers;
}

export async function discoverExports(
  packageName: string,
  resolveDir: string,
): Promise<string[]> {
  const resolvers = buildResolvers(resolveDir);

  const resolvePlugin: esbuild.Plugin = {
    name: "resolve-for-exports",
    setup(build) {
      build.onResolve({ filter: /^[^./]/ }, (args) => {
        for (const req of resolvers) {
          try {
            return { path: req.resolve(args.path) };
          } catch {
            continue;
          }
        }
        return undefined;
      });
    },
  };

  const result = await esbuild.build({
    stdin: {
      contents: `export * from "${packageName}";`,
      resolveDir: path.resolve(resolveDir),
      loader: "js",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    mainFields: ["module", "main"],
    logLevel: "silent",
    plugins: [resolvePlugin],
    external: ["cloudflare:workers", "cloudflare:*"],
  });

  const code = result.outputFiles?.[0]?.text ?? "";
  const exportNames = new Set<string>();

  const exportBlockRegex = /export\s*\{([^}]+)\}/gs;
  let match;
  while ((match = exportBlockRegex.exec(code)) !== null) {
    for (const part of match[1].split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const asMatch = trimmed.match(/\s+as\s+(\S+)$/);
      const name = asMatch ? asMatch[1] : trimmed;
      if (name && name !== "default" && /^\w+$/.test(name)) {
        exportNames.add(name);
      }
    }
  }

  for (const m of code.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
    if (m[1] !== "default") exportNames.add(m[1]);
  }

  for (const m of code.matchAll(/export\s+(?:var|let|const)\s+(\w+)/g)) {
    if (m[1] !== "default") exportNames.add(m[1]);
  }

  if (exportNames.size > 0) {
    return Array.from(exportNames).sort();
  }

  return discoverExportsViaRequire(packageName, resolveDir);
}

function discoverExportsViaRequire(
  packageName: string,
  resolveDir: string,
): string[] {
  const resolvers = buildResolvers(resolveDir);
  for (const req of resolvers) {
    try {
      const mod = req(packageName);
      const names = Object.keys(mod).filter(
        (k) => k !== "default" && k !== "__esModule",
      );
      if (names.length > 0) return names.sort();
    } catch {
      continue;
    }
  }
  return [];
}
