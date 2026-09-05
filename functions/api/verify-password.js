import { clearSessionCookie, createSessionCookie, isAuthorized } from '../_lib/auth.js';

export async function onRequestGet(context) {
  return new Response(JSON.stringify({ authenticated: await isAuthorized(context.request, context.env) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestDelete() {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearSessionCookie(), 'Cache-Control': 'no-store' },
  });
}

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

    if (password !== adminPassword) {
      return new Response(JSON.stringify({ valid: false, error: 'Invalid password' }), {
        status: 401,
        headers: { ...headers, 'Cache-Control': 'no-store' },
      });
    }

    return new Response(JSON.stringify({ valid: true }), {
      status: 200,
      headers: {
        ...headers,
        'Cache-Control': 'no-store',
        'Set-Cookie': await createSessionCookie(adminPassword),
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to verify password' }), {
      status: 500,
      headers,
    });
  }
}
