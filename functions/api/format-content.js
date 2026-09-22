import { requireAdmin } from '../_lib/auth.js';

export async function onRequestPost(context) {
  const unauthorized = await requireAdmin(context);
  if (unauthorized) return unauthorized;
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { text } = await context.request.json();

    if (!text || typeof text !== 'string' || text.length > 100_000) {
      return new Response(JSON.stringify({ error: 'No text provided' }), { status: 400, headers });
    }

    const apiKey = context.env.OPENAI_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), { status: 500, headers });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert blog post generator. Analyze the raw article text and generate:

1. **Title Options**: Generate 4 different compelling title variations (5-10 words each) that capture different angles of the article.
   - TITLE RULE (hard): Don't name the topic. Name the thought. A good title sounds like a realization a person might have driving home at 11 p.m. — e.g. "You Don't Lose Everyone at Once", "Maybe I'm Not Behind", "The Explosion Gets the Headline". A bad title describes the subject like an essay assignment — e.g. "Confronting Mortality: A Personal Reflection". Never use the "Confronting X: A Y Reflection" pattern. Prefer the sentence that made the author stop and think, not a summary of the subject.
2. **Excerpt**: A 1-2 sentence summary (under 200 characters) that entices readers
3. **Formatted Content**: Return a publication-ready HTML article, not a plain-text transcription.
   - Wrap every paragraph in <p> tags.
   - Find the genuine changes of idea and introduce them with <h2> tags. Use <h3> only for a real sub-point. Do not add headings merely to decorate the page.
   - Make the structure visually intentional: for an article longer than 500 words, use 2–5 <h2> headings where the source has genuine thematic shifts.
   - Turn 1–3 of the strongest, self-contained sentences from the source into pull quotes using <blockquote><p>exact sentence from the source</p></blockquote>. A pull quote must be verbatim and must not replace its original paragraph.
   - Use <strong> for decisive phrases sparingly (normally no more than once every two paragraphs). Use <em> only where the author's voice benefits from it.
   - Use <ul>/<ol>/<li> when the source is already a list or contains a clear sequence; never invent list items.
   - Preserve the author's words, meaning, paragraph order, and tone. You may add HTML tags only; do not rewrite, add facts, or manufacture quotations.
   - Do not return Markdown, CSS, classes, inline styles, or HTML outside the article body.

Return a JSON object with this EXACT structure:
{
  "titleOptions": ["Title Option 1", "Title Option 2", "Title Option 3", "Title Option 4"],
  "excerpt": "A compelling 1-2 sentence summary under 200 characters.",
  "content": "<p>The full formatted HTML content...</p>"
}

Return ONLY valid JSON, nothing else.`,
          },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'OpenAI API request failed');
    }

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content.trim());

    return new Response(
      JSON.stringify({ titleOptions: result.titleOptions, excerpt: result.excerpt, content: result.content }),
      { status: 200, headers }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Failed to generate post' }), {
      status: 500,
      headers,
    });
  }
}
