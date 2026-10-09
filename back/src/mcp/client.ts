import { fileURLToPath } from "node:url";
import path from "node:path";
import type { StructuredToolInterface } from "@langchain/core/tools";
// MCPAdapter is the 2.x name of MultiServerMCPClient (still exported as a deprecated alias).
import { MCPAdapter } from "@langchain/mcp-adapters";

const thisFile = fileURLToPath(import.meta.url);
const isSource = thisFile.endsWith(".ts");
const projectRoot = path.resolve(path.dirname(thisFile), "..", "..");

const SUPLENTE_TOOLS = "suplente-tools";

// Under tsx (dev) spawn the .ts server through the tsx loader; from dist (prod) run the compiled .js.
// Using process.execPath avoids relying on npx/shell resolution, which is fragile on Windows.
const suplenteToolsServer = isSource
  ? { command: process.execPath, args: ["--import", "tsx", path.join(projectRoot, "src", "mcp", "server.ts")] }
  : { command: process.execPath, args: [path.join(projectRoot, "dist", "mcp", "server.js")] };

// Add more MCP servers here (stdio or HTTP); their tools are merged into getMcpTools().
// Names stay unprefixed and must be unique across servers.
// Optional servers are skipped with a warning if they fail to connect; suplente-tools is required.
// For third-party stdio servers, pass secrets via `env`: the MCP SDK merges it over a minimal
// whitelist (PATH, APPDATA, TEMP, ...) instead of the full process.env, so other secrets don't leak.
const client = new MCPAdapter({
  prefixToolNameWithServerName: false,
  onConnectionError: ({ serverName, error }) => {
    if (serverName === SUPLENTE_TOOLS) throw error;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[mcp] WARNING: server "${serverName}" failed to connect and was skipped: ${message}`);
  },
  servers: {
    [SUPLENTE_TOOLS]: { transport: "stdio", ...suplenteToolsServer, cwd: projectRoot, stderr: "inherit" },
  },
});

export type McpToolsets = Record<string, StructuredToolInterface[]>;

let toolsetsPromise: Promise<McpToolsets> | undefined;

/** Tools grouped by server name; servers that failed to connect are absent. */
export function getMcpToolsets(): Promise<McpToolsets> {
  toolsetsPromise ??= client.listToolsets().catch((err) => {
    toolsetsPromise = undefined;
    throw err;
  });
  return toolsetsPromise;
}

export async function getMcpTools(): Promise<StructuredToolInterface[]> {
  return Object.values(await getMcpToolsets()).flat();
}

export async function closeMcpClient(): Promise<void> {
  await client.close();
}
