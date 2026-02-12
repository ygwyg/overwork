export function generateEnvModule(): string {
  return `let _env = null;

export function __setEnv(env) {
  _env = env;
}

export function getBinding(name) {
  if (!_env) {
    throw new Error(
      "[overwork] env not initialized. Call __setEnv(env) at the top of your fetch handler."
    );
  }
  const binding = _env[name];
  if (!binding) {
    throw new Error(
      \`[overwork] Service binding "\${name}" not found in env. Check your wrangler.jsonc.\`
    );
  }
  return binding;
}

const proxyBrand = new WeakMap();

function prepareArg(arg) {
  if (arg === null || arg === undefined) return arg;
  const brand = proxyBrand.get(arg);
  if (brand) {
    if (brand.stub) return brand.stub;
    return { __overworkRef: brand.path };
  }
  if (Array.isArray(arg)) return arg.map(prepareArg);
  if (typeof arg === "object" && Object.getPrototypeOf(arg) === Object.prototype) {
    const out = {};
    for (const [k, v] of Object.entries(arg)) {
      out[k] = prepareArg(v);
    }
    return out;
  }
  return arg;
}

function prepareArgs(args) {
  return args.map(prepareArg);
}

function wrapRemoteResult(stub) {
  const callFn = (path, args) => stub.callChain(path, args);
  return makeProxy(callFn, [], stub);
}

function makeProxy(callFn, basePath, remoteStub) {
  const p = new Proxy(function() {}, {
    get(_, prop) {
      if (prop === "then") return undefined;
      if (prop === "__setEnv") return __setEnv;
      if (prop === "__esModule") return true;
      if (typeof prop === "symbol") return undefined;
      return makeProxy(callFn, [...basePath, String(prop)], remoteStub);
    },
    apply(_, thisArg, args) {
      if (basePath.length === 0) {
        throw new Error("[overwork] Cannot call module root as a function");
      }
      const prepared = prepareArgs(args);
      return callFn(basePath, prepared).then(function(result) {
        if (result != null && typeof result.callChain === "function") {
          return wrapRemoteResult(result);
        }
        return result;
      });
    }
  });
  proxyBrand.set(p, { path: basePath, stub: remoteStub || null });
  return p;
}

export function createProxy(getBindingFn, basePath) {
  function callFn(path, args) {
    const binding = getBindingFn();
    return binding.callChain(path, args);
  }
  return makeProxy(callFn, basePath || []);
}
`;
}
