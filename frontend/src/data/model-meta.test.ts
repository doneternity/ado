import { enrichAll, fmtCtx, mergeModel, prettyName } from "./model-meta";
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
    expect(prettyName("models/gemini-3-flash")).toBe("Gemini 3 Flash");
  });
});
