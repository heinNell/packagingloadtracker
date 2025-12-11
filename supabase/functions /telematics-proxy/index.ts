import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const TELEMATICS_API_BASE = 'https://api-emea04.telematics.guru';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-telematics-token',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

interface AuthRequest {
  username: string;
  password: string;
}

interface ProxyRequest {
  action: 'authenticate' | 'getAssets' | 'getAssetDetails';
  username?: string;
  password?: string;
  token?: string;
  organisationId?: number;
  assetId?: number;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: ProxyRequest = await req.json();

    if (body.action === 'authenticate') {
      // Authenticate with Telematics Guru
      if (!body.username || !body.password) {
        return new Response(
          JSON.stringify({ error: 'Username and password required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const formData = new URLSearchParams();
      formData.append('Username', body.username);
      formData.append('Password', body.password);

      const response = await fetch(`${TELEMATICS_API_BASE}/v1/user/authenticate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Telematics auth failed:', response.status, errorText);
        return new Response(
          JSON.stringify({ error: 'Authentication failed', status: response.status }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      return new Response(
        JSON.stringify(data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.action === 'getAssets') {
      // Get assets for an organisation
      if (!body.token || !body.organisationId) {
        return new Response(
          JSON.stringify({ error: 'Token and organisationId required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const response = await fetch(
        `${TELEMATICS_API_BASE}/v1/organisation/${body.organisationId}/asset`,
        {
          headers: {
            'Authorization': `Bearer ${body.token}`,
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Telematics getAssets failed:', response.status, errorText);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch assets', status: response.status }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      return new Response(
        JSON.stringify(data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.action === 'getAssetDetails') {
      // Get detailed asset information
      if (!body.token || !body.assetId) {
        return new Response(
          JSON.stringify({ error: 'Token and assetId required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const response = await fetch(
        `${TELEMATICS_API_BASE}/v1/asset/${body.assetId}`,
        {
          headers: {
            'Authorization': `Bearer ${body.token}`,
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Telematics getAssetDetails failed:', response.status, errorText);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch asset details', status: response.status }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      return new Response(
        JSON.stringify(data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});