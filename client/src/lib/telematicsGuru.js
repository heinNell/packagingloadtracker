/**
 * Telematics Guru API Client
 * Integrates with the tracking platform for live vehicle locations
 * Uses Supabase Edge Function as proxy to avoid CORS issues
 */

// Supabase Edge Function for proxying requests
const PROXY_URL = 'https://ffxwlswoyireoesuriqt.supabase.co/functions/v1/telematics-proxy';

// Supabase anon key for authentication with edge functions
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmeHdsc3dveWlyZW9lc3VyaXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzNDAzMjMsImV4cCI6MjA4MDkxNjMyM30.9wqBOyvmmgbTtO-u-NT2jUvzX97oTYTAPD4bIlxEsTY';

// Store token in memory
let authToken = null;
let tokenExpiry = null;

/**
 * Authenticate with Telematics Guru API via proxy
 */
export async function authenticate(username, password) {
  try {
    console.log('[TelematicsGuru] Authenticating:', username);
    
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        action: 'authenticate',
        username,
        password,
      }),
    });

    const text = await response.text();
    console.log('[TelematicsGuru] Response:', response.status, text.substring(0, 200));

    if (!response.ok) {
      console.error('Telematics auth failed:', response.status, text);
      return false;
    }

    const data = JSON.parse(text);
    
    if (!data.access_token) {
      console.error('Telematics auth: No access token in response', data);
      return false;
    }
    
    authToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000);
    
    localStorage.setItem('telematics_token', authToken);
    localStorage.setItem('telematics_expiry', tokenExpiry.toString());
    
    console.log('[TelematicsGuru] Authenticated successfully');
    return true;
  } catch (error) {
    console.error('Telematics auth error:', error);
    return false;
  }
}

/**
 * Get stored auth token
 */
export function getAuthToken() {
  if (authToken && tokenExpiry && Date.now() < tokenExpiry) {
    return authToken;
  }
  
  const storedToken = localStorage.getItem('telematics_token');
  const storedExpiry = localStorage.getItem('telematics_expiry');
  
  if (storedToken && storedExpiry && Date.now() < parseInt(storedExpiry)) {
    authToken = storedToken;
    tokenExpiry = parseInt(storedExpiry);
    return authToken;
  }
  
  return null;
}

/**
 * Check if authenticated
 */
export function isAuthenticated() {
  return getAuthToken() !== null;
}

/**
 * Clear authentication
 */
export function clearAuth() {
  authToken = null;
  tokenExpiry = null;
  localStorage.removeItem('telematics_token');
  localStorage.removeItem('telematics_expiry');
}

/**
 * Get all assets for an organisation via proxy
 */
export async function getAssets(organisationId) {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Not authenticated with Telematics Guru');
  }

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      action: 'getAssets',
      token,
      organisationId,
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearAuth();
      throw new Error('Authentication expired');
    }
    throw new Error('API error: ' + response.status);
  }

  return response.json();
}

/**
 * Get detailed asset information via proxy
 */
export async function getAssetDetails(assetId) {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Not authenticated with Telematics Guru');
  }

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      action: 'getAssetDetails',
      token,
      assetId,
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearAuth();
      throw new Error('Authentication expired');
    }
    throw new Error('API error: ' + response.status);
  }

  return response.json();
}

/**
 * Get all assets with their current positions
 */
export async function getAssetsWithPositions(organisationId) {
  const assets = await getAssets(organisationId);
  return assets.filter(function(asset) {
    return asset.lastLatitude !== null && 
           asset.lastLongitude !== null &&
           asset.isEnabled;
  });
}

/**
 * Format last connected time to relative string
 */
export function formatLastConnected(utcString) {
  if (!utcString) return 'Never';
  
  const date = new Date(utcString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return diffMins + 'm ago';
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return diffHours + 'h ago';
  
  const diffDays = Math.floor(diffHours / 24);
  return diffDays + 'd ago';
}

/**
 * Get status color based on asset state
 */
export function getStatusColor(asset) {
  if (!asset.isEnabled) return '#9CA3AF';
  if (asset.inTrip) return '#22C55E';
  if (asset.speedKmH > 0) return '#22C55E';
  return '#3B82F6';
}

/**
 * Get heading direction as compass point
 */
export function getHeadingDirection(heading) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(heading / 45) % 8;
  return directions[index];
}
