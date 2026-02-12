import { SplitPlan, SplitConfig } from "../types.js";

export function generateMainWranglerJsonc(
  config: SplitConfig,
  plans: SplitPlan[],
): string {
  const obj: Record<string, unknown> = {
    $schema: "./node_modules/wrangler/config-schema.json",
    name: config.workerName,
    main: "./dist/index.js",
    compatibility_date: config.compatibilityDate,
    compatibility_flags: ["nodejs_compat"],
    services: plans.map((plan) => ({
      binding: plan.bindingName,
      service: plan.serviceName,
      entrypoint: plan.entrypointClass,
    })),
  };
  return JSON.stringify(obj, null, 2) + "\n";
}

export function generateServiceWranglerJsonc(
  config: SplitConfig,
  plan: SplitPlan,
): string {
  const obj: Record<string, unknown> = {
    $schema: "./node_modules/wrangler/config-schema.json",
    name: plan.serviceName,
    main: "./dist/index.js",
    compatibility_date: config.compatibilityDate,
    compatibility_flags: ["nodejs_compat"],
  };
  return JSON.stringify(obj, null, 2) + "\n";
}
