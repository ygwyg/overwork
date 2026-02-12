export function generateEntryShim(originalEntry: string): string {
  return `import { __setEnv } from "./__stubs/_env.js";
import originalWorker from "${originalEntry}";

export default {
  async fetch(request, env, ctx) {
    __setEnv(env);
    return originalWorker.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    __setEnv(env);
    if (originalWorker.scheduled) {
      return originalWorker.scheduled(event, env, ctx);
    }
  },

  async queue(batch, env, ctx) {
    __setEnv(env);
    if (originalWorker.queue) {
      return originalWorker.queue(batch, env, ctx);
    }
  },
};
`;
}
