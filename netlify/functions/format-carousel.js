// Netlify Function to split article content into carousel slides using AI

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { title, date, content } = JSON.parse(event.body);

    if (!content) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Content is required' })
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'OpenAI API key not configured' })
      };
    }

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
            content: `You are an expert at creating Instagram carousel content. Split the article into 5-8 slides for a vertical Instagram carousel.

Rules:
- Slide 1 (type: "title"): The opening hook - first 1-2 sentences that grab attention. Keep under 60 words.
- Slides 2-N (type: "content"): Key points from the article. Each slide should have 50-80 words max for readability.
- Final slide (type: "cta"): A closing thought or takeaway. Keep under 60 words.
- Break at natural stopping points (complete thoughts)
- Preserve impactful quotes and key statements
- Don't add content that wasn't in the original

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

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        slides: result.slides
      })
    };

  } catch (error) {
    console.error('Error generating carousel slides:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || 'Failed to generate slides'
      })
    };
  }
};
