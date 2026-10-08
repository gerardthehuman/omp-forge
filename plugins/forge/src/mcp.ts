import process from "node:process";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { RequestId } from "@modelcontextprotocol/sdk/types.js";
import { readForge } from "./forge.ts";

let stdio: StdioServerTransport | undefined;
let remote: StreamableHTTPClientTransport | undefined;
let closing = false;
let initializeId: RequestId | undefined;

// HTTP error messages can contain response bodies; never print them or config.
function diagnose(context: string, error?: unknown) {
  const status = error instanceof Error && "code" in error && Number.isInteger(error.code) ? ` (code ${error.code})` : "";
  process.stderr.write(`[forge-mcp] ${context}${status}\n`);
}

async function shutdown(exitCode = 0) {
  if (closing) return;
  closing = true;

  // DELETE is best-effort: a dead Forge must not keep OMP's child alive.
  const deadline = setTimeout(() => {
    diagnose("Shutdown timed out; closing the bridge.");
    void remote?.close();
    process.exit(exitCode);
  }, 3000);

  try {
    await stdio?.close();
    await remote?.terminateSession();
  } catch (error) {
    diagnose("Could not terminate the Forge MCP session.", error);
  } finally {
    await remote?.close();
    clearTimeout(deadline);
    process.exit(exitCode);
  }
}

function fail(context: string, error: unknown) {
  if (closing) return;
  diagnose(context, error);
  void shutdown(1);
}

process.stdin.once("end", () => void shutdown());
process.stdin.once("close", () => void shutdown());
process.stdin.once("error", error => fail("Stdin failed.", error));
process.stdout.once("error", error => fail("Stdout failed.", error));
process.once("SIGTERM", () => void shutdown(143));
process.once("SIGINT", () => void shutdown(130));

async function start() {
  const config = (await readForge("/mcp"))?.forge;
  if (!config || config.type !== "remote" || typeof config.url !== "string") {
    throw new Error("Forge MCP is not a remote endpoint.");
  }
  const url = new URL(config.url);
  if (!["http:", "https:"].includes(url.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.username || url.password) {
    throw new Error("Forge MCP must use a local HTTP endpoint.");
  }
  if (config.headers !== undefined &&
      (!config.headers || typeof config.headers !== "object" || Array.isArray(config.headers) ||
       Object.values(config.headers).some(value => typeof value !== "string"))) {
    throw new Error("Forge MCP headers are invalid.");
  }

  stdio = new StdioServerTransport();
  remote = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: new Headers(config.headers) },
    // Applies to SDK GET as well as POST/DELETE; never redirect credentials.
    fetch: (input, init) => fetch(input, { ...init, redirect: "error" }),
  });

  stdio.onclose = () => void shutdown();
  remote.onclose = () => void shutdown();
  stdio.onerror = error => diagnose("Invalid stdio message.", error);
  remote.onerror = error => {
    if (!closing) diagnose("Forge MCP transport error.", error);
  };

  // Bridge transports directly. OMP alone initializes the Forge session, and
  // every protocol method, capability, instruction and request ID is preserved.
  stdio.onmessage = message => {
    if (closing) return;
    if ("method" in message && message.method === "initialize" && "id" in message) {
      initializeId = message.id;
    }
    // Do not serialize HTTP sends: cancellation and replies to server requests
    // must be able to pass while another request is still running.
    void remote!.send(message).catch(error => fail("Could not forward an MCP message to Forge.", error));
  };
  remote.onmessage = message => {
    if (closing) return;
    if (!("method" in message) && initializeId !== undefined && message.id === initializeId) {
      if ("result" in message && typeof message.result?.protocolVersion === "string") {
        // Normally Client.connect does this; there is intentionally no Client
        // here, because that would create a second initialize handshake.
        remote!.setProtocolVersion(message.result.protocolVersion);
      }
      initializeId = undefined;
    }
    void stdio!.send(message).catch(error => fail("Could not forward an MCP message to OMP.", error));
  };

  await remote.start();
  await stdio.start();
}

void start().catch(error => fail("Could not start the Forge MCP bridge.", error));
