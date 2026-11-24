import { open } from "@pixelkit/native";

export const FORMATS = ["jpeg", "webp"];

/** Encodes a thumbnail of `input` (a Buffer) at the given width. */
export async function thumbnail(input, { width, format = "webp", quality = 80 }) {
  if (!FORMATS.includes(format)) throw new Error(`unsupported format ${format}`);
  const image = await open(input);
  try {
    return await image.resize({ width, fit: "inside" }).encode(format, { quality });
  } finally {
    image.close();
  }
}
