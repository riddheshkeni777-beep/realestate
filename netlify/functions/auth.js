exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
    }

    const { password } = JSON.parse(event.body || '{}');
    const correctPassword = process.env.ADMIN_PASSWORD || 'admin123';

    if (password === correctPassword) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, token: 'session_' + Date.now() })
      };
    } else {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, error: 'Invalid admin password' })
      };
    }
  } catch (err) {
    console.error('[Auth Error]:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: err.message || err })
    };
  }
};
