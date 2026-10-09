import { fileURLToPath } from "node:url";
import path from "node:path";
import type { StructuredToolInterface } from "@langchain/core/tools";
// MCPAdapter is the 2.x name of MultiServerMCPClient (still exported as a deprecated alias).
import { MCPAdapter } from "@langchain/mcp-adapters";

const thisFile = fileURLToPath(import.meta.url);
const isSource = thisFile.endsWith(".ts");
const projectRoot = path.resolve(path.dirname(thisFile), "..", "..");

// Under tsx (dev) spawn the .ts server through the tsx loader; from dist (prod) run the compiled .js.
// Using process.execPath avoids relying on npx/shell resolution, which is fragile on Windows.
const suplenteToolsServer = isSource
  ? { command: process.execPath, args: ["--import", "tsx", path.join(projectRoot, "src", "mcp", "server.ts")] }
  : { command: process.execPath, args: [path.join(projectRoot, "dist", "mcp", "server.js")] };

// Add more MCP servers here (stdio or HTTP); their tools are merged into getMcpTools().
// Unprefixed names keep them aligned with the execute prompt; tool names must stay unique across servers.
const client = new MCPAdapter({
  prefixToolNameWithServerName: false,
  servers: {
    "suplente-tools": { transport: "stdio", ...suplenteToolsServer, cwd: projectRoot, stderr: "inherit" },
  },
});

let toolsPromise: Promise<StructuredToolInterface[]> | undefined;

export function getMcpTools(): Promise<StructuredToolInterface[]> {
  toolsPromise ??= client.listTools().catch((err) => {
    toolsPromise = undefined;
    throw err;
  });
  return toolsPromise;
}

export async function closeMcpClient(): Promise<void> {
  await client.close();
}
