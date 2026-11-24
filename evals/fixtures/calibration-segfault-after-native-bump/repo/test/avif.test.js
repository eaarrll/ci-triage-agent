import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { open } from "@pixelkit/native";
import { thumbnail } from "../src/thumbs.js";

const beach = () => readFile(new URL("./images/beach.jpg", import.meta.url));

test("encodes an AVIF thumbnail", async () => {
  const out = await open(await thumbnail(await beach(), { width: 320, format: "avif" }));
  assert.equal(out.format, "avif");
  assert.equal(out.width, 320);
});

test("AVIF is smaller than WebP at the same quality", async () => {
  const avif = await thumbnail(await beach(), { width: 640, format: "avif", quality: 60 });
  const webp = await thumbnail(await beach(), { width: 640, format: "webp", quality: 60 });
  assert.ok(avif.length < webp.length);
});
