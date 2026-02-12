import { SplitPlan } from "../types.js";

export function generateClientStub(plan: SplitPlan): string {
  const namedExports = plan.exportNames
    .filter((n) => n !== "default")
    .map(
      (name) =>
        `export const ${name} = createProxy(getBinding, ["${name}"]);`,
    )
    .join("\n");

  return `import { __setEnv, getBinding as _getBinding, createProxy } from "./_env.js";
export { __setEnv };

function getBinding() {
  return _getBinding("${plan.bindingName}");
}

${namedExports}

const proxy = createProxy(getBinding, []);
export default proxy;
`;
}
