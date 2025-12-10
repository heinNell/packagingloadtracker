import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests from authStore
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// =====================================================
// AUTH API
// =====================================================

/**
 * @param {string} email 
 * @param {string} password 
 */
export const login = (email, password) => 
  api.post('/auth/login', { email, password });

/**
 * @param {object} userData 
 */
export const register = (userData) => 
  api.post('/auth/register', userData);

export const getCurrentUser = () => 
  api.get('/auth/me');

/**
 * @param {string} currentPassword 
 * @param {string} newPassword 
 */
export const changePassword = (currentPassword, newPassword) => 
  api.put('/auth/password', { currentPassword, newPassword });

// =====================================================
// DASHBOARD API
// =====================================================

export const getDashboardSummary = () => 
  api.get('/dashboard/summary');

/**
 * @param {object} params 
 */
export const getLoadsSummary = (params) => 
  api.get('/dashboard/loads-summary', { params });

/**
 * @param {object} params 
 */
export const getPackagingTrends = (params) => 
  api.get('/dashboard/packaging-trends', { params });

/**
 * @param {object} params 
 */
export const getRouteVolumes = (params) => 
  api.get('/dashboard/route-volumes', { params });

/**
 * @param {string} alertId 
 */
export const acknowledgeAlert = (alertId) => 
  api.post(`/dashboard/alerts/${alertId}/acknowledge`);

// =====================================================
// SITES API
// =====================================================

/**
 * @param {object} params 
 */
export const getSites = (params) => 
  api.get('/sites', { params });

export const getSiteTypes = () => 
  api.get('/sites/types');

/**
 * @param {string} siteId 
 */
export const getSite = (siteId) => 
  api.get(`/sites/${siteId}`);

/**
 * @param {object} siteData 
 */
export const createSite = (siteData) => 
  api.post('/sites', siteData);

/**
 * @param {string} siteId 
 * @param {object} siteData 
 */
export const updateSite = (siteId, siteData) => 
  api.put(`/sites/${siteId}`, siteData);

/**
 * @param {string} siteId 
 */
export const getSiteInventory = (siteId) => 
  api.get(`/sites/${siteId}/inventory`);

/**
 * @param {string} siteId 
 * @param {string} packagingTypeId 
 * @param {object} data 
 */
export const updateSiteInventory = (siteId, packagingTypeId, data) => 
  api.put(`/sites/${siteId}/inventory/${packagingTypeId}`, data);

// =====================================================
// PACKAGING API
// =====================================================

/**
 * @param {object} params 
 */
export const getPackagingTypes = (params) => 
  api.get('/packaging/types', { params });

/**
 * @param {object} data 
 */
export const createPackagingType = (data) => 
  api.post('/packaging/types', data);

/**
 * @param {string} id 
 * @param {object} data 
 */
export const updatePackagingType = (id, data) => 
  api.put(`/packaging/types/${id}`, data);

export const getPackagingInTransit = () => 
  api.get('/packaging/in-transit');

/**
 * @param {object} params 
 */
export const getPackagingMovements = (params) => 
  api.get('/packaging/movements', { params });

export const getProducts = () => 
  api.get('/config/products/types');

export const getGrades = () => 
  api.get('/config/products/grades');

// =====================================================
// LOADS API
// =====================================================

/**
 * @param {object} params 
 */
export const getLoads = (params) => 
  api.get('/loads', { params });

/**
 * @param {string} loadId 
 */
export const getLoad = (loadId) => 
  api.get(`/loads/${loadId}`);

/**
 * @param {object} loadData 
 */
export const createLoad = (loadData) => 
  api.post('/loads', loadData);

/**
 * @param {string} loadId 
 * @param {object} loadData 
 */
export const updateLoad = (loadId, loadData) => 
  api.put(`/loads/${loadId}`, loadData);

/**
 * @param {string} loadId 
 */
export const deleteLoad = (loadId) => 
  api.delete(`/loads/${loadId}`);

/**
 * @param {string} loadId 
 * @param {object} data 
 */
export const dispatchLoad = (loadId, data) => 
  api.post(`/loads/${loadId}/confirm-dispatch`, data);

/**
 * @param {string} loadId 
 * @param {object} data 
 */
export const receiveLoad = (loadId, data) => 
  api.post(`/loads/${loadId}/confirm-receipt`, data);

/**
 * @param {string} loadId 
 * @param {object} data 
 */
export const duplicateLoad = (loadId, data) => 
  api.post(`/loads/${loadId}/duplicate`, data);

/**
 * Confirm farm arrival time for overtime tracking
 * @param {string} loadId 
 * @param {{ actualFarmArrivalTime: string }} data 
 */
