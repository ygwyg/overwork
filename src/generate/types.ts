import { SplitPlan } from "../types.js";

export function generateStubTypes(plan: SplitPlan): string {
  const namedExports = plan.exportNames
    .filter((n) => n !== "default")
    .map((name) => `export declare const ${name}: any;`)
    .join("\n");

  return `export declare function __setEnv(env: Record<string, unknown>): void;

${namedExports}

declare const _default: any;
export default _default;
`;
}
