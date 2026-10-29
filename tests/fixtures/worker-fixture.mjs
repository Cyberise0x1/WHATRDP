// Test-only wrapper. Never referenced by wrangler.jsonc or the published app.
import worker from "../../.open-next/worker.js";

export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === "/__fixture/sql") {
      const { sql, values = [], method = "first" } = await request.json();
      const statement = env.DB.prepare(sql).bind(...values);
      return Response.json(await statement[method]());
    }
    return worker.fetch(request, env, ctx);
  },
};
