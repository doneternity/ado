import { joinNames, summarizeProviders } from "./catalog";

describe("summarizeProviders", () => {
  it("groups live models by provider, largest first, with an overall status", () => {
    const out = summarizeProviders([
      { id: "deepseek-v4-pro", status: "available" },
      { id: "deepseek-flash", status: "degraded" },
      { id: "gemini-3-flash", status: "down" },
    ]);
    expect(out.map((p) => [p.name, p.models.length, p.status])).toEqual([
      ["DeepSeek", 2, "degraded"],
      ["Google", 1, "down"],
    ]);
  });

  it("names Z.ai and Moonshot AI", () => {
    const out = summarizeProviders([
      { id: "glm-5.3", status: "available" },
      { id: "kimi-k2.5", status: "available" },
    ]);
    expect(out.map((p) => p.name).sort()).toEqual(["Moonshot AI", "Z.ai"]);
  });

  it("is empty when nothing is served", () => {
    expect(summarizeProviders([])).toEqual([]);
  });
});

describe("joinNames", () => {
  it("reads naturally for one, two and three names", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["DeepSeek"])).toBe("DeepSeek");
    expect(joinNames(["DeepSeek", "Google"])).toBe("DeepSeek and Google");
    expect(joinNames(["DeepSeek", "Google", "OpenAI"])).toBe("DeepSeek, Google and OpenAI");
  });
});
