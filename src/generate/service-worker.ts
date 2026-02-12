import { SplitPlan } from "../types.js";

export function generateServiceWorker(plan: SplitPlan): string {
  return `import { WorkerEntrypoint, RpcTarget } from "cloudflare:workers";
import * as sdk from "${plan.packageName}";

const BLOCKED = new Set(["__proto__", "constructor", "prototype"]);

function validatePath(path) {
  for (const seg of path) {
    if (BLOCKED.has(seg)) {
      throw new Error(\`[overwork] Blocked path segment: "\${seg}"\`);
    }
  }
}

function isPlainValue(value) {
  if (value === null || value === undefined) return true;
  const t = typeof value;
  if (t !== "object" && t !== "function") return true;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true;
  if (value instanceof ReadableStream) return true;
  if (Array.isArray(value)) return true;
  if (value instanceof Date) return true;
  if (value instanceof RegExp) return true;
  if (value instanceof Map || value instanceof Set) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function wrapIfNeeded(value) {
  if (isPlainValue(value)) return value;
  return new RemoteObject(value, sdk);
}

function resolveRef(ref, moduleRoot) {
  let current = moduleRoot.default ?? moduleRoot;
  for (const key of ref) {
    if (BLOCKED.has(key)) throw new Error(\`[overwork] Blocked ref segment: "\${key}"\`);
    current = current[key];
    if (current === undefined || current === null) {
      current = moduleRoot[key];
      if (current === undefined || current === null) {
        throw new Error(\`[overwork] Cannot resolve ref at "\${key}"\`);
      }
    }
  }
  return current;
}

const remoteStore = new Map();
let remoteIdCounter = 0;

function tryUnwrap(value) {
  if (value instanceof RemoteObject) return value._getObj();
  if (value && typeof value === "object" && typeof value._wsGetId === "function") {
    try {
      const id = value._wsGetId();
      if (remoteStore.has(id)) return remoteStore.get(id);
    } catch {}
  }
  return value;
}

function resolveArgs(args, moduleRoot) {
  return args.map(a => {
    const unwrapped = tryUnwrap(a);
    if (unwrapped !== a) return unwrapped;
    if (a && typeof a === "object" && Array.isArray(a.__overworkRef)) {
      return resolveRef(a.__overworkRef, moduleRoot);
    }
    if (Array.isArray(a)) return resolveArgs(a, moduleRoot);
    if (a && typeof a === "object" && !Array.isArray(a)) {
      const resolved = {};
      for (const [k, v] of Object.entries(a)) {
        const uv = tryUnwrap(v);
        if (uv !== v) {
          resolved[k] = uv;
        } else if (v && typeof v === "object" && Array.isArray(v.__overworkRef)) {
          resolved[k] = resolveRef(v.__overworkRef, moduleRoot);
        } else {
          resolved[k] = v;
        }
      }
      return resolved;
    }
    return a;
  });
}

function walkAndCall(root, moduleRoot, path, args) {
  validatePath(path);
  let current = root;
  let parent = root;

  for (let i = 0; i < path.length; i++) {
    parent = current;
    const next = current[path[i]];
    if (next === undefined || next === null) {
      if (i === 0) {
        const fromModule = moduleRoot[path[i]];
        if (fromModule !== undefined && fromModule !== null) {
          parent = moduleRoot;
          current = fromModule;
          continue;
        }
      }
      throw new Error(\`[overwork] Cannot resolve "\${path.slice(0, i + 1).join(".")}"\`);
    }
    current = next;
  }

  if (typeof current === "function") {
    const resolvedArgs = resolveArgs(args, moduleRoot);
    const result = current.apply(parent, resolvedArgs);
    return Promise.resolve(result).then(wrapIfNeeded);
  }

  return wrapIfNeeded(current);
}

class RemoteObject extends RpcTarget {
  #obj;
  #moduleRoot;
  #id;
  constructor(obj, moduleRoot) {
    super();
    this.#obj = obj;
    this.#moduleRoot = moduleRoot || obj;
    this.#id = remoteIdCounter++;
    remoteStore.set(this.#id, obj);
  }

  _getObj() {
    return this.#obj;
  }

  _wsGetId() {
    return this.#id;
  }

  callChain(path, args) {
    return walkAndCall(this.#obj, this.#moduleRoot, path, args);
  }
}

export class ${plan.entrypointClass} extends WorkerEntrypoint {
  callChain(path, args) {
    const root = sdk["default"] ?? sdk;
    return walkAndCall(root, sdk, path, args);
  }
}

export default {
  async fetch() {
    return new Response("${plan.serviceName} is running. This Worker is called via Service Binding RPC, not HTTP.");
  },
};
`;
}
