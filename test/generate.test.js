import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateClientStub } from "./dist/client-stub.js";
import { generateEnvModule } from "./dist/env-module.js";
import { generateServiceWorker } from "./dist/service-worker.js";
import { generateMainWranglerJsonc, generateServiceWranglerJsonc } from "./dist/wrangler.js";
import { generateStubTypes } from "./dist/types.js";
import { generateEntryShim } from "./dist/inject-env.js";
import { formatBytes } from "./dist/metafile.js";

const testPlan = {
  packageName: "sql-formatter",
  serviceName: "sql-formatter-service",
  bindingName: "SQL_FORMATTER",
  entrypointClass: "SqlFormatterEntrypoint",
  exportNames: ["format", "formatDialect", "expandPhrases"],
};

const testConfig = {
  entry: "src/index.ts",
  split: ["sql-formatter"],
  output: ".overwork",
  threshold: 512_000,
  workerName: "my-worker",
  compatibilityDate: "2026-02-12",
};

describe("generateClientStub", () => {
  const stub = generateClientStub(testPlan);

  it("imports from _env.js", () => {
    assert.ok(stub.includes('from "./_env.js"'));
  });

  it("creates named export proxies for each export", () => {
    assert.ok(stub.includes('export const format = createProxy(getBinding, ["format"])'));
    assert.ok(stub.includes('export const formatDialect = createProxy(getBinding, ["formatDialect"])'));
    assert.ok(stub.includes('export const expandPhrases = createProxy(getBinding, ["expandPhrases"])'));
  });

  it("creates default proxy export", () => {
    assert.ok(stub.includes("export default proxy"));
    assert.ok(stub.includes("const proxy = createProxy(getBinding, [])"));
  });

  it("uses correct binding name", () => {
    assert.ok(stub.includes('"SQL_FORMATTER"'));
  });

  it("re-exports __setEnv", () => {
    assert.ok(stub.includes("export { __setEnv }"));
  });
});

describe("generateEnvModule", () => {
  const env = generateEnvModule();

  it("exports __setEnv function", () => {
    assert.ok(env.includes("export function __setEnv(env)"));
  });

  it("exports getBinding function", () => {
    assert.ok(env.includes("export function getBinding(name)"));
  });

  it("exports createProxy function", () => {
    assert.ok(env.includes("export function createProxy(getBindingFn, basePath)"));
  });

  it("includes proxyBrand WeakMap", () => {
    assert.ok(env.includes("const proxyBrand = new WeakMap()"));
  });

  it("includes prepareArg for recursive arg rewriting", () => {
    assert.ok(env.includes("function prepareArg(arg)"));
  });

  it("includes wrapRemoteResult for RPC stub wrapping", () => {
    assert.ok(env.includes("function wrapRemoteResult(stub)"));
  });

  it("handles __overworkRef in prepareArg", () => {
    assert.ok(env.includes("__overworkRef"));
  });

  it("returns undefined for 'then' property (thenable check)", () => {
    assert.ok(env.includes('if (prop === "then") return undefined'));
  });
});

describe("generateServiceWorker", () => {
  const sw = generateServiceWorker(testPlan);

  it("imports from cloudflare:workers", () => {
    assert.ok(sw.includes('import { WorkerEntrypoint, RpcTarget } from "cloudflare:workers"'));
  });

  it("imports the target package", () => {
    assert.ok(sw.includes('import * as sdk from "sql-formatter"'));
  });

  it("includes path validation with BLOCKED set", () => {
    assert.ok(sw.includes("const BLOCKED"));
    assert.ok(sw.includes("__proto__"));
    assert.ok(sw.includes("constructor"));
    assert.ok(sw.includes("prototype"));
  });

  it("includes RemoteObject extending RpcTarget", () => {
    assert.ok(sw.includes("class RemoteObject extends RpcTarget"));
  });

  it("includes callChain method on RemoteObject", () => {
    assert.ok(sw.includes("callChain(path, args)"));
  });

  it("exports entrypoint class with correct name", () => {
    assert.ok(sw.includes("export class SqlFormatterEntrypoint extends WorkerEntrypoint"));
  });

  it("includes wrapIfNeeded for result wrapping", () => {
    assert.ok(sw.includes("function wrapIfNeeded(value)"));
  });

  it("includes isPlainValue with prototype check", () => {
    assert.ok(sw.includes("proto === Object.prototype || proto === null"));
  });

  it("includes resolveArgs with __overworkRef", () => {
    assert.ok(sw.includes("function resolveArgs(args, moduleRoot)"));
    assert.ok(sw.includes("__overworkRef"));
  });

  it("includes default fetch handler with service name", () => {
    assert.ok(sw.includes("sql-formatter-service is running"));
  });
});

