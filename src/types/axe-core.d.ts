// src/types/axe-core.d.ts
declare module 'axe-core' {
  export interface NodeResult {
    html: string;
    target: string[];
    failureSummary?: string;
  }

  export interface Result {
    id: string;
    impact?: 'minor' | 'moderate' | 'serious' | 'critical' | null;
    tags: string[];
    description: string;
    help: string;
    helpUrl: string;
    nodes: NodeResult[];
  }

  export interface AxeResults {
    passes: Result[];
    violations: Result[];
    incomplete: Result[];
    inapplicable: Result[];
    timestamp: string;
    url: string;
  }

  export interface RunOptions {
    runOnly?: {
      type: string;
      values: string[];
    };
    rules?: Record<string, { enabled: boolean }>;
    [key: string]: any;
  }

  export function run(
    context?: Element | Document | string,
    options?: RunOptions
  ): Promise<AxeResults>;

  export const version: string;

  const axe: {
    run: typeof run;
    version: string;
  };

  export default axe;
}
