import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { SplitPlan } from "./types.js";

export function deploySplitWorkers(
  outputDir: string,
  plans: SplitPlan[],
): void {
  const resolved = path.resolve(outputDir);

  try {
    execSync("npx wrangler --version", { stdio: "ignore" });
  } catch {
    console.error(
      "  Error: wrangler not found. Install it with: npm install -D wrangler",
    );
    process.exit(1);
  }

  for (const plan of plans) {
    const serviceDir = path.join(resolved, plan.serviceName);
    if (!fs.existsSync(path.join(serviceDir, "wrangler.jsonc"))) {
      console.error(`  Error: ${serviceDir}/wrangler.jsonc not found. Run 'build' first.`);
      process.exit(1);
    }

    console.log(`  Deploying ${plan.serviceName}...`);
    try {
      execSync("npx wrangler deploy", {
        cwd: serviceDir,
        stdio: "inherit",
      });
      console.log(`  ${plan.serviceName} deployed.\n`);
    } catch {
      console.error(`  Failed to deploy ${plan.serviceName}. Fix the error above and retry.`);
      process.exit(1);
    }
  }

  const mainDir = path.join(resolved, "main");
  if (!fs.existsSync(path.join(mainDir, "wrangler.jsonc"))) {
    console.error(`  Error: ${mainDir}/wrangler.jsonc not found. Run 'build' first.`);
    process.exit(1);
  }

  console.log("  Deploying main worker...");
  try {
    execSync("npx wrangler deploy", {
      cwd: mainDir,
      stdio: "inherit",
    });
    console.log("  Main worker deployed.\n");
  } catch {
    console.error("  Failed to deploy main worker.");
    process.exit(1);
  }

  console.log("  All workers deployed successfully!");
}
