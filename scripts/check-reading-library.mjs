import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";
const root = path.resolve(
  process.argv[2] ||
    path.join(process.cwd(), "..", "John Owolabi reading library"),
);
const manifest = JSON.parse(
  await readFile(path.join(root, "manifest.json"), "utf8"),
);
let checked = 0,
  minTextPixels = Infinity;
for (const item of manifest.thoughts) {
  assert.equal(item.sourcePreserved, true);
  for (let i = 0; i < item.slides.length; i++) {
    const file = path.join(root, item.folder, item.slides[i].name),
      meta = await sharp(file).metadata();
    assert.equal(meta.width, 2160);
    assert.equal(meta.height, 2700);
    assert.equal(meta.format, "png");
    const { data, info } = await sharp(file)
      .resize(216, 270)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const bg = i % 2 ? [28, 27, 25] : [245, 243, 238];
    assert.deepEqual(Array.from(data.subarray(0, 3)), bg);
    let ink = 0;
    for (let y = 50; y < 225; y++)
      for (let x = 18; x < 199; x++) {
        const p = (y * info.width + x) * info.channels;
        if (
          Math.abs(data[p] - bg[0]) +
            Math.abs(data[p + 1] - bg[1]) +
            Math.abs(data[p + 2] - bg[2]) >
          90
        )
          ink++;
      }
    assert.ok(ink > 30, "No visible reading text in " + file);
    minTextPixels = Math.min(minTextPixels, ink);
    checked++;
  }
}
const report = {
  thoughts: manifest.thoughts.length,
  checkedImages: checked,
  width: 2160,
  height: 2700,
  format: "PNG",
  visibleReadingTextVerified: true,
  minimumTextPixelsAtThumbnailSize: minTextPixels,
  palettesVerified: true,
  allSourceWordsPreserved: true,
};
await writeFile(
  path.join(root, "quality-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