export const confirmFarmArrival = (loadId, data) => 
  api.post(`/loads/${loadId}/confirm-farm-arrival`, data);

/**
 * Confirm farm departure time for overtime tracking
 * @param {string} loadId 
 * @param {{ actualFarmDepartureTime: string }} data 
 */
export const confirmFarmDeparture = (loadId, data) => 
  api.post(`/loads/${loadId}/confirm-farm-departure`, data);

export const getVehicles = () => 
  api.get('/config/vehicles');

export const getDrivers = () => 
  api.get('/config/drivers');

export const getChannels = () => 
  api.get('/config/channels');

// =====================================================
// REPORTS API
// =====================================================

/**
 * @param {string} siteId 
 * @param {object} params 
 */
export const getFarmStatement = (siteId, params) => 
  api.get(`/reports/farm-statement/${siteId}`, { params });

/**
 * @param {string} siteId 
 * @param {object} params 
 */
export const getDepotStatement = (siteId, params) => 
  api.get(`/reports/depot-statement/${siteId}`, { params });

/**
 * @param {object} params 
 */
export const getExceptionReports = (params) => 
  api.get('/reports/exceptions', { params });

/**
 * @param {object} params 
 */
export const getExceptionReport = (params) => 
  api.get('/reports/exceptions', { params });

/**
 * @param {object} params 
 * @returns {Promise<Blob>}
 */
export const exportLoads = async (params) => {
  const response = await api.get('/reports/export/loads', { 
    params, 
    responseType: 'blob' 
  });
  return response.data;
};

/**
 * @param {object} params 
 */
export const exportInventory = (params) => 
  api.get('/reports/export/inventory', { params });

/**
 * @param {object} params 
 */
export const exportMovements = (params) => 
  api.get('/reports/export/movements', { params });

// =====================================================
// CONFIG API
// =====================================================

export const getUsers = () => 
  api.get('/config/users');

/**
 * @param {object} userData 
 */
export const createUser = (userData) => 
  api.post('/config/users', userData);

/**
 * @param {string} userId 
 * @param {object} userData 
 */
export const updateUser = (userId, userData) => 
  api.put(`/config/users/${userId}`, userData);

export const getConfigVehicles = () => 
  api.get('/config/vehicles');

/**
 * @param {object} data 
 */
export const createVehicle = (data) => 
  api.post('/config/vehicles', data);

/**
 * @param {string} id 
 * @param {object} data 
 */
export const updateVehicle = (id, data) => 
  api.put(`/config/vehicles/${id}`, data);

export const getConfigDrivers = () => 
  api.get('/config/drivers');

/**
 * @param {object} data 
 */
export const createDriver = (data) => 
  api.post('/config/drivers', data);

/**
 * @param {string} id 
 * @param {object} data 
 */
export const updateDriver = (id, data) => 
  api.put(`/config/drivers/${id}`, data);

export const getThresholds = () => 
  api.get('/config/thresholds');

/**
 * @param {object} data 
 */
export const createThreshold = (data) => 
  api.post('/config/thresholds', data);

/**
 * @param {string} id 
 */
export const deleteThreshold = (id) => 
  api.delete(`/config/thresholds/${id}`);

export const getConfigChannels = () => 
  api.get('/config/channels');

/**
 * @param {object} data 
 */
export const createChannel = (data) => 
  api.post('/config/channels', data);

// =====================================================
// PLANNER API
// =====================================================

/**
 * @param {object} params - Filter params (startDate, endDate, originSiteId, destinationSiteId, channelId, status)
 */
export const getSchedules = (params) => 
  api.get('/planner/schedules', { params });

/**
 * @param {string} weekStart - ISO date string for start of week
 */
export const getWeekSchedules = (weekStart) => 
  api.get('/planner/schedules/week', { params: { weekStart } });

/**
 * @param {string} id - Schedule ID
 */
export const getSchedule = (id) => 
  api.get(`/planner/schedules/${id}`);

/**
 * @param {object} data - Schedule data
 */
export const createSchedule = (data) => 
  api.post('/planner/schedules', data);

/**
 * @param {string} id - Schedule ID
 * @param {object} data - Schedule data
 */
export const updateSchedule = (id, data) => 
  api.put(`/planner/schedules/${id}`, data);

/**
 * @param {string} id - Schedule ID
 */
export const deleteSchedule = (id) => 
  api.delete(`/planner/schedules/${id}`);

/**
 * @param {string} id - Schedule ID
 */
export const createLoadFromSchedule = (id) => 
  api.post(`/planner/schedules/${id}/create-load`);

/**
 * @param {object} params - Filter params (startDate, endDate, originSiteId)
 */
export const getPackagingDemand = (params) => 
  api.get('/planner/packaging-demand', { params });

export default api;
