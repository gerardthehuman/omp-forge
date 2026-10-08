import { readFile, mkdir, writeFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { mapOpenRouterModels, selectCatalog, type OpenRouterCatalog, type OpenRouterModel } from "./models.ts";

interface RouterCatalog {
  data: { id: string }[];
}

interface MetadataCache extends OpenRouterCatalog {
  fetchedAt: string;
  source: string;
}

export interface DiscoveredCatalog {
  fetchedAt: string;
  discoveredAt: string;
  data: OpenRouterModel[];
}

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models?output_modalities=all";
const TTL_MS = 24 * 60 * 60 * 1000;

export async function fetchRouterCatalog(baseUrl: string, key: string | undefined, { fetcher = fetch, signal }: { fetcher?: (input: string, init?: RequestInit) => Promise<Response>; signal?: AbortSignal } = {}): Promise<RouterCatalog> {
  if (!key) throw new Error("Log in to Forge Router with /login before discovering models.");
  let response;
  try {
    response = await fetcher(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
      redirect: "error",
    });
  } catch {
    throw new Error("Forge Router model endpoint is unreachable.");
  }
  if (!response.ok) throw new Error(`Forge Router model endpoint returned HTTP ${response.status}.`);
  const catalog = await response.json() as RouterCatalog;
  if (!Array.isArray(catalog?.data) || catalog.data.some(model => typeof model.id !== "string" || !model.id)) {
    throw new Error("Invalid Forge Router model catalog.");
  }
  return catalog;
}

async function openRouterCatalog(cachePath: string, force: boolean): Promise<MetadataCache> {
  let cached: MetadataCache | undefined;
  try {
    cached = JSON.parse(await readFile(cachePath, "utf8"));
    if (!Array.isArray(cached?.data) || cached.source !== OPENROUTER_MODELS_URL) cached = undefined;
  } catch {}
  const age = Date.now() - Date.parse(cached?.fetchedAt ?? "");
  if (!force && cached && age >= 0 && age < TTL_MS) return cached;
  try {
    // Public metadata only; never forward the router credential.
    const response = await fetch(OPENROUTER_MODELS_URL, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`OpenRouter returned HTTP ${response.status}.`);
    const catalog: MetadataCache = { ...await response.json() as OpenRouterCatalog, fetchedAt: new Date().toISOString(), source: OPENROUTER_MODELS_URL };
    if (!Array.isArray(catalog.data)) throw new Error("Invalid OpenRouter catalog.");
    await mkdir(dirname(cachePath), { recursive: true });
    const temporary = `${cachePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(catalog) + "\n", { mode: 0o600 });
      await rename(temporary, cachePath);
    } finally {
      await rm(temporary, { force: true });
    }
    return catalog;
  } catch {
    if (!force && cached) return cached;
    throw new Error("OpenRouter metadata sync failed; current models are unchanged.");
  }
}

export async function discoverCatalog(baseUrl: string, key: string | undefined, cachePath: string, force = false): Promise<DiscoveredCatalog> {
  const [router, upstream] = await Promise.all([
    fetchRouterCatalog(baseUrl, key),
    openRouterCatalog(cachePath, force),
  ]);
  const data = selectCatalog(upstream, router.data.map(model => model.id));
  mapOpenRouterModels(data);
  return { fetchedAt: upstream.fetchedAt, discoveredAt: new Date().toISOString(), data };
}
