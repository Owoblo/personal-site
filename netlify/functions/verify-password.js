// Netlify Function to verify admin password
// This keeps your password secure on the server side

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { password } = JSON.parse(event.body);

    if (!password) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No password provided' })
      };
    }

    // Get admin password from environment variable
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Admin password not configured' })
      };
    }

    // Verify password
    const isValid = password === adminPassword;

    return {
      statusCode: 200,
      body: JSON.stringify({
        valid: isValid
      })
    };

  } catch (error) {
    console.error('Error verifying password:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to verify password'
      })
    };
  }
};
