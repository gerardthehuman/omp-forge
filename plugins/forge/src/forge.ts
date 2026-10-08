import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ForgeCatalog } from "./models.ts";

interface ForgeRoutes {
  "/models": ForgeCatalog;
  "/providers": { forge: { options: { baseURL: string; apiKey: string; headers?: Record<string, string> } } };
  "/mcp": { forge?: { type: string; url: string; headers?: Record<string, string> } };
}

interface ServerDescriptor {
  host?: string;
  port: number;
  token: string;
}

export const serverFile = process.env.FORGE_SERVER_FILE || join(homedir(), ".forge", "server.json");

export async function readForge<Route extends keyof ForgeRoutes>(route: Route): Promise<ForgeRoutes[Route]> {
  let snapshot: ServerDescriptor;
  try {
    snapshot = JSON.parse(await readFile(serverFile, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") throw new Error(`Forge is not running: ${serverFile} is missing.`);
    throw error;
  }
  const host = snapshot.host || "127.0.0.1";
  if (!["127.0.0.1", "localhost", "::1"].includes(host) ||
      !Number.isInteger(snapshot.port) || snapshot.port < 1 || snapshot.port > 65535 ||
      typeof snapshot.token !== "string" || !snapshot.token) {
    throw new Error(`Invalid local Forge server descriptor: ${serverFile}`);
  }
  const authority = host === "::1" ? `[${host}]` : host;
  const response = await fetch(`http://${authority}:${snapshot.port}${route}`, {
    headers: { Authorization: `Bearer ${snapshot.token}` },
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Forge ${route} returned HTTP ${response.status}.`);
  return response.json() as Promise<ForgeRoutes[Route]>;
}
