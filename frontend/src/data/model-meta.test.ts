import { enrichAll, fmtCtx, fmtTokens, mergeModel, prettyName, providerOf } from "./model-meta";
import type { LiveModel } from "./model-meta";

// Shapes copied from DeepSeek's real /models response.
const flash: LiveModel = {
  id: "deepseek-flash",
  name: "DeepSeek-V4.1-Flash",
  context_window: 1048576,
  input_modalities: ["text", "image"],
  effort: { supported_levels: ["low", "high", "max"] },
  owned_by: "deepseek",
  ado_status: "available",
};
const pro: LiveModel = {
  id: "deepseek-v4-pro",
  name: "DeepSeek-V4-Pro",
  context_window: 1048576,
  input_modalities: ["text"],
  effort: { supported_levels: ["low", "high", "max"] },
  owned_by: "deepseek",
};

describe("model metadata", () => {
  it("uses the provider's metadata for uncatalogued models", () => {
    const m = mergeModel(flash);
    expect(m.name).toBe("DeepSeek V4.1 Flash");
    expect(m.provider).toBe("deepseek");
    expect(m.context).toBe("1M tokens");
    expect(m.capabilities).toEqual(["Streaming", "Reasoning", "Vision", "Long context"]);
  });

  it("lets live data override stale catalogue values but keeps curated extras", () => {
    const [m] = enrichAll([pro]);
    expect(m?.context).toBe("1M tokens"); // from the provider, not the catalogue
    expect(m?.tag).toBe("Strongest");     // only the catalogue knows this
  });

  it("lists catalogued models first, then the rest in provider order", () => {
    expect(enrichAll([flash, pro]).map((m) => m.id)).toEqual(["deepseek-v4-pro", "deepseek-flash"]);
  });

  it("falls back sensibly when the provider sends only an id", () => {
    const m = mergeModel({ id: "acme/some-model_x" });
    expect(m.name).toBe("Some Model X");
    expect(m.provider).toBe("other");
    expect(m.context).toBe("");
    expect(m.capabilities).toEqual(["Streaming"]);
  });

  it("formats context sizes", () => {
    expect(fmtCtx(2_097_152)).toBe("2M tokens");
    expect(fmtCtx(131_072)).toBe("128K tokens");
    expect(fmtCtx(200_000)).toBe("200K tokens");
    expect(fmtCtx(1_000_000)).toBe("1M tokens");
    expect(fmtCtx(1_050_000)).toBe("1.05M tokens");
    expect(prettyName("models/gemini-3-flash")).toBe("Gemini 3 Flash");
  });

  // Shape copied from the reseller provider's real /models entry, after ADO
  // strips its suffix (see backend proxy/alias.go).
  it("reads a provider's capabilities object and names GPT models properly", () => {
    const m = mergeModel({
      id: "gpt-6-sol",
      display_name: "GPT-6 Sol",
      owned_by: "dlab",
      capabilities: { contextWindow: 1_050_000, vision: true, reasoning: true },
    });
    expect(m.name).toBe("GPT-6 Sol"); // already a display name: kept as written
    expect(m.provider).toBe("openai"); // "dlab" names no known maker, so the ID decides
    expect(m.context).toBe("1.05M tokens");
    expect(m.capabilities).toEqual(["Streaming", "Reasoning", "Vision", "Long context"]);
  });

  it("recognises Z.ai GLM and Moonshot Kimi models", () => {
    const glm = mergeModel({ id: "glm-5.3", owned_by: "z-ai" });
    expect(glm.name).toBe("GLM 5.3");
    expect(glm.provider).toBe("zai");
    expect(glm.description).toMatch(/Z.ai/);

    const vision = mergeModel({ id: "glm-4.5v", owned_by: "system" });
    expect(vision.name).toBe("GLM 4.5V");
    expect(vision.provider).toBe("zai"); // "system" says nothing, so the ID decides
    expect(vision.capabilities).toContain("Vision");

    const kimi = mergeModel({ id: "kimi-k2-thinking", owned_by: "moonshot", context_length: 262144 });
    expect(kimi.name).toBe("Kimi K2 Thinking");
    expect(kimi.provider).toBe("moonshot");
    expect(kimi.context).toBe("256K tokens");
    expect(kimi.capabilities).toEqual(["Streaming", "Reasoning"]);
    expect(kimi.description).toMatch(/Moonshot AI/);
  });

  it("trusts the ID over the owner, and a known owner over an ID that says nothing", () => {
    // A reseller reported this Gemini model as owned by "openai" (2026-10-23).
    expect(providerOf({ id: "gemini-3.6-flash", owned_by: "openai" })).toBe("gemini");
    // ...and a MiniMax one (2026-10-24). "openai" as an owner says nothing.
    expect(providerOf({ id: "minimax-m2.7", owned_by: "openai" })).toBe("minimax");
    expect(providerOf({ id: "mystery-model", owned_by: "openai" })).toBe("other");
    expect(providerOf({ id: "nemotron-3-ultra-550b-a55b", owned_by: "openai" })).toBe("other");
    expect(providerOf({ id: "gpt-4o", owned_by: "openai" })).toBe("openai");
    expect(providerOf({ id: "some-model", owned_by: "Moonshot" })).toBe("moonshot");
    expect(providerOf({ id: "kimi-k2", owned_by: "Moonshot" })).toBe("moonshot");
    expect(providerOf({ id: "glm-5", owned_by: "organization-owner" })).toBe("zai");
    expect(providerOf({ id: "mystery", owned_by: "system" })).toBe("other");
  });

  it("formats token counts compactly", () => {
    expect(fmtTokens(1048576)).toBe("1M");
    expect(fmtTokens(1000000)).toBe("1M");
    expect(fmtTokens(393216)).toBe("384K");
    expect(fmtTokens(65535)).toBe("64K");
    expect(fmtTokens(65536)).toBe("64K");
    expect(fmtCtx(200000)).toBe("200K tokens");
  });

  it("describes Gemini models it doesn't list by ID", () => {
    const m = mergeModel({ id: "gemini-3.6-flash", owned_by: "openai", context_length: 1000000, max_output_tokens: 65536 });
    expect(m.provider).toBe("gemini");
    expect(m.description).toMatch(/fast Gemini model/);
    expect(m.maxOutputTokens).toBe(65536);
  });

  it("writes parameter counts in capitals", () => {
    expect(prettyName("nemotron-3-ultra-550b-a55b")).toBe("Nemotron 3 Ultra 550B A55B");
    expect(prettyName("qwen3.5-397b-a17b")).toBe("Qwen3.5 397B A17B");
  });

  it("names and describes MiniMax models", () => {
    const m = mergeModel({ id: "minimax-m3.1-flash", owned_by: "openai", context_length: 1000000, max_output_tokens: 524288 });
    expect(m.name).toBe("MiniMax M3.1 Flash");
    expect(m.provider).toBe("minimax");
    expect(m.description).toMatch(/faster MiniMax model/);
  });
});
