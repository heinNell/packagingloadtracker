import {
    ArrowPathIcon,
    CheckCircleIcon,
    Cog6ToothIcon,
    CubeIcon,
    ExclamationCircleIcon,
    MapPinIcon,
    TruckIcon
} from '@heroicons/react/24/outline';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { Link } from 'react-router-dom';
import { getActiveLoadsForTracking } from '../lib/api';
import {
    authenticate,
    clearAuth,
    formatLastConnected,
    getAssetsWithPositions,
    getHeadingDirection,
    getStatusColor,
    isAuthenticated,
} from '../lib/telematicsGuru';

// Fix Leaflet default icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Create vehicle marker icon - shows load indicator if vehicle has active delivery
function createVehicleIcon(asset, hasActiveLoad = false) {
  const color = getStatusColor(asset);
  const rotation = asset.heading || 0;
  const loadIndicator = hasActiveLoad ? `
    <div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);background:#7c3aed;color:white;font-size:8px;padding:1px 4px;border-radius:4px;white-space:nowrap;font-weight:bold;border:1px solid white;">
      LOAD
    </div>
  ` : '';

  return L.divIcon({
    html: `
      <div style="width:36px;height:${hasActiveLoad ? '48px' : '36px'};position:relative;display:flex;align-items:flex-start;justify-content:center;padding-top:0;">
        <div style="
          width:28px;height:28px;border-radius:50%;background:${color};
          border:3px solid ${hasActiveLoad ? '#7c3aed' : 'white'};display:flex;align-items:center;justify-content:center;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);transform:rotate(${rotation}deg);
        ">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L12 22M12 2L5 9M12 2L19 9"/>
          </svg>
        </div>
        ${asset.inTrip ? `
          <div style="position:absolute;top:-4px;right:-4px;width:12px;height:12px;border-radius:50%;background:#22c55e;border:2px solid white;animation:pulse 1.5s infinite;"></div>
        ` : ''}
        ${loadIndicator}
      </div>
      <style>@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.3);opacity:0.7}}</style>
    `,
    className: 'vehicle-marker',
    iconSize: [36, hasActiveLoad ? 48 : 36],
    iconAnchor: [18, hasActiveLoad ? 24 : 18],
    popupAnchor: [0, hasActiveLoad ? -24 : -18],
  });
}

// Fit bounds component
function FitBounds({ assets }) {
  const map = useMap();
  
  useEffect(() => {
    if (assets.length === 0) return;
    
    const validAssets = assets.filter(
      (a) => a.lastLatitude !== null && a.lastLongitude !== null
    );
    if (validAssets.length === 0) return;
    
    const bounds = L.latLngBounds(
      validAssets.map((a) => [a.lastLatitude, a.lastLongitude])
    );
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }, [assets, map]);
  
  return null;
}

