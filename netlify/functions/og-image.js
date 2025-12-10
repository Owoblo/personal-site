const sharp = require('sharp');

exports.handler = async (event, context) => {
  try {
    const title = event.queryStringParameters?.title || 'Untitled';
    const author = event.queryStringParameters?.author || 'John Owolabi';

    // Dimensions for OpenGraph image
    const width = 1200;
    const height = 630;

    // Create SVG with the post title and author name
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&amp;display=swap');
            .title {
              font-family: 'Libre Baskerville', serif;
              font-size: 72px;
              font-weight: 700;
              fill: #1a1a1a;
              line-height: 1.2;
            }
            .author {
              font-family: 'Libre Baskerville', serif;
              font-size: 32px;
              font-weight: 400;
              fill: #666;
            }
          </style>
        </defs>

        <!-- Background -->
        <rect width="${width}" height="${height}" fill="#E8E4DC"/>

        <!-- Decorative blue lines (matching your brand) -->
        <line x1="0" y1="${height - 200}" x2="250" y2="${height}" stroke="#6B9BD1" stroke-width="2"/>
        <line x1="400" y1="0" x2="${width}" y2="0" stroke="#6B9BD1" stroke-width="2"/>
        <line x1="${width - 250}" y1="${height}" x2="${width}" y2="${height - 100}" stroke="#6B9BD1" stroke-width="2"/>

        <!-- Content -->
        <g>
          <!-- Title (wrapped manually for now) -->
          <text x="100" y="250" class="title">
            <tspan x="100" dy="0">${escapeXml(wrapText(title, 25)[0] || '')}</tspan>
            ${wrapText(title, 25).slice(1).map((line, i) =>
              `<tspan x="100" dy="85">${escapeXml(line)}</tspan>`
            ).join('')}
          </text>

          <!-- Author name -->
          <text x="100" y="${height - 80}" class="author">${escapeXml(author)}</text>
        </g>
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

  // Limit to 3 lines max
  return lines.slice(0, 3);
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
