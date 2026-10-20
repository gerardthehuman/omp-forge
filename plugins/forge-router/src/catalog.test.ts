import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readStartupCatalog, writeStartupCatalog, type DiscoveredCatalog } from "./catalog.ts";

const baseUrl = "https://router.example/api/v1";
const key = "private-router-credential";
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function cacheDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "forge-router-catalog-"));
  directories.push(directory);
  return directory;
}

function catalog(): DiscoveredCatalog {
  return {
    fetchedAt: "2020-01-01T00:00:00.000Z",
    discoveredAt: "2020-01-02T00:00:00.000Z",
    data: [
      {
        id: "example/chat",
        name: "Example Chat",
        context_length: 32000,
        top_provider: { max_completion_tokens: 8000 },
        architecture: { input_modalities: ["text"], output_modalities: ["text"] },
        pricing: { prompt: "0.000001", completion: "0.000002" },
      },
    ],
  };
}

test("round-trips stale startup catalogs privately with no credential in the snapshot", async () => {
  const directory = await cacheDirectory();
  const snapshot = catalog();
  await writeStartupCatalog(directory, baseUrl, key, snapshot);
  expect(await readStartupCatalog(directory, baseUrl, key)).toEqual(snapshot);

  const scope = createHash("sha256")
    .update(JSON.stringify([baseUrl, key]))
    .digest("hex");
  const filename = `startup-catalog-${scope}.json`;
  expect(await readdir(directory)).toEqual([filename]);
  const path = join(directory, filename);
  const contents = await readFile(path, "utf8");
  expect(contents).not.toContain(key);
  expect(JSON.parse(contents)).toEqual({ version: 1, ...snapshot });
  expect((await stat(path)).mode & 0o777).toBe(0o600);
});

test("isolates snapshots by both endpoint and credential", async () => {
  const directory = await cacheDirectory();
  const original = catalog();
  await writeStartupCatalog(directory, baseUrl, key, original);
  expect(await readStartupCatalog(directory, baseUrl, "other-credential")).toBeUndefined();
  expect(await readStartupCatalog(directory, "https://other.example/api/v1", key)).toBeUndefined();

  const otherCredential = { ...catalog(), data: [] };
  const otherEndpoint = { ...catalog(), discoveredAt: "2020-01-03T00:00:00.000Z" };
  await writeStartupCatalog(directory, baseUrl, "other-credential", otherCredential);
  await writeStartupCatalog(directory, "https://other.example/api/v1", key, otherEndpoint);
  expect(await readStartupCatalog(directory, baseUrl, key)).toEqual(original);
  expect(await readStartupCatalog(directory, baseUrl, "other-credential")).toEqual(otherCredential);
  expect(await readStartupCatalog(directory, "https://other.example/api/v1", key)).toEqual(
    otherEndpoint,
  );
});

test("ignores missing, corrupt, unsupported, and invalid startup catalogs", async () => {
  const directory = await cacheDirectory();
  expect(await readStartupCatalog(directory, baseUrl, key)).toBeUndefined();
  await writeStartupCatalog(directory, baseUrl, key, catalog());
  const [filename] = await readdir(directory);
  const path = join(directory, filename!);
  const valid = { version: 1, ...catalog() };
  const invalid = [
    "{broken",
    "null",
    JSON.stringify({ ...valid, version: 2 }),
    JSON.stringify({ ...valid, version: undefined }),
    JSON.stringify({ ...valid, fetchedAt: "not a date" }),
    JSON.stringify({ ...valid, fetchedAt: null }),
    JSON.stringify({ ...valid, discoveredAt: "not a date" }),
    JSON.stringify({ ...valid, discoveredAt: 42 }),
    JSON.stringify({ ...valid, data: {} }),
    JSON.stringify({ ...valid, data: [null] }),
    JSON.stringify({ ...valid, data: [{ ...valid.data[0], id: "" }] }),
    JSON.stringify({ ...valid, data: [{ ...valid.data[0], architecture: undefined }] }),
    JSON.stringify({
      ...valid,
      data: [{ ...valid.data[0], pricing: { prompt: "invalid", completion: "0" } }],
    }),
    JSON.stringify({ ...valid, data: [{ ...valid.data[0], context_length: -1 }] }),
  ];
  for (const contents of invalid) {
    await writeFile(path, contents);
    expect(await readStartupCatalog(directory, baseUrl, key)).toBeUndefined();
  }
});

test("an empty snapshot replaces and clears the previous startup catalog", async () => {
  const directory = await cacheDirectory();
  await writeStartupCatalog(directory, baseUrl, key, catalog());
  const empty = { ...catalog(), data: [] };
  await writeStartupCatalog(directory, baseUrl, key, empty);
  expect(await readStartupCatalog(directory, baseUrl, key)).toEqual(empty);
  expect(await readdir(directory)).toHaveLength(1);
});

test("accepts validated media-only snapshots without requiring chat metadata", async () => {
  const directory = await cacheDirectory();
  const media: DiscoveredCatalog = {
    ...catalog(),
    data: [
      { id: "example/image", architecture: { output_modalities: ["image"] } },
      { id: "example/video", architecture: { output_modalities: ["video"] } },
    ],
  };
  await writeStartupCatalog(directory, baseUrl, key, media);
  expect(await readStartupCatalog(directory, baseUrl, key)).toEqual(media);
});
