import { MAX_IMAGE_BYTES, messageContent, prepareImage } from "./images";

describe("images", () => {
  it("sends text alone, or text and images as content parts", () => {
    expect(messageContent("hi", undefined)).toBe("hi");
    expect(messageContent("what is this?", ["data:image/png;base64,AAA"])).toEqual([
      { type: "text", text: "what is this?" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } },
    ]);
    // An image on its own needs no empty text part.
    expect(messageContent("", ["data:image/png;base64,AAA"])).toEqual([
      { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } },
    ]);
  });

  it("reads an image as a data URL, and refuses non-images and huge files", async () => {
    const png = new File([new Uint8Array([137, 80, 78, 71])], "pic.png", { type: "image/png" });
    expect(await prepareImage(png)).toMatch(/^data:image\/png;base64,/);

    await expect(prepareImage(new File(["x"], "notes.txt", { type: "text/plain" }))).rejects.toThrow("isn't an image");

    const huge = new File(["x"], "huge.png", { type: "image/png" });
    Object.defineProperty(huge, "size", { value: MAX_IMAGE_BYTES + 1 });
    await expect(prepareImage(huge)).rejects.toThrow("over 20 MB");
  });
});
