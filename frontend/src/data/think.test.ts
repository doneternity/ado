import { splitThink } from "./think";

describe("splitThink", () => {
  it("leaves a normal reply alone", () => {
    expect(splitThink("Hello <think>not at the start</think>")).toEqual({ reasoning: "", answer: "Hello <think>not at the start</think>" });
  });

  it("splits a leading <think> block from the answer", () => {
    expect(splitThink("<think>\nLet me see.\n</think>\n\nThe answer is 4.")).toEqual({ reasoning: "Let me see.", answer: "The answer is 4." });
  });

  it("treats everything as reasoning until the closing tag arrives", () => {
    expect(splitThink("<think>Still working")).toEqual({ reasoning: "Still working", answer: "" });
  });
});
