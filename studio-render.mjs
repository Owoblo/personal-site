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
export async function renderSlide(canvas, data, index, { scale = 2 } = {}) {
  const slide = data.slides[index];
  if (!slide) return { fits: false, message: "Add a slide." };
  const density = scale === 1 ? 1 : 2;
  canvas.width = 1080 * density;
  canvas.height = 1350 * density;
  const c = canvas.getContext("2d"),
    dark = data.theme === "dark" || (data.theme === "mixed" && index % 2 === 1),
    bg = dark ? "#1C1B19" : "#F5F3EE",
    ink = dark ? "#E6E2D9" : "#292825",
    muted = dark ? "#ABA69B" : "#77746E",
    rule = dark ? "#393630" : "#E4E0D8";
  c.scale(density, density);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = "high";
  c.fillStyle = bg;
  c.fillRect(0, 0, 1080, 1350);
  c.textBaseline = "top";
  c.fillStyle = ink;
  c.font = "normal 400 36px Georgia,serif";
  c.fillText("John Owolabi", 88, 110);
  c.strokeStyle = muted;
  c.lineWidth = 2.5;
  c.beginPath();
  c.roundRect(900, 105, 92, 46, 23);
  c.stroke();
  c.beginPath();
  c.arc(dark ? 969 : 923, 128, 16, 0, Math.PI * 2);
  c.fillStyle = ink;
  c.fill();
  if (data.template === "reading") {
    c.font = "bold 54px Georgia,serif";
    const heading = slide.heading ? lines(c, slide.heading, 904) : [];
    const passage = slide.body.split(/\n\s*\n/).filter(Boolean);
    const paragraphs = passage.map((text, p) => {
      const cta =
        index === data.slides.length - 1 &&
        p === passage.length - 1 &&
        /johnowolabi\.com/i.test(text) &&
        /\b(read|subscribe|join)\b/i.test(text);
      c.font = `${cta ? "bold" : "normal"} 42px Georgia,serif`;
      return { lines: lines(c, text, 904), cta, gap: p ? (cta ? 56 : 20) : 0 };
    });
    const height =
      heading.length * 67 +
      (heading.length && paragraphs.length ? 34 : 0) +
      paragraphs.reduce((n, p) => n + p.lines.length * 61 + p.gap, 0);
    let y = Math.max(270, Math.round((1350 - height) / 2));
    c.fillStyle = ink;
    c.font = "bold 54px Georgia,serif";
    for (const line of heading) {
      c.fillText(line, 88, y);
      y += 67;
    }
    if (heading.length && paragraphs.length) y += 34;
    for (const paragraph of paragraphs) {
      if (paragraph.cta && paragraph.gap) {
        c.fillStyle = rule;
        c.fillRect(88, y + 18, 110, 2);
      }
      y += paragraph.gap;
      c.fillStyle = ink;
      c.font = `${paragraph.cta ? "bold" : "normal"} 42px Georgia,serif`;
      for (const line of paragraph.lines) {
        c.fillText(line, 88, y);
        y += 61;
      }
    }
    const words = (slide.body.match(/\S+/g) || []).length;
    const fits = y <= 1115 && words <= 200;
    c.fillStyle = muted;
    c.font = "26px Georgia,serif";
    c.textAlign = "left";
    c.fillText("JO · johnowolabi.com", 88, 1240);
    c.textAlign = "right";
    c.fillText(`${index + 1} / ${data.slides.length}`, 992, 1240);
    c.textAlign = "left";
    return {
      fits,
      words,
      message: fits
        ? `${words} body words · reading card ${index + 1} of ${data.slides.length}`
        : "This reading card needs more room. Split it before export.",
    };
  }
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
      height = 400,
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
      240,
      width,
      height,
    );
  }
  c.fillStyle = ink;
  const font = index === 0 && !photo ? 78 : 52;
  c.font = `bold ${font}px Georgia,serif`;
  const heading = slide.heading ? lines(c, slide.heading, 912) : [];
  c.font = `${photo ? 40 : 44}px Georgia,serif`;
  const body = slide.body ? lines(c, slide.body, 912) : [];
  const contentHeight =
    heading.length * font * 1.22 +
    (slide.heading ? 44 : 0) +
    body.length * (photo ? 56 : 64);
  let y = photo ? 700 : Math.max(320, Math.round(690 - contentHeight / 2));
  c.font = `bold ${font}px Georgia,serif`;
  for (const line of heading) {
    c.fillText(line, 84, y);
    y += font * 1.22;
  }
  if (slide.heading) y += 44;
  c.font = `${photo ? 40 : 44}px Georgia,serif`;
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
  c.fillText("JO · johnowolabi.com", 84, 1215);
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