export default function LiveTrackingPage() {
  const [assets, setAssets] = useState([]);
  const [activeLoads, setActiveLoads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [authenticated, setAuthenticated] = useState(isAuthenticated());
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [showLoadsPanel, setShowLoadsPanel] = useState(true);

  // Auth form state
  const [username, setUsername] = useState(localStorage.getItem('tg_username') || '');
  const [password, setPassword] = useState('');
  const [organisationId, setOrganisationId] = useState(
    localStorage.getItem('telematics_org_id') || '4002'
  );
  const [authLoading, setAuthLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(localStorage.getItem('tg_remember') === 'true');

  // Auto-authenticate on mount if credentials are saved
  useEffect(() => {
    const autoLogin = async () => {
      if (isAuthenticated()) {
        setAuthenticated(true);
        return;
      }
      
      const savedUsername = localStorage.getItem('tg_username');
      const savedPassword = localStorage.getItem('tg_password');
      const savedRemember = localStorage.getItem('tg_remember') === 'true';
      
      if (savedRemember && savedUsername && savedPassword) {
        console.log('[LiveTracking] Auto-authenticating with saved credentials...');
        setAuthLoading(true);
        const success = await authenticate(savedUsername, atob(savedPassword));
        if (success) {
          setAuthenticated(true);
        } else {
          localStorage.removeItem('tg_password');
          localStorage.removeItem('tg_remember');
          setRememberMe(false);
          setShowAuthDialog(true);
        }
        setAuthLoading(false);
      } else if (!isAuthenticated()) {
        setShowAuthDialog(true);
      }
    };
    
    autoLogin();
  }, []);

  const fetchAssets = useCallback(async () => {
    if (!authenticated || !organisationId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Fetch telematics data and active loads in parallel
      const [telematicsData, loadsResponse] = await Promise.all([
        getAssetsWithPositions(parseInt(organisationId)),
        getActiveLoadsForTracking().catch(() => ({ data: { activeLoads: [] } }))
      ]);
      
      setAssets(telematicsData);
      setActiveLoads(loadsResponse.data?.activeLoads || []);
      setLastRefresh(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch vehicles';
      setError(message);
      toast.error(message);
      if (message.includes('Authentication') || message.includes('expired')) {
        setAuthenticated(false);
        setShowAuthDialog(true);
      }
    } finally {
      setLoading(false);
    }
  }, [authenticated, organisationId]);

  // Create a map of telematics asset ID to load info
  const assetToLoadMap = useMemo(() => {
    const map = new Map();
    activeLoads.forEach(load => {
      if (load.vehicle?.telematicsAssetId) {
        map.set(load.vehicle.telematicsAssetId, load);
      }
      // Also try matching by vehicle name/code
      if (load.vehicle?.registration) {
        map.set(load.vehicle.registration.toLowerCase(), load);
      }
    });
    return map;
  }, [activeLoads]);

  // Get load for an asset
  const getLoadForAsset = useCallback((asset) => {
    // Try by telematics ID first
    if (assetToLoadMap.has(asset.id)) {
      return assetToLoadMap.get(asset.id);
    }
    // Try by name/code match
    const assetName = (asset.name || asset.code || '').toLowerCase();
    if (assetName && assetToLoadMap.has(assetName)) {
      return assetToLoadMap.get(assetName);
    }
    return null;
  }, [assetToLoadMap]);

  const handleAuth = async () => {
    if (!username || !password || !organisationId) return;
    
    setAuthLoading(true);
    setError(null);
    
    const success = await authenticate(username, password);
    
    if (success) {
      localStorage.setItem('telematics_org_id', organisationId);
      localStorage.setItem('tg_username', username);
      
      if (rememberMe) {
        localStorage.setItem('tg_password', btoa(password));
        localStorage.setItem('tg_remember', 'true');
      } else {
        localStorage.removeItem('tg_password');
        localStorage.removeItem('tg_remember');
      }
      
      setAuthenticated(true);
      setShowAuthDialog(false);
      setPassword('');
      toast.success('Connected to Telematics Guru');
    } else {
      setError('Invalid credentials');
      toast.error('Invalid credentials');
    }
    
    setAuthLoading(false);
  };

  const handleLogout = () => {
    clearAuth();
    setAuthenticated(false);
    setAssets([]);
    setUsername('');
    setOrganisationId('');
    setRememberMe(false);
    localStorage.removeItem('telematics_org_id');
    localStorage.removeItem('tg_username');
    localStorage.removeItem('tg_password');
    localStorage.removeItem('tg_remember');
    toast.success('Disconnected from Telematics');
  };

  // Initial fetch when authenticated
  useEffect(() => {
    if (authenticated && organisationId) {
      fetchAssets();
    }
  }, [authenticated, organisationId, fetchAssets]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh || !authenticated) return;
    
    const intervalId = setInterval(fetchAssets, refreshInterval * 1000);
    return () => clearInterval(intervalId);
  }, [autoRefresh, authenticated, refreshInterval, fetchAssets]);

  // Compute fleet statistics
  const stats = useMemo(() => {
    const moving = assets.filter((a) => a.speedKmH >= 5 || a.inTrip).length;
    const stationary = assets.filter((a) => a.speedKmH < 5 && !a.inTrip).length;
    const offline = assets.filter((a) => {
      if (!a.lastConnectedUtc) return true;
      return Date.now() - new Date(a.lastConnectedUtc).getTime() > 3600000;
    }).length;
    
    return { total: assets.length, moving, stationary, offline };
  }, [assets]);

  // Default map center (Zimbabwe)
  const defaultCenter = [-19.0, 31.0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Live Vehicle Tracking</h1>
          <p className="text-sm text-gray-500">
            Real-time fleet positions from Telematics Guru
          </p>
        </div>
        <div className="flex items-center gap-2">
          {authenticated ? (
            <>
              <button
                className="btn btn-secondary"
                onClick={fetchAssets}
                disabled={loading}
              >
                <ArrowPathIcon className={`w-5 h-5 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowSettingsDialog(true)}
              >
                <Cog6ToothIcon className="w-5 h-5" />
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => setShowAuthDialog(true)}>
              <TruckIcon className="w-5 h-5 mr-2" />
              Connect to Telematics
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {authenticated && (
        <div className="grid gap-4 md:grid-cols-5">
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <TruckIcon className="w-6 h-6 text-gray-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Vehicles</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircleIcon className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Moving</p>
                <p className="text-2xl font-bold text-green-600">{stats.moving}</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <MapPinIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Stationary</p>
                <p className="text-2xl font-bold text-blue-600">{stats.stationary}</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <CubeIcon className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Active Loads</p>
                <p className="text-2xl font-bold text-purple-600">{activeLoads.length}</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <ExclamationCircleIcon className="w-6 h-6 text-gray-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Offline</p>
                <p className="text-2xl font-bold text-gray-500">{stats.offline}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <ExclamationCircleIcon className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Map Card */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <MapPinIcon className="w-5 h-5" />
            Fleet Map
          </h2>
          {lastRefresh && (
            <span className="text-sm text-gray-500">
              Last updated: {lastRefresh.toLocaleTimeString()}
              {autoRefresh && ` • Auto-refresh: ${refreshInterval}s`}
            </span>
          )}
        </div>
        <div className="p-0">
          {!authenticated ? (
            <div className="h-[500px] flex flex-col items-center justify-center bg-gray-50 rounded-b-lg">
              <TruckIcon className="w-16 h-16 text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-700 mb-2">Connect to Telematics Guru</p>
              <p className="text-gray-500 mb-4">
                Sign in to view your fleet&apos;s live positions
              </p>
              <button className="btn btn-primary" onClick={() => setShowAuthDialog(true)}>
                <TruckIcon className="w-5 h-5 mr-2" />
                Connect Now
              </button>
            </div>
          ) : loading && assets.length === 0 ? (
            <div className="h-[500px] flex items-center justify-center">
              <ArrowPathIcon className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="h-[500px] rounded-b-lg overflow-hidden">
              <MapContainer
                center={defaultCenter}
                zoom={7}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://carto.com/">Carto</a>'
                />
                {assets.map((asset) => {
                  const load = getLoadForAsset(asset);
                  const hasActiveLoad = !!load;
                  
                  return asset.lastLatitude !== null && asset.lastLongitude !== null ? (
                    <Marker
                      key={asset.id}
                      position={[asset.lastLatitude, asset.lastLongitude]}
                      icon={createVehicleIcon(asset, hasActiveLoad)}
                    >
                      <Popup>
                        <div className="min-w-[220px]">
                          <div className="font-bold text-lg mb-2">
                            {asset.name || asset.code || `Vehicle ${asset.id}`}
                          </div>
                          
                          {/* Load Info Section */}
                          {load && (
                            <div className="mb-3 p-2 bg-purple-50 rounded-lg border border-purple-200">
                              <div className="flex items-center gap-1 text-purple-700 font-semibold text-sm mb-1">
                                <CubeIcon className="w-4 h-4" />
                                Active Delivery
                              </div>
                              <div className="text-xs space-y-1">
                                <div><span className="font-medium">Load:</span> {load.loadNumber}</div>
                                <div><span className="font-medium">From:</span> {load.origin?.name || 'N/A'}</div>
                                <div><span className="font-medium">To:</span> {load.destination?.name || 'N/A'}</div>
                                <div><span className="font-medium">Status:</span> 
                                  <span className={`ml-1 px-1.5 py-0.5 rounded text-xs ${
                                    load.status === 'in_transit' ? 'bg-indigo-100 text-indigo-700' :
                                    load.status === 'departed' ? 'bg-purple-100 text-purple-700' :
                                    load.status === 'loading' ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-blue-100 text-blue-700'
                                  }`}>
                                    {load.status?.replace('_', ' ')}
                                  </span>
                                </div>
                                {load.driver && (
                                  <div><span className="font-medium">Driver:</span> {load.driver.name}</div>
                                )}
                              </div>
                              <Link 
                                to={`/loads/${load.loadId}`}
                                className="text-xs text-purple-600 hover:underline mt-1 inline-block"
                              >
                                View Load Details →
                              </Link>
                            </div>
                          )}
                          
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Speed:</span>
                              <span>{asset.speedKmH} km/h</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Heading:</span>
                              <span>
                                {getHeadingDirection(asset.heading)} ({asset.heading}°)
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Last seen:</span>
                              <span>{formatLastConnected(asset.lastConnectedUtc)}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              {asset.inTrip ? (
                                <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                                  In Trip
                                </span>
                              ) : (
                                <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                                  Parked
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  ) : null;
                })}
                <FitBounds assets={assets} />
              </MapContainer>
            </div>
          )}
        </div>
      </div>

      {/* Vehicle List */}
      {authenticated && assets.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900">Vehicle List</h2>
          </div>
          <div className="p-4">
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {assets.map((asset) => {
                const load = getLoadForAsset(asset);
                return (
                  <div
                    key={asset.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer ${
                      load ? 'border-purple-300 bg-purple-50/50' : ''
                    }`}
                  >
                    <div
                      className={`w-3 h-3 rounded-full flex-shrink-0 ${load ? 'ring-2 ring-purple-400 ring-offset-1' : ''}`}
                      style={{ backgroundColor: getStatusColor(asset) }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {asset.name || asset.code || `Vehicle ${asset.id}`}
                      </p>
                      <p className="text-sm text-gray-500">
                        {asset.speedKmH} km/h • {formatLastConnected(asset.lastConnectedUtc)}
                      </p>
                      {load && (
                        <p className="text-xs text-purple-600 truncate">
                          📦 {load.loadNumber} → {load.destination?.code || 'N/A'}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      {asset.inTrip && (
                        <span className="px-2 py-0.5 bg-green-50 text-green-600 border border-green-200 rounded text-xs font-medium">
                          Moving
                        </span>
                      )}
                      {load && (
                        <Link 
                          to={`/loads/${load.loadId}`}
                          className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium hover:bg-purple-200"
                        >
                          View Load
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Active Loads Panel */}
      {authenticated && activeLoads.length > 0 && showLoadsPanel && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <CubeIcon className="w-5 h-5 text-purple-600" />
              Active Deliveries ({activeLoads.length})
            </h2>
            <button 
              className="text-gray-400 hover:text-gray-600 text-sm"
              onClick={() => setShowLoadsPanel(false)}
            >
              Hide
            </button>
          </div>
          <div className="p-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {activeLoads.map((load) => (
                <Link
                  key={load.loadId}
                  to={`/loads/${load.loadId}`}
                  className="block p-3 rounded-lg border border-purple-200 bg-purple-50/50 hover:bg-purple-100/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-semibold text-purple-700">{load.loadNumber}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      load.status === 'in_transit' ? 'bg-indigo-100 text-indigo-700' :
                      load.status === 'departed' ? 'bg-purple-100 text-purple-700' :
                      load.status === 'loading' ? 'bg-yellow-100 text-yellow-700' :
                      load.status === 'arrived_depot' ? 'bg-orange-100 text-orange-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {load.status?.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <div className="flex items-center gap-2">
                      <MapPinIcon className="w-4 h-4 text-green-500" />
                      <span className="truncate">{load.origin?.name || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPinIcon className="w-4 h-4 text-red-500" />
                      <span className="truncate">{load.destination?.name || 'N/A'}</span>
                    </div>
                    {load.vehicle && (
                      <div className="flex items-center gap-2 text-gray-500">
                        <TruckIcon className="w-4 h-4" />
                        <span>{load.vehicle.registration || load.vehicle.name}</span>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Authentication Dialog */}
      {showAuthDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Connect to Telematics Guru</h2>
            <p className="text-gray-500 mb-6">
              Enter your credentials to view live tracking data
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="user@example.com"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Organisation ID</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="4002"
                  value={organisationId}
                  onChange={(e) => setOrganisationId(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Your Matanuska org ID is 4002
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="rememberMe" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Remember me (stay signed in)
                </label>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  className="btn btn-secondary flex-1"
                  onClick={() => setShowAuthDialog(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary flex-1"
                  onClick={handleAuth}
                  disabled={authLoading || !username || !password || !organisationId}
                >
                  {authLoading ? (
                    <ArrowPathIcon className="w-5 h-5 animate-spin" />
                  ) : (
                    'Connect'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Dialog */}
      {showSettingsDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Tracking Settings</h2>
            <p className="text-gray-500 mb-6">
              Configure auto-refresh and connection settings
            </p>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Auto Refresh</p>
                  <p className="text-sm text-gray-500">
                    Update vehicle positions automatically
                  </p>
                </div>
                <button
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    autoRefresh 
                      ? 'bg-primary-100 text-primary-700' 
                      : 'bg-gray-100 text-gray-600'
                  }`}
                  onClick={() => setAutoRefresh(!autoRefresh)}
                >
                  {autoRefresh ? 'On' : 'Off'}
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Refresh Interval (seconds)
                </label>
                <input
                  type="number"
                  className="form-input"
                  min={10}
                  max={300}
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(parseInt(e.target.value) || 30)}
                />
              </div>
              <div className="pt-4 border-t">
                <button 
                  className="btn bg-red-600 text-white hover:bg-red-700 w-full" 
                  onClick={() => {
                    handleLogout();
                    setShowSettingsDialog(false);
                  }}
                >
                  Disconnect from Telematics
                </button>
              </div>
              <button
                className="btn btn-secondary w-full"
                onClick={() => setShowSettingsDialog(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
