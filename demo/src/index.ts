import sdk from "heavy-sdk";
import { captureError } from "heavy-sdk";
import { groupBy, sortBy, uniqBy, chunk, flatten } from "lodash-es";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/init") {
      const result = sdk.init({ dsn: "https://example.com" });
      return Response.json(result);
    }

    if (url.pathname === "/process") {
      const body = await request.json() as { items: Array<{ group: string; value: number }> };
      const grouped = groupBy(body.items, "group");
      const sorted = sortBy(body.items, "value");
      const unique = uniqBy(body.items, "group");
      return Response.json({ grouped, sorted, unique });
    }

    if (url.pathname === "/error") {
      const result = captureError(new Error("test error"));
      return Response.json(result);
    }

    if (url.pathname === "/metrics") {
      const result = sdk.getMetrics();
      return Response.json(result);
    }

    if (url.pathname === "/lodash") {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const chunks = chunk(data, 3);
      const flat = flatten(chunks);
      return Response.json({ chunks, flat });
    }

    return new Response(
      "worker-split demo v0.2\n\nRoutes: /init, /process, /error, /metrics, /lodash",
      { headers: { "content-type": "text/plain" } },
    );
  },
};
