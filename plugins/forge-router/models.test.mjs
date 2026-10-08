import { test, expect } from "bun:test";
import { mapOpenRouterModels, selectCatalog } from "./models.mjs";

function model() {
  return {
    id: "example/reasoner",
    name: "Reasoner",
    context_length: 1000000,
    top_provider: { max_completion_tokens: 128000 },
    architecture: { input_modalities: ["text", "image", "audio", "file"] },
    supported_parameters: ["reasoning", "reasoning_effort", "tools"],
    reasoning: { supported_efforts: ["high", "none", "low", "future-effort"] },
    pricing: { prompt: "0.000002", completion: "0.00001", input_cache_read: "0.0000002" },
  };
}

test("maps first context price tier by threshold and inherits omitted rates", () => {
  const row = model();
  row.pricing.overrides = [
    { min_prompt_tokens: 300000, prompt: "0.000006" },
    { min_prompt_tokens: 200000, prompt: "0.000004" },
  ];
  const mapped = mapOpenRouterModels([row])[0];
  expect(mapped.cost).toEqual({
    input: 2, output: 10, cacheRead: expect.closeTo(0.2, 12), cacheWrite: 0,
    longContext: { inputThreshold: 200000, input: 4, output: 10, cacheRead: expect.closeTo(0.2, 12), cacheWrite: 0 },
  });
  expect(mapped.contextWindow).toBe(1000000);
  expect(mapped.input).toEqual(["text", "image"]);
  expect(mapped.thinking.efforts).toEqual(["low", "high"]);
});

test("does not turn missing or invalid paid prices into free models", () => {
  for (const value of [undefined, "", "invalid", "-1"]) {
    const row = model();
    row.pricing.prompt = value;
    expect(() => mapOpenRouterModels([row])).toThrow("Invalid OpenRouter price");
  }
  const free = model();
  free.pricing.prompt = "0";
  expect(mapOpenRouterModels([free])[0].cost.input).toBe(0);
});

test("requires every curated ID and excludes unrelated upstream models", () => {
  const row = model();
  expect(selectCatalog({ data: [row, { id: "unrelated/model" }] }, [row.id])).toEqual([row]);
  expect(() => selectCatalog({ data: [row] }, [row.id, "missing/model"])).toThrow("Curated model missing");
});