describe("generateMainWranglerJsonc", () => {
  const jsonc = generateMainWranglerJsonc(testConfig, [testPlan]);

  it("produces valid JSON", () => {
    assert.doesNotThrow(() => JSON.parse(jsonc));
  });

  it("includes worker name", () => {
    const obj = JSON.parse(jsonc);
    assert.equal(obj.name, "my-worker");
  });

  it("includes compatibility date", () => {
    const obj = JSON.parse(jsonc);
    assert.equal(obj.compatibility_date, "2026-02-12");
  });

  it("includes nodejs_compat flag", () => {
    const obj = JSON.parse(jsonc);
    assert.ok(obj.compatibility_flags.includes("nodejs_compat"));
  });

  it("includes service bindings", () => {
    const obj = JSON.parse(jsonc);
    assert.equal(obj.services.length, 1);
    assert.equal(obj.services[0].binding, "SQL_FORMATTER");
    assert.equal(obj.services[0].service, "sql-formatter-service");
    assert.equal(obj.services[0].entrypoint, "SqlFormatterEntrypoint");
  });

  it("sets main to ./dist/index.js", () => {
    const obj = JSON.parse(jsonc);
    assert.equal(obj.main, "./dist/index.js");
  });
});

describe("generateServiceWranglerJsonc", () => {
  const jsonc = generateServiceWranglerJsonc(testConfig, testPlan);

  it("produces valid JSON", () => {
    assert.doesNotThrow(() => JSON.parse(jsonc));
  });

  it("uses service name", () => {
    const obj = JSON.parse(jsonc);
    assert.equal(obj.name, "sql-formatter-service");
  });

  it("includes nodejs_compat flag", () => {
    const obj = JSON.parse(jsonc);
    assert.ok(obj.compatibility_flags.includes("nodejs_compat"));
  });

  it("does not include rpc flag", () => {
    const obj = JSON.parse(jsonc);
    assert.ok(!obj.compatibility_flags.includes("rpc"));
  });
});

describe("generateStubTypes", () => {
  const dts = generateStubTypes(testPlan);

  it("declares __setEnv", () => {
    assert.ok(dts.includes("export declare function __setEnv"));
  });

  it("declares named exports as any", () => {
    assert.ok(dts.includes("export declare const format: any"));
    assert.ok(dts.includes("export declare const formatDialect: any"));
  });

  it("declares default export", () => {
    assert.ok(dts.includes("export default _default"));
  });
});

describe("generateEntryShim", () => {
  const shim = generateEntryShim("../../src/index.ts");

  it("imports __setEnv from stubs", () => {
    assert.ok(shim.includes('import { __setEnv } from "./__stubs/_env.js"'));
  });

  it("imports original worker", () => {
    assert.ok(shim.includes('from "../../src/index.ts"'));
  });

  it("wraps fetch handler with __setEnv", () => {
    assert.ok(shim.includes("async fetch(request, env, ctx)"));
    assert.ok(shim.includes("__setEnv(env)"));
  });

  it("wraps scheduled handler", () => {
    assert.ok(shim.includes("async scheduled(event, env, ctx)"));
  });

  it("wraps queue handler", () => {
    assert.ok(shim.includes("async queue(batch, env, ctx)"));
  });
});

describe("formatBytes", () => {
  it("formats bytes", () => {
    assert.equal(formatBytes(500), "500 B");
  });

  it("formats kilobytes", () => {
    assert.equal(formatBytes(1024), "1.0 KB");
    assert.equal(formatBytes(1536), "1.5 KB");
  });

  it("formats megabytes", () => {
    assert.equal(formatBytes(1024 * 1024), "1.00 MB");
    assert.equal(formatBytes(4.5 * 1024 * 1024), "4.50 MB");
  });
});
