# overwork

Automatically split oversized Cloudflare Workers into multiple Workers connected via Service Bindings RPC.

## the problem

Cloudflare Workers have script size limits: 10MB on the free plan, 64MB on paid plans. Heavy npm packages like faker, pdf-lib, or sql-formatter can push you over. The usual advice is "make your bundle smaller," but sometimes the dependency is the size it is and you can't tree-shake it further.

## the solution

`overwork` analyzes your bundle, extracts heavy dependencies into separate service Workers, and connects them via Service Bindings RPC. Your code stays mostly the same — just add `await`.

Each Worker gets its own script size budget. Service Bindings between Workers on the same account run on the same machine, in the same thread, with sub-millisecond latency and zero additional cost.

```
One Worker (18MB) — over limit, can't deploy
              │
      overwork build
              │
  ┌───────────┼──────────────┐
  │ Main      │ SDK Service  │
  │ 16.8 KB   │ 4.3 MB       │
  │ (your     │ (heavy dep)  │
  │  code)    │              │
  └─────┬─────┴──────────────┘
        │  RPC calls via
        │  Service Bindings
        │  (same machine, <1ms)
```

## install

```bash
npm install -D overwork
```

## quick start

### 1. analyze your bundle

```bash
npx overwork analyze --entry src/index.ts
```

Output:

```
Bundle size: 1.08 MB

Dependencies by size:
────────────────────────────────────────────────────────────
  sql-formatter                    547.8 KB  50% █████████████████████████
  @faker-js/faker                  530.7 KB  48% ████████████████████████
  nearley                           15.4 KB   1% █
```

### 2. build split workers

```bash
npx overwork build --entry src/index.ts --split sql-formatter,@faker-js/faker
```

Output:

```
Original bundle:  1.08 MB
Main Worker:      16.8 KB     ← deploys as your worker
sql-formatter:    444 KB      ← separate worker, own budget
faker-js-faker:   4.3 MB      ← separate worker, own budget
Main reduction:   98%
```

### 3. deploy

```bash
npx overwork deploy --output .overwork
```

This deploys service Workers first (in dependency order), then the main Worker.

## cli reference

### `overwork analyze`

Show dependency size report without building.

```bash
overwork analyze --entry <file>
```

**Options:**
- `--entry <file>` — Main Worker entry point (required)

### `overwork build`

Analyze, split, and build Worker artifacts.

```bash
overwork build --entry <file> [options]
```

