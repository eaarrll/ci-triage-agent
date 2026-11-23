import { createServer } from "node:http";
import { serverConfig } from "./config.js";
import { OrderService, UnknownSkuError } from "./orders/order-service.js";
import { createOrderSchema } from "./orders/order-schema.js";
import { catalog } from "./orders/catalog.js";

const orders = new OrderService(catalog);

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" }).end('{"status":"ok"}');
    return;
  }
  if (req.method === "POST" && req.url === "/quotes") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const parsed = createOrderSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success) {
      res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify(parsed.error.issues));
      return;
    }
    try {
      const quote = orders.quote(`ord_${Date.now().toString(36)}`, parsed.data);
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(quote));
    } catch (error) {
      const status = error instanceof UnknownSkuError ? 422 : 500;
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify({ error: String(error) }));
    }
    return;
  }
  res.writeHead(404).end();
});

server.listen(serverConfig.port, () => {
  console.info(`shop-api listening on :${serverConfig.port} (${serverConfig.env})`);
});
