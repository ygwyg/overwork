export interface DependencyInfo {
  name: string;
  bytes: number;
  percentage: number;
  files: Array<{ path: string; bytes: number }>;
}

export interface SplitPlan {
  packageName: string;
  serviceName: string;
  bindingName: string;
  entrypointClass: string;
  exportNames: string[];
}

export interface SplitConfig {
  entry: string;
  split: string[] | "auto";
  output: string;
  threshold: number;
  workerName: string;
  compatibilityDate: string;
}