**Options:**
- `--entry <file>` — Main Worker entry point (required)
- `--split <pkg,pkg,...>` — Packages to extract, comma-separated (default: auto-detect)
- `--output <dir>` — Output directory (default: `.overwork`)
- `--threshold <bytes>` — Auto-detect threshold in bytes (default: `512000`)
- `--name <name>` — Main Worker name (default: `main-worker`)
- `--compat-date <date>` — Compatibility date (default: today's date)

### `overwork deploy`

Deploy all generated Workers via wrangler (services first, then main).

```bash
overwork deploy --output <dir>
```

**Options:**
- `--output <dir>` — Output directory (default: `.overwork`)

## how it works

### 1. analysis

`overwork` bundles your Worker entry point with esbuild and analyzes the metafile to attribute bytes to each `node_modules` package. Packages above the threshold (or explicitly named with `--split`) are marked for extraction.

### 2. export discovery

For each split package, the tool discovers exports by bundling it in isolation and parsing the ESM export declarations. For sql-formatter, this discovers all 25 exports automatically.

### 3. code generation

Three things are generated per split package:

**A service Worker** with a `WorkerEntrypoint` that uses `callChain` for deep property path dispatch:

```ts
import { WorkerEntrypoint, RpcTarget } from "cloudflare:workers";
import * as sdk from "sql-formatter";

class RemoteObject extends RpcTarget {
  #obj;
  constructor(obj) { super(); this.#obj = obj; }
  callChain(path, args) { /* walk path, call, wrap result */ }
}

export class SqlFormatterEntrypoint extends WorkerEntrypoint {
  callChain(path, args) {
    // sdk["format"] for path ["format"]
    // Returns plain values directly, wraps class instances in RemoteObject
  }
}
```

**A client stub** using a recursive Proxy that collects property access paths:

```ts
import { createProxy } from "./_env.js";

export const format = createProxy(getBinding, ["format"]);
export default createProxy(getBinding, []);
```

When you write `format(sql, opts)`, the Proxy sends `binding.callChain(["format"], [sql, opts])` to the service Worker.

**wrangler.jsonc files** for both Workers, with service binding configuration.

### 4. bundling

The main Worker is bundled with an esbuild plugin that intercepts imports of the split packages and redirects them to the generated stubs. The entry point is wrapped in a shim that injects `env` (where service bindings live) before your code runs.

## example

Original code:

```ts
import { format } from "sql-formatter";

export default {
  async fetch(request: Request): Promise<Response> {
    const sql = await request.text();
    const formatted = format(sql, { language: "postgresql" });
    return new Response(formatted);
  },
};
```

After `overwork build --split sql-formatter`:

```ts
import { format } from "sql-formatter"; // now points to RPC stub

export default {
  async fetch(request: Request): Promise<Response> {
    const sql = await request.text();
    const formatted = await format(sql, { language: "postgresql" }); // just add await
    return new Response(formatted);
  },
};
```

The import path stays the same. The only change is adding `await` to the function call.

## rpc compatibility tiers

npm packages fall into three tiers based on how well they work over RPC:

### tier 1: transparent

Packages with flat, function-based APIs. `overwork` handles these completely — you change nothing in your code (except adding `await`).

**Examples:** sql-formatter, lodash-es, date-fns, ramda, marked, cheerio, csv-parse, zod, joi, ajv

```ts
// Before
const formatted = format(sql, { language: "postgresql" });

// After (just add await)
const formatted = await format(sql, { language: "postgresql" });
```

### tier 2: deep proxy

Packages with nested namespaces or class-based APIs. The deep proxy handles property chains and method calls automatically. But when you need to pass one remote object as an argument to another remote object's method, those cross-references can't survive the RPC serialization boundary.

**Examples:** @faker-js/faker (fully automatic), pdf-lib (needs custom method)

```ts
// This works — each call is independent
const name = await faker.person.fullName();
const email = await faker.internet.email();

// This works — single RPC call resolves the full chain
const doc = await PDFDocument.create();
const page = await doc.addPage([600, 400]);

// This DOESN'T work transparently
const font = await doc.embedFont("Helvetica");
await page.drawText("Hello", { font }); // font is an RPC stub, drawText expects PDFFont
```

**Fix:** Expose a purpose-built method on the service Worker that keeps all the cross-references local. Instead of proxying every individual pdf-lib call, expose `generatePdf(title, body)` and let the service Worker handle the internal orchestration.

### tier 3: impossible

Packages that need to run in the same isolate as your code. No amount of proxying fixes this.

**Examples:** Sentry (wraps request handlers, monkey-patches `fetch`), Prisma (connection pooling, transaction state), auth middleware, OpenTelemetry (wraps execution context)

## output structure

After running `overwork build`, the output directory contains:

```
.overwork/
  main/
    wrangler.jsonc          # Main Worker config with service bindings
    dist/
      index.js              # Bundled main Worker
  sql-formatter-service/
    wrangler.jsonc          # Service Worker config
    dist/
      index.js              # Bundled service Worker
  faker-js-faker-service/
    wrangler.jsonc
    dist/
      index.js
  .plans.json               # Split plan metadata (used by deploy command)
```

Each Worker is independently deployable with `wrangler deploy` from its directory.

## limitations

**RPC stubs don't round-trip in plain objects.** If you return a `RemoteObject extends RpcTarget` from a method, the client gets a working stub. But if you pass that stub back as a property inside `{ font: stub }`, the service doesn't receive the original `RpcTarget` instance. This is why Tier 2 packages need custom methods for cross-referencing.

**Middleware patterns are impossible.** Packages that wrap your request handler or execution context (Sentry, OpenTelemetry) can't work across the RPC boundary.

**Latency overhead.** Each RPC call adds sub-millisecond overhead. For chatty APIs (many calls per request), consider batching or exposing purpose-built methods that reduce round-trips.

**Cold start overhead.** Service Workers have their own cold start time (~100-200ms). Warm RPC overhead is negligible.

## requirements

- Node.js >= 20
- Cloudflare Workers with Service Bindings support (compatibility date >= 2024-04-03)

## license

MIT
