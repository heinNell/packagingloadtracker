const TELEMATICS_API_BASE = 'https://api-emea04.telematics.guru';

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { action, username, password, token, organisationId, assetId } = body;

    if (action === 'authenticate') {
      if (!username || !password) {
        return new Response(
          JSON.stringify({ error: 'Username and password required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const formData = new URLSearchParams();
      formData.append('Username', username);
      formData.append('Password', password);

      const response = await fetch(`${TELEMATICS_API_BASE}/v1/user/authenticate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: 'Authentication failed', status: response.status }),
          { status: response.status, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (action === 'getAssets') {
      if (!token || !organisationId) {
        return new Response(
          JSON.stringify({ error: 'Token and organisationId required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const response = await fetch(
        `${TELEMATICS_API_BASE}/v1/organisation/${organisationId}/asset`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch assets', status: response.status }),
          { status: response.status, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (action === 'getAssetDetails') {
      if (!token || !assetId) {
        return new Response(
          JSON.stringify({ error: 'Token and assetId required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const response = await fetch(`${TELEMATICS_API_BASE}/v1/asset/${assetId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch asset details', status: response.status }),
          { status: response.status, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}