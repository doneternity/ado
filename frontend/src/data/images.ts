// Images attached to a Playground message: read in the browser, shrunk, and
// sent inline as data URLs (OpenAI's image_url content parts).

export const MAX_IMAGES = 4;
// Longest side after resizing; vision models scale larger images down anyway.
const MAX_SIDE = 1568;
// Files above this are refused before any decoding.
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
// Small images under this are sent as they are.
const KEEP_AS_IS_BYTES = 1.5 * 1024 * 1024;

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("could not read the image"));
    r.readAsDataURL(file);
  });
}

// prepareImage returns a data URL for file, resized to MAX_SIDE as a JPEG
// when it's large. Where the browser can't decode or draw it, the original
// is used as it is.
export async function prepareImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} isn't an image.`);
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name} is over 20 MB.`);
  const original = await readAsDataURL(file);
  if (typeof createImageBitmap !== "function") return original;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size <= KEEP_AS_IS_BYTES) {
      bmp.close();
      return original;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bmp.close();
      return original;
    }
    // JPEG has no transparency: put see-through areas on white, not black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return original;
  }
}

// messageContent is what goes to the API for one user message: plain text,
// or text and images as content parts.
export function messageContent(text: string, images: string[] | undefined): string | ContentPart[] {
  if (!images?.length) return text;
  const parts: ContentPart[] = [];
  if (text) parts.push({ type: "text", text });
  for (const url of images) parts.push({ type: "image_url", image_url: { url } });
  return parts;
}
