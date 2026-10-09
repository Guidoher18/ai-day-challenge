import "dotenv/config";
import { createApp } from "./app.js";
import { closeMcpClient, getMcpToolsets } from "./mcp/client.js";
import { getVectorStore } from "./rag/ingest.js";

const app = createApp();

await getVectorStore();
for (const [server, tools] of Object.entries(await getMcpToolsets())) {
  console.log(`MCP tools loaded [${server}]: ${tools.map((t) => t.name).join(", ")}`);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    closeMcpClient().finally(() => process.exit(0));
  });
}

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
