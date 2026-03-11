export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const title = url.searchParams.get('title') || 'Untitled';
    const author = url.searchParams.get('author') || 'John Owolabi';

    const width = 1200;
    const height = 630;

    const wrappedTitle = wrapText(title, 28);
    const lines = wrappedTitle.slice(0, 4);

    const titleFontSize = lines.length > 2 ? 60 : 72;
    const lineHeight = titleFontSize * 1.3;
    const totalHeight = lines.length * lineHeight;
    const startY = (height - totalHeight) / 2 - 40;

    const titleTextElements = lines
      .map((line, index) => {
        const y = startY + index * lineHeight;
        return `<text x="100" y="${y}" style="font-family: Georgia, serif; font-size: ${titleFontSize}px; font-weight: bold; fill: #1a1a1a;">${escapeXml(line)}</text>`;
      })
      .join('\n');

    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="#E8E4DC"/>
  <line x1="0" y1="${height - 200}" x2="250" y2="${height}" stroke="#6B9BD1" stroke-width="2"/>
  <line x1="400" y1="0" x2="${width}" y2="0" stroke="#6B9BD1" stroke-width="2"/>
  <line x1="${width - 250}" y1="${height}" x2="${width}" y2="${height - 100}" stroke="#6B9BD1" stroke-width="2"/>
  ${titleTextElements}
  <text x="100" y="${height - 80}" style="font-family: Georgia, serif; font-size: 32px; fill: #666;">${escapeXml(author)}</text>
</svg>`;

    return new Response(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to generate image', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function wrapText(text, maxLength) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxLength) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
