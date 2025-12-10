const sharp = require('sharp');

exports.handler = async (event, context) => {
  try {
    const title = event.queryStringParameters?.title || 'Untitled';
    const author = event.queryStringParameters?.author || 'John Owolabi';

    // Dimensions for OpenGraph image
    const width = 1200;
    const height = 630;

    // Wrap text to fit width
    const wrappedTitle = wrapText(title, 28); // Wrap at ~28 chars per line
    const lines = wrappedTitle.slice(0, 4); // Max 4 lines

    // Calculate vertical positioning based on number of lines
    const titleFontSize = lines.length > 2 ? 60 : 72;
    const lineHeight = titleFontSize * 1.3;
    const totalHeight = lines.length * lineHeight;
    const startY = (height - totalHeight) / 2 - 40; // Center and move up slightly

    // Build SVG text elements for each line
    const titleTextElements = lines.map((line, index) => {
      const y = startY + (index * lineHeight);
      return `<text x="100" y="${y}" style="font-family: Georgia, serif; font-size: ${titleFontSize}px; font-weight: bold; fill: #1a1a1a;">${escapeXml(line)}</text>`;
    }).join('\n');

    // Create SVG with the post title and author name
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Background -->
        <rect width="${width}" height="${height}" fill="#E8E4DC"/>

        <!-- Decorative blue lines (matching your brand) -->
        <line x1="0" y1="${height - 200}" x2="250" y2="${height}" stroke="#6B9BD1" stroke-width="2"/>
        <line x1="400" y1="0" x2="${width}" y2="0" stroke="#6B9BD1" stroke-width="2"/>
        <line x1="${width - 250}" y1="${height}" x2="${width}" y2="${height - 100}" stroke="#6B9BD1" stroke-width="2"/>

        <!-- Title -->
        ${titleTextElements}

        <!-- Author name -->
        <text x="100" y="${height - 80}" style="font-family: Georgia, serif; font-size: 32px; fill: #666;">${escapeXml(author)}</text>

        <!-- Watermark -->
        <text x="100" y="100" style="font-family: Georgia, serif; font-size: 24px; fill: #999;">Graph</text>
        <text x="${width - 200}" y="100" style="font-family: Georgia, serif; font-size: 20px; fill: #999;">1200x630px</text>
      </svg>
    `;

    // Convert SVG to PNG using sharp
    const pngBuffer = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
      body: pngBuffer.toString('base64'),
      isBase64Encoded: true,
    };

  } catch (error) {
    console.error('Error generating OG image:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to generate image', details: error.message }),
    };
  }
};

// Helper function to wrap text
function wrapText(text, maxLength) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (testLine.length <= maxLength) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

// Helper function to escape XML special characters
function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
