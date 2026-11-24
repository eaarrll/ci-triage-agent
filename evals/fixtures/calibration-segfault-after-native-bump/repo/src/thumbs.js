import { open } from "@pixelkit/native";

export const FORMATS = ["jpeg", "webp", "avif"];

/** Encodes a thumbnail of `input` (a Buffer) at the given width. */
export async function thumbnail(input, { width, format = "webp", quality = 80 }) {
  if (!FORMATS.includes(format)) throw new Error(`unsupported format ${format}`);
  const image = await open(input);
  try {
    // AVIF needs @pixelkit/native 2.8+, which bundles libavif.
    const options = format === "avif" ? { quality, effort: 4 } : { quality };
    return await image.resize({ width, fit: "inside" }).encode(format, options);
  } finally {
    image.close();
  }
}
