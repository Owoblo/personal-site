// Netlify Function to format content with OpenAI
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

    // Call OpenAI API
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
            content: `You are an expert content formatter. Your job is to take raw text and format it beautifully with HTML markup. Follow these guidelines:

1. Add <h2> tags for main section headings (analyze content to identify natural sections)
2. Add <h3> tags for subsections when appropriate
3. Use <strong> or <b> for emphasis on important words/phrases
4. Use <em> or <i> for subtle emphasis or foreign words
5. Use <blockquote><p>...</p></blockquote> for impactful quotes or key statements
6. Wrap paragraphs in <p> tags
7. Maintain the author's voice and tone - don't change the writing style
8. Don't add any content that wasn't in the original text
9. Preserve line breaks between paragraphs
10. Look for patterns like "Here's what..." or "The truth is..." that might warrant bold or blockquote treatment

Return ONLY the formatted HTML, no explanations or markdown code blocks.`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'OpenAI API request failed');
    }

    const data = await response.json();
    const formattedContent = data.choices[0].message.content.trim();

    return {
      statusCode: 200,
      body: JSON.stringify({
        formattedContent
      })
    };

  } catch (error) {
    console.error('Error formatting content:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || 'Failed to format content'
      })
    };
  }
};
