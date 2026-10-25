export function splitBody(text, max = 45) {
  const sentences = String(text).match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [
    text,
  ];
  const out = [];
  let current = "";
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/);
    if (words.length > max) {
      if (current) {
        out.push(current);
        current = "";
      }
      for (let i = 0; i < words.length; i += max)
        out.push(words.slice(i, i + max).join(" "));
      continue;
    }
    if (current && (current + " " + sentence).match(/\S+/g).length > max) {
      out.push(current);
      current = "";
    }
    current = (current + " " + sentence).trim();
  }
  if (current) out.push(current);
  return out.filter(Boolean);
}
function lines(ctx, text, width) {
  const result = [];
  for (const paragraph of String(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (ctx.measureText(word).width > width) {
        if (line) {
          result.push(line);
          line = "";
        }
        let fragment = "";
        for (const letter of word) {
          if (ctx.measureText(fragment + letter).width > width) {
            result.push(fragment);
            fragment = "";
          }
          fragment += letter;
        }
        line = fragment;
      } else if (line && ctx.measureText(line + " " + word).width > width) {
        result.push(line);
        line = word;
      } else line = line ? line + " " + word : word;
    }
    result.push(line);
  }
  return result;
}
export async function renderSlide(canvas, data, index) {
  const slide = data.slides[index];
  if (!slide) return { fits: false, message: "Add a slide." };
  canvas.width = 1080;
  canvas.height = 1350;
  const c = canvas.getContext("2d"),
    dark = data.theme === "dark",
    bg = dark ? "#1C1B19" : "#F5F3EE",
    ink = dark ? "#E6E2D9" : "#292825",
    muted = dark ? "#ABA69B" : "#77746E",
    rule = dark ? "#393630" : "#E4E0D8";
  c.fillStyle = bg;
  c.fillRect(0, 0, 1080, 1350);
  c.textBaseline = "top";
  c.fillStyle = muted;
  c.font = "28px Georgia,serif";
  c.fillText("JO", 84, 74);
  c.textAlign = "right";
  c.fillText("A thought by John Owolabi", 996, 74);
  c.textAlign = "left";
  let y = index === 0 ? 250 : 190;
  const photo =
    data.template === "photo" &&
    (index === 0 || index % 3 === 0) &&
    index !== data.slides.length - 1;
  if (photo) {
    if (!data.photo)
      return {
        fits: false,
        message: "Choose your photograph for this layout.",
      };
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(Error("The photo could not be opened."));
      img.src = data.photo;
    });
    const width = 912,
      height = 470,
      scale = Math.max(width / image.width, height / image.height),
      sw = width / scale,
      sh = height / scale;
    c.drawImage(
      image,
      (image.width - sw) / 2,
      (image.height - sh) / 2,
      sw,
      sh,
      84,
      150,
      width,
      height,
    );
    y = 672;
  }
  c.fillStyle = ink;
  const font = index === 0 && !photo ? 78 : photo ? 52 : 56;
  c.font = `bold ${font}px Georgia,serif`;
  const heading = lines(c, slide.heading, 912);
  for (const line of heading) {
    c.fillText(line, 84, y);
    y += font * 1.22;
  }
  if (slide.heading) y += 36;
  c.font = `${photo ? 40 : 44}px Georgia,serif`;
  const body = lines(c, slide.body, 912);
  for (const line of body) {
    c.fillText(line, 84, y);
    y += photo ? 56 : 64;
  }
  const words = (slide.body.match(/\S+/g) || []).length;
  const fits = y < 1120 && words <= 70;
  c.fillStyle = rule;
  c.fillRect(84, 1176, 912, 1);
  c.fillStyle = muted;
  c.font = "26px Georgia,serif";
  c.fillText("John Owolabi · johnowolabi.com", 84, 1215);
  c.textAlign = "right";
  c.fillText(
    `${String(index + 1).padStart(2, "0")} / ${String(data.slides.length).padStart(2, "0")}`,
    996,
    1215,
  );
  c.textAlign = "left";
  return {
    fits,
    words,
    message: fits
      ? `${words} body words · slide ${index + 1} of ${data.slides.length}`
      : "This slide is too dense. Split it or shorten the heading before export.",
  };
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function zipFiles(files) {
  const encoder = new TextEncoder(),
    chunks = [],
    central = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name),
      bytes = file.bytes,
      crc = crc32(bytes),
      header = new Uint8Array(30 + name.length),
      v = new DataView(header.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, bytes.length, true);
    v.setUint32(22, bytes.length, true);
    v.setUint16(26, name.length, true);
    header.set(name, 30);
    chunks.push(header, bytes);
    const dir = new Uint8Array(46 + name.length),
      d = new DataView(dir.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x800, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, bytes.length, true);
    d.setUint32(24, bytes.length, true);
    d.setUint16(28, name.length, true);
    d.setUint32(42, offset, true);
    dir.set(name, 46);
    central.push(dir);
    offset += header.length + bytes.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0),
    end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end], { type: "application/zip" });
}
