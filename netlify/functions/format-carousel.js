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
            content: `You are an expert at splitting articles into Instagram carousel slides. Your job is to split the ENTIRE article into slides - do NOT summarize or skip any content.

Rules:
- Include the COMPLETE article text - every sentence must appear in the output
- Use up to 20 slides maximum (Instagram's limit)
- Slide 1 (type: "title"): First 1-2 paragraphs as the opening
- Slides 2-19 (type: "content"): Split the remaining text evenly across slides
- Final slide (type: "cta"): The last paragraph(s) of the article
- Each slide should have 50-90 words for comfortable reading
- Break at sentence or paragraph boundaries - never mid-sentence
- Calculate: total_words / 70 = approximate number of slides needed
- Do NOT summarize, paraphrase, or skip any text

Return a JSON object with this EXACT structure:
{
  "slides": [
    { "type": "title", "text": "First paragraph(s)..." },
    { "type": "content", "text": "Next chunk of text..." },
    { "type": "content", "text": "More text..." },
    { "type": "cta", "text": "Final paragraph(s)..." }
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
