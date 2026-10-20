import { enrichAll, fmtCtx, mergeModel, prettyName, providerOf } from "./model-meta";
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

  it("trusts a known owner over the ID, and the ID over an unknown owner", () => {
    expect(providerOf({ id: "kimi-k2", owned_by: "Moonshot" })).toBe("moonshot");
    expect(providerOf({ id: "glm-5", owned_by: "organization-owner" })).toBe("zai");
    expect(providerOf({ id: "mystery", owned_by: "system" })).toBe("other");
  });
});
