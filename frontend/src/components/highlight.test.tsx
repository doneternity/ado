import { render } from "@testing-library/react";
import { highlight, type TokenClasses } from "./highlight";

const cls: TokenClasses = { comment: "c", string: "s", key: "k", keyword: "kw", number: "n", flag: "f" };

function spans(code: string, lang: string) {
  const { container } = render(<code>{highlight(code, lang, cls)}</code>);
  return { text: container.textContent, tokens: [...container.querySelectorAll("span")].map((s) => [s.className, s.textContent]) };
}

describe("highlight", () => {
  it("keeps the text intact and tags JSON keys, strings and numbers", () => {
    const code = '{ "model": "gemini", "max_tokens": 64, "stream": true }';
    const { text, tokens } = spans(code, "json");
    expect(text).toBe(code);
    expect(tokens).toEqual([["k", '"model"'], ["s", '"gemini"'], ["k", '"max_tokens"'], ["n", "64"], ["k", '"stream"'], ["kw", "true"]]);
  });

  it("tags bash flags and comments but not URLs inside strings", () => {
    const { tokens } = spans('# call it\ncurl "https://adoai.space/v1/models" -H "x"', "bash");
    expect(tokens).toEqual([["c", "# call it"], ["kw", "curl"], ["s", '"https://adoai.space/v1/models"'], ["f", "-H"], ["s", '"x"']]);
  });
});
