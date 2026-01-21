// Instagram Carousel Posting via Graph API
// Requires: INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ID in environment variables

const GRAPH_API_URL = 'https://graph.facebook.com/v18.0';

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { images, caption } = JSON.parse(event.body);

    if (!images || images.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No images provided' })
      };
    }

    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const instagramId = process.env.INSTAGRAM_BUSINESS_ID;

    if (!accessToken || !instagramId) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Instagram not configured',
          setup: true,
          message: 'Please add INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ID to your Netlify environment variables.'
        })
      };
    }

    // Step 1: Create media containers for each image
    const mediaContainerIds = [];

    for (let i = 0; i < images.length; i++) {
      const imageUrl = images[i];

      const containerResponse = await fetch(
        `${GRAPH_API_URL}/${instagramId}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: imageUrl,
            is_carousel_item: true,
            access_token: accessToken
          })
        }
      );

      if (!containerResponse.ok) {
        const error = await containerResponse.json();
        throw new Error(`Failed to create media container ${i + 1}: ${error.error?.message || 'Unknown error'}`);
      }

      const containerData = await containerResponse.json();
      mediaContainerIds.push(containerData.id);
    }

    // Step 2: Create carousel container
    const carouselResponse = await fetch(
      `${GRAPH_API_URL}/${instagramId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'CAROUSEL',
          children: mediaContainerIds.join(','),
          caption: caption || '',
          access_token: accessToken
        })
      }
    );

    if (!carouselResponse.ok) {
      const error = await carouselResponse.json();
      throw new Error(`Failed to create carousel: ${error.error?.message || 'Unknown error'}`);
    }

    const carouselData = await carouselResponse.json();
    const carouselContainerId = carouselData.id;

    // Step 3: Publish the carousel
    const publishResponse = await fetch(
      `${GRAPH_API_URL}/${instagramId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: carouselContainerId,
          access_token: accessToken
        })
      }
    );

    if (!publishResponse.ok) {
      const error = await publishResponse.json();
      throw new Error(`Failed to publish carousel: ${error.error?.message || 'Unknown error'}`);
    }

    const publishData = await publishResponse.json();

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        mediaId: publishData.id,
        message: 'Carousel posted to Instagram successfully!'
      })
    };

  } catch (error) {
    console.error('Instagram posting error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || 'Failed to post to Instagram'
      })
    };
  }
};
