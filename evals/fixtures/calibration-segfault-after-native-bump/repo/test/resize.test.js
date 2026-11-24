import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { open } from "@pixelkit/native";
import { thumbnail } from "../src/thumbs.js";

const fixture = (name) => readFile(new URL(`./images/${name}`, import.meta.url));

test("resizes a JPEG to 320px wide", async () => {
  const out = await open(await thumbnail(await fixture("beach.jpg"), { width: 320, format: "jpeg" }));
  assert.equal(out.width, 320);
});

test("keeps the aspect ratio", async () => {
  const out = await open(await thumbnail(await fixture("portrait.jpg"), { width: 200 }));
  assert.equal(out.height, 300);
});

test("resizes a 16-bit PNG", async () => {
  const out = await open(await thumbnail(await fixture("gradient-16bit.png"), { width: 128 }));
  assert.equal(out.width, 128);
});

test("handles a CMYK JPEG", async () => {
  const out = await open(await thumbnail(await fixture("cmyk.jpg"), { width: 128, format: "jpeg" }));
  assert.equal(out.channels, 3);
});
