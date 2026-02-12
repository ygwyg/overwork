import path from "path";
import { analyzeBundle, formatReport, formatBytes } from "./analyze/metafile.js";
import { discoverExports } from "./analyze/exports.js";
import { createSplitPlans } from "./plan.js";
import { buildSplitWorkers } from "./build/esbuild.js";
import { deploySplitWorkers } from "./deploy.js";
import { SplitConfig } from "./types.js";

const VERSION = "0.3.0";

const HELP = `
overwork v${VERSION} - Code-splitting for Cloudflare Workers

USAGE:
  overwork build   --entry <file> [options]
  overwork analyze --entry <file>
  overwork deploy  --output <dir>

COMMANDS:
  build     Analyze, split, and build Worker artifacts
  analyze   Show dependency size report without building
  deploy    Deploy all generated Workers via wrangler (services first, then main)

OPTIONS:
  --entry <file>         Main Worker entry point (required for build/analyze)
  --split <pkg,pkg,...>  Packages to extract, comma-separated (default: auto-detect)
  --output <dir>         Output directory (default: .overwork)
  --threshold <bytes>    Auto-detect threshold in bytes (default: 512000)
  --name <name>          Main Worker name (default: main-worker)
  --compat-date <date>   Compatibility date (default: today)
`;

function parseArgs(argv: string[]): {
  command: string;
  config: SplitConfig;
} {
  const args = argv.slice(2);
  const command = args[0] ?? "help";

  const config: SplitConfig = {
    entry: "",
    split: "auto",
    output: ".overwork",
    threshold: 512_000,
    workerName: "main-worker",
    compatibilityDate: new Date().toISOString().split("T")[0],
  };

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--entry":
        config.entry = args[++i];
        break;
      case "--split": {
        const val = args[++i];
        config.split = val.includes(",")
          ? val.split(",").map((s) => s.trim())
          : [val];
        break;
      }
      case "--output":
        config.output = args[++i];
        break;
      case "--threshold": {
        const val = parseInt(args[++i], 10);
        if (isNaN(val) || val <= 0) {
          console.error("Error: --threshold must be a positive number");
          process.exit(1);
        }
        config.threshold = val;
        break;
      }
      case "--name":
        config.workerName = args[++i];
        break;
      case "--compat-date":
        config.compatibilityDate = args[++i];
        break;
    }
  }

  return { command, config };
}

async function main() {
  const { command, config } = parseArgs(process.argv);

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    process.exit(0);
  }

  if (command === "deploy") {
    console.log(`\n  overwork v${VERSION}\n`);
    console.log("  Deploying from", config.output, "...\n");

    const plansPath = path.join(config.output, ".plans.json");
    let plans;
    try {
      const fs = await import("fs/promises");
      plans = JSON.parse(await fs.readFile(plansPath, "utf-8"));
    } catch {
      console.error(`  Error: ${plansPath} not found. Run 'build' first.`);
      process.exit(1);
    }

    deploySplitWorkers(config.output, plans);
    return;
  }

  if (!config.entry) {
    console.error("Error: --entry is required\n");
    console.log(HELP);
    process.exit(1);
  }

  console.log(`\n  overwork v${VERSION}\n`);
  console.log(`  Analyzing ${config.entry}...\n`);

  const { deps, totalBytes } = await analyzeBundle(config.entry);
  console.log(formatReport(deps, totalBytes));
  console.log();

  if (command === "analyze") {
    process.exit(0);
  }

  if (command !== "build") {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }

  const plans = createSplitPlans(config.split, deps, config.threshold);

  if (plans.length === 0) {
    console.log(
      `  No dependencies exceed the ${formatBytes(config.threshold)} threshold.`,
    );
    console.log("  Nothing to split. Your Worker is already lean!\n");
    process.exit(0);
  }

  const resolveDir = path.resolve(path.dirname(config.entry));
  for (const plan of plans) {
    console.log(`  Discovering exports for ${plan.packageName}...`);
    try {
      plan.exportNames = await discoverExports(plan.packageName, resolveDir);
      console.log(`    Found ${plan.exportNames.length} exports: ${plan.exportNames.slice(0, 8).join(", ")}${plan.exportNames.length > 8 ? "..." : ""}`);
    } catch {
      console.log(`    Could not discover exports (will use Proxy fallback)`);
      plan.exportNames = [];
    }
  }
  console.log();

  console.log(`  Splitting ${plans.length} package(s):\n`);
  for (const plan of plans) {
    console.log(`    ${plan.packageName}`);
    console.log(`      Service:  ${plan.serviceName}`);
    console.log(`      Binding:  env.${plan.bindingName}`);
    console.log(`      Exports:  ${plan.exportNames.length} named + default proxy`);
  }
  console.log();

  const result = await buildSplitWorkers(config, plans);

  const fsModule = await import("fs/promises");
  await fsModule.writeFile(
    path.join(config.output, ".plans.json"),
    JSON.stringify(plans, null, 2),
  );

  const totalServiceSize = result.services.reduce((sum, s) => sum + s.size, 0);

  console.log("  Build complete!\n");
  console.log("  Size comparison:");
  console.log(`    Original bundle:  ${formatBytes(totalBytes)}`);
  console.log(`    Main Worker:      ${formatBytes(result.mainSize)}`);
  for (const svc of result.services) {
    console.log(`    ${svc.name.padEnd(20)} ${formatBytes(svc.size)}`);
  }
  console.log(`    Combined:         ${formatBytes(result.mainSize + totalServiceSize)}`);
  console.log(`    Main reduction:   ${Math.round((1 - result.mainSize / totalBytes) * 100)}%\n`);

  console.log("  Output:");
  console.log(`    ${config.output}/main/wrangler.jsonc`);
  console.log(`    ${config.output}/main/dist/index.js`);
  for (const plan of plans) {
    console.log(`    ${config.output}/${plan.serviceName}/wrangler.jsonc`);
    console.log(`    ${config.output}/${plan.serviceName}/dist/index.js`);
  }
  console.log();

  console.log("  Deploy:");
  console.log(`    npx overwork deploy --output ${config.output}`);
  console.log();
  console.log("  Or manually (order matters):");
  for (let i = 0; i < plans.length; i++) {
    console.log(`    ${i + 1}. cd ${config.output}/${plans[i].serviceName} && npx wrangler deploy`);
  }
  console.log(`    ${plans.length + 1}. cd ${config.output}/main && npx wrangler deploy\n`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
