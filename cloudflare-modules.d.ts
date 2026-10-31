// Ambient declarations for Cloudflare runtime modules.
//
// `@cloudflare/workers-types` is not a dependency, and `wrangler types` output
// is deliberately not committed (see cloudflare-env.d.ts). This file must stay
// a script (no top-level import/export) so the module declaration augments a
// module that the bundler provides, rather than trying to resolve it.
declare module "cloudflare:workers" {
  export interface WorkflowRetryConfig {
    limit: number;
    delay?: string | number;
    backoff?: "constant" | "exponential";
  }

  export interface WorkflowStepConfig {
    retries?: WorkflowRetryConfig;
    timeout?: string | number;
  }

  export interface WorkflowStep {
    do<T>(name: string, callback: () => Promise<T>): Promise<T>;
    do<T>(name: string, config: WorkflowStepConfig, callback: () => Promise<T>): Promise<T>;
    sleep(name: string, duration: string | number): Promise<void>;
    sleepUntil(name: string, timestamp: number | Date): Promise<void>;
  }

  export interface WorkflowEvent<P = unknown> {
    payload: P;
    timestamp?: Date;
    instanceId?: string;
    workflowName?: string;
  }

  export class WorkflowEntrypoint<E = unknown, P = unknown> {
    constructor(ctx: unknown, env: E);
    readonly env: E;
    readonly ctx: unknown;
    run(event: WorkflowEvent<P>, step: WorkflowStep): Promise<unknown>;
  }
}
