import { readFile, mkdir, writeFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { mapOpenRouterModels, selectCatalog } from "./models.mjs";

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const TTL_MS = 24 * 60 * 60 * 1000;
const roster = JSON.parse(await readFile(new URL("./roster.json", import.meta.url), "utf8"));
const snapshot = JSON.parse(await readFile(new URL("./catalog.json", import.meta.url), "utf8"));

function validate(catalog) {
  const data = selectCatalog(catalog, roster);
  mapOpenRouterModels(data);
  return { fetchedAt: catalog.fetchedAt, data };
}

export async function loadCatalog(cachePath) {
  let catalog;
  try {
    catalog = validate(JSON.parse(await readFile(cachePath, "utf8")));
  } catch {
    catalog = validate(snapshot);
  }
  const age = Date.now() - Date.parse(catalog.fetchedAt);
  if (age >= 0 && age < TTL_MS) return { catalog };
  try {
    return { catalog: await syncCatalog(cachePath) };
  } catch {
    return { catalog, warning: "OpenRouter sync failed; using the last metadata snapshot. Run /forge-router sync to retry." };
  }
}

export async function syncCatalog(cachePath) {
  // Public metadata only. Never send the router credential to OpenRouter.
  let response;
  try {
    response = await fetch(OPENROUTER_MODELS_URL, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw new Error("OpenRouter catalog is unreachable; current metadata is unchanged.");
  }
  if (!response.ok) throw new Error(`OpenRouter catalog returned HTTP ${response.status}; current metadata is unchanged.`);
  const catalog = validate({ ...await response.json(), fetchedAt: new Date().toISOString() });
  await mkdir(dirname(cachePath), { recursive: true });
  const temporary = `${cachePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(catalog, null, 2) + "\n", { mode: 0o600 });
    await rename(temporary, cachePath);
  } finally {
    await rm(temporary, { force: true });
  }
  return catalog;
}
