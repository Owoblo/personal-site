// Netlify Function to generate complete blog post with OpenAI
// This keeps your API key secure on the server side

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { text } = JSON.parse(event.body);

    if (!text) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No text provided' })
      };
    }

    // Get OpenAI API key from environment variable
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'OpenAI API key not configured' })
      };
    }

    // Call OpenAI API to generate complete post metadata
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
            content: `You are an expert blog post generator. Analyze the raw article text and generate:

1. **Title**: A compelling, concise title (5-10 words) that captures the essence of the article
2. **Excerpt**: A 1-2 sentence summary (under 200 characters) that entices readers
3. **Formatted Content**: The article formatted with beautiful HTML markup:
   - Add <h2> tags for main section headings (analyze content to identify natural sections)
   - Add <h3> tags for subsections when appropriate
   - Use <strong> or <b> for emphasis on important words/phrases
   - Use <em> or <i> for subtle emphasis or foreign words
   - Use <blockquote><p>...</p></blockquote> for impactful quotes or key statements
   - Wrap paragraphs in <p> tags
   - Maintain the author's voice and tone - don't change the writing style
   - Don't add any content that wasn't in the original text
   - Preserve the natural flow and line breaks

Return a JSON object with this EXACT structure:
{
  "title": "The Generated Title",
  "excerpt": "A compelling 1-2 sentence summary under 200 characters.",
  "content": "<p>The full formatted HTML content...</p>"
}

Return ONLY valid JSON, nothing else.`
          },
          {
            role: 'user',
            content: text
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
      body: JSON.stringify({
        title: result.title,
        excerpt: result.excerpt,
        content: result.content
      })
    };

  } catch (error) {
    console.error('Error generating post:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || 'Failed to generate post'
      })
    };
  }
};
