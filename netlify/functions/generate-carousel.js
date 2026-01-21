const sharp = require('sharp');

// Carousel dimensions (Instagram portrait 4:5)
const WIDTH = 1080;
const HEIGHT = 1350;
const PADDING = 80;
const AUTHOR = 'John Owolabi';

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { title, date, content, theme = 'light' } = JSON.parse(event.body);

    if (!title || !content) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Title and content are required' })
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'OpenAI API key not configured' })
      };
    }

    // Step 1: Use AI to split content into slides
    const slides = await splitContentIntoSlides(apiKey, title, date, content);

    // Step 2: Generate PNG images for each slide
    const images = await generateSlideImages(slides, title, date, theme);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        slides: images,
        count: images.length
      })
    };

  } catch (error) {
    console.error('Error generating carousel:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || 'Failed to generate carousel'
      })
    };
  }
};

// Split content into slides using OpenAI
async function splitContentIntoSlides(apiKey, title, date, content) {
  // Strip HTML tags for AI processing
  const plainText = content
    .replace(/<h[23][^>]*>(.*?)<\/h[23]>/gi, '\n\n## $1\n\n')
    .replace(/<blockquote[^>]*><p>(.*?)<\/p><\/blockquote>/gi, '\n"$1"\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '$1')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert at creating Instagram carousel content. Split the article into 5-8 slides optimized for reading on a 1080x1350 image.

Rules:
- Slide 1 (title): Just return the first 1-2 sentences as the hook/intro text. Keep it under 80 words.
- Slides 2-N (content): Each slide should have 60-100 words max for readability
- Break at natural stopping points (complete thoughts, paragraph ends)
- Preserve key quotes and impactful statements
- Final slide: Include a brief closing thought

Return a JSON object with this EXACT structure:
{
  "slides": [
    { "type": "title", "text": "Opening hook text..." },
    { "type": "content", "text": "Content for slide 2..." },
    { "type": "content", "text": "Content for slide 3..." },
    { "type": "cta", "text": "Closing thought..." }
  ]
}

Return ONLY valid JSON, nothing else.`
        },
        {
          role: 'user',
          content: `Title: ${title}\n\nArticle:\n${plainText}`
        }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'OpenAI API request failed');
  }

  const data = await response.json();
  const result = JSON.parse(data.choices[0].message.content.trim());

  return result.slides;
}

// Generate PNG images for each slide
async function generateSlideImages(slides, title, date, theme) {
  const images = [];
  const totalSlides = slides.length;

  // Theme colors (using hex only - Sharp doesn't support rgba well)
  const colors = theme === 'dark' ? {
    background: '#1a1a1a',
    text: '#e0e0e0',
    textSecondary: '#a0a0a0',
    gridLine: '#252525'
  } : {
    background: '#F0EEE6',
    text: '#2c2c2c',
    textSecondary: '#666666',
    gridLine: '#e5e3db'
  };

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const slideNumber = i + 1;

    let svg;
    if (slide.type === 'title') {
      svg = generateTitleSlideSVG(title, date, slide.text, slideNumber, totalSlides, colors);
    } else {
      svg = generateContentSlideSVG(slide.text, slideNumber, totalSlides, colors, slide.type === 'cta');
    }

    const pngBuffer = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();

    images.push({
      index: slideNumber,
      type: slide.type,
      data: pngBuffer.toString('base64')
    });
  }

  return images;
}

// Generate grid lines for background (sparse grid for subtle texture)
function generateGridLines(colors) {
  const lines = [];
  const spacing = 40; // Sparse grid
  // Vertical lines
  for (let x = 0; x <= WIDTH; x += spacing) {
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${HEIGHT}" stroke="${colors.gridLine}" stroke-width="1"/>`);
  }
  // Horizontal lines
  for (let y = 0; y <= HEIGHT; y += spacing) {
    lines.push(`<line x1="0" y1="${y}" x2="${WIDTH}" y2="${y}" stroke="${colors.gridLine}" stroke-width="1"/>`);
  }
  return lines.join('\n');
}

