const GRAPH_API_URL = 'https://graph.facebook.com/v18.0';

export async function onRequestPost(context) {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { images, caption } = await context.request.json();

    if (!images || images.length === 0) {
      return new Response(JSON.stringify({ error: 'No images provided' }), { status: 400, headers });
    }

    const accessToken = context.env.INSTAGRAM_ACCESS_TOKEN;
    const instagramId = context.env.INSTAGRAM_BUSINESS_ID;

    if (!accessToken || !instagramId) {
      return new Response(
        JSON.stringify({
          error: 'Instagram not configured',
          setup: true,
          message: 'Please add INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ID to your Cloudflare Pages environment variables.',
        }),
        { status: 500, headers }
      );
    }

    const mediaContainerIds = [];

    for (let i = 0; i < images.length; i++) {
      const containerResponse = await fetch(`${GRAPH_API_URL}/${instagramId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: images[i],
          is_carousel_item: true,
          access_token: accessToken,
        }),
      });

      if (!containerResponse.ok) {
        const error = await containerResponse.json();
        throw new Error(`Failed to create media container ${i + 1}: ${error.error?.message || 'Unknown error'}`);
      }

      const containerData = await containerResponse.json();
      mediaContainerIds.push(containerData.id);
    }

    const carouselResponse = await fetch(`${GRAPH_API_URL}/${instagramId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        media_type: 'CAROUSEL',
        children: mediaContainerIds.join(','),
        caption: caption || '',
        access_token: accessToken,
      }),
    });

    if (!carouselResponse.ok) {
      const error = await carouselResponse.json();
      throw new Error(`Failed to create carousel: ${error.error?.message || 'Unknown error'}`);
    }

    const { id: carouselContainerId } = await carouselResponse.json();

    const publishResponse = await fetch(`${GRAPH_API_URL}/${instagramId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: carouselContainerId, access_token: accessToken }),
    });

    if (!publishResponse.ok) {
      const error = await publishResponse.json();
      throw new Error(`Failed to publish carousel: ${error.error?.message || 'Unknown error'}`);
    }

    const publishData = await publishResponse.json();

    return new Response(
      JSON.stringify({ success: true, mediaId: publishData.id, message: 'Carousel posted to Instagram successfully!' }),
      { status: 200, headers }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Failed to post to Instagram' }), {
      status: 500,
      headers,
    });
  }
}
