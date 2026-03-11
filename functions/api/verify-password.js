export async function onRequestPost(context) {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { password } = await context.request.json();

    if (!password) {
      return new Response(JSON.stringify({ error: 'No password provided' }), {
        status: 400,
        headers,
      });
    }

    const adminPassword = context.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      return new Response(JSON.stringify({ error: 'Admin password not configured' }), {
        status: 500,
        headers,
      });
    }

    return new Response(JSON.stringify({ valid: password === adminPassword }), {
      status: 200,
      headers,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to verify password' }), {
      status: 500,
      headers,
    });
  }
}
