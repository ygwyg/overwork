import { execSync } from "child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit", cwd: process.cwd() });
const log = (msg = "") => console.log(msg);
const divider = () => log("─".repeat(64));

log();
log("  overwork demo");
log("  Splitting 4.5 MB of npm packages across Cloudflare Workers via RPC");
divider();

log();
log("  THE PROBLEM");
log("  Cloudflare Workers have a 10 MB script limit (free) / 64 MB (paid).");
log("  Heavy npm packages can blow that budget fast.");
log();
log("  This demo Worker uses 3 real packages:");
log("    @faker-js/faker    4.3 MB   (fake data generation)");
log("    pdf-lib             830 KB   (PDF creation)");
log("    sql-formatter       444 KB   (SQL pretty-printing)");
log();
log("  Combined: ~5.6 MB — over half the free-tier limit from deps alone.");
divider();

log();
log("  STEP 1: Analyze the bundle");
log();
run("node dist/cli.js analyze --entry real-demo/src/index.ts");

divider();
log();
log("  STEP 2: Split heavy packages into service Workers");
log();
run("node dist/cli.js build --entry real-demo/src/index.ts --split sql-formatter,@faker-js/faker --output real-demo/.overwork --name devtools-api");

divider();
log();
log("  WHAT HAPPENED");
log();
log("  Your code didn't change. overwork:");
log("    1. Replaced imports with RPC stubs (Proxy-based, supports nested APIs)");
log("    2. Generated service Workers that host each package");
log("    3. Connected them via Cloudflare Service Bindings (same machine, <1ms)");
log();
log("  The only code change needed: add 'await' to calls that cross the boundary.");
log();
log("    // before");
log('    const formatted = format(sql, { language: "postgresql" });');
log();
log("    // after (just add await)");
log('    const formatted = await format(sql, { language: "postgresql" });');
divider();
log();
log("  NEXT STEPS");
log();
log("  Deploy:  npm run demo:deploy");
log();
log("  Then test:");
log('    curl -X POST <url>/format-sql -d "select * from users where active=true"');
log("    curl <url>/mock-data?count=3");
log("    curl <url>/pdf -o demo.pdf && open demo.pdf");
log();