// Generate SVG for title slide
function generateTitleSlideSVG(title, date, introText, slideNumber, totalSlides, colors) {
  const wrappedTitle = wrapText(title, 24);
  const titleLines = wrappedTitle.slice(0, 4);
  const titleFontSize = titleLines.length > 2 ? 58 : 68;
  const titleLineHeight = titleFontSize * 1.15;

  const wrappedIntro = wrapText(introText, 50);
  const introLines = wrappedIntro.slice(0, 8);

  const formattedDate = formatDate(date);

  // Calculate positions
  const titleStartY = 320;
  const dateY = titleStartY + (titleLines.length * titleLineHeight) + 30;
  const introStartY = dateY + 70;

  const titleTextElements = titleLines.map((line, index) => {
    const y = titleStartY + (index * titleLineHeight);
    return `<text x="${PADDING}" y="${y}" font-family="Georgia, serif" font-size="${titleFontSize}" font-weight="bold" fill="${colors.text}">${escapeXml(line)}</text>`;
  }).join('\n      ');

  const introTextElements = introLines.map((line, index) => {
    const y = introStartY + (index * 38);
    return `<text x="${PADDING}" y="${y}" font-family="Georgia, serif" font-size="26" font-weight="300" fill="${colors.text}">${escapeXml(line)}</text>`;
  }).join('\n      ');

  return `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${colors.background}"/>
  ${generateGridLines(colors)}
  <text x="${PADDING}" y="100" font-family="Georgia, serif" font-size="28" font-style="italic" fill="${colors.text}">${escapeXml(AUTHOR)}</text>
  <circle cx="${WIDTH - PADDING - 30}" cy="90" r="12" fill="${colors.text}"/>
  <rect x="${WIDTH - PADDING - 60}" y="78" width="60" height="24" rx="12" fill="none" stroke="${colors.text}" stroke-width="2"/>
  ${titleTextElements}
  <text x="${PADDING}" y="${dateY}" font-family="Georgia, serif" font-size="24" font-style="italic" fill="${colors.textSecondary}">${escapeXml(formattedDate)}</text>
  ${introTextElements}
  <text x="${WIDTH / 2}" y="${HEIGHT - 60}" text-anchor="middle" font-family="Georgia, serif" font-size="20" fill="${colors.textSecondary}">${slideNumber} / ${totalSlides}</text>
</svg>`;
}

// Generate SVG for content slide
function generateContentSlideSVG(text, slideNumber, totalSlides, colors, isCta = false) {
  const wrappedText = wrapText(text, 42);
  const lines = wrappedText.slice(0, 18);
  const fontSize = 30;
  const lineHeight = 46;

  // Center the text vertically
  const totalTextHeight = lines.length * lineHeight;
  const startY = (HEIGHT - totalTextHeight) / 2;

  const textElements = lines.map((line, index) => {
    const y = startY + (index * lineHeight);
    return `<text x="${PADDING}" y="${y}" font-family="Georgia, serif" font-size="${fontSize}" font-weight="300" fill="${colors.text}">${escapeXml(line)}</text>`;
  }).join('\n  ');

  const ctaElement = isCta ? `<text x="${PADDING}" y="${HEIGHT - 140}" font-family="Georgia, serif" font-size="22" fill="${colors.textSecondary}">Read more at johnowolabi.com</text>` : '';

  return `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${colors.background}"/>
  ${generateGridLines(colors)}
  <text x="${PADDING}" y="100" font-family="Georgia, serif" font-size="28" font-style="italic" fill="${colors.text}">${escapeXml(AUTHOR)}</text>
  <circle cx="${WIDTH - PADDING - 30}" cy="90" r="12" fill="${colors.text}"/>
  <rect x="${WIDTH - PADDING - 60}" y="78" width="60" height="24" rx="12" fill="none" stroke="${colors.text}" stroke-width="2"/>
  ${textElements}
  ${ctaElement}
  <text x="${WIDTH / 2}" y="${HEIGHT - 60}" text-anchor="middle" font-family="Georgia, serif" font-size="20" fill="${colors.textSecondary}">${slideNumber} / ${totalSlides}</text>
</svg>`;
}

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

// Helper function to format date
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}
