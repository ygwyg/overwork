import { DependencyInfo, SplitPlan } from "./types.js";

export function createSplitPlans(
  target: string[] | "auto",
  deps: DependencyInfo[],
  threshold: number,
): SplitPlan[] {
  const packages: DependencyInfo[] = [];

  if (target === "auto") {
    packages.push(...deps.filter((d) => d.bytes >= threshold));
  } else {
    for (const name of target) {
      const pkg = deps.find((d) => d.name === name);
      if (!pkg) {
        throw new Error(
          `Package "${name}" not found in bundle. Available: ${deps.map((d) => d.name).join(", ")}`,
        );
      }
      packages.push(pkg);
    }
  }

  return packages.map((pkg) => {
    const safeName = pkg.name.replace(/[@/]/g, "-").replace(/^-/, "");
    return {
      packageName: pkg.name,
      serviceName: `${safeName}-service`,
      bindingName: safeBindingName(pkg.name),
      entrypointClass: `${toPascalCase(safeName)}Entrypoint`,
      exportNames: [],
    };
  });
}

function safeBindingName(pkgName: string): string {
  return pkgName
    .replace(/[@/.-]/g, "_")
    .replace(/^_/, "")
    .toUpperCase();
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join("");
}
