import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  TruckIcon,
  UserIcon
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useSearchParams } from 'react-router-dom';
import { deleteLoad, getChannels, getLoads, getSites } from '../lib/api';

/**
 * Load status badge
 * @param {{ status: string }} props
 */
function LoadStatusBadge({ status }) {
  const statusConfig = {
    scheduled: { label: 'Scheduled', class: 'bg-blue-100 text-blue-700' },
    loading: { label: 'Loading', class: 'bg-yellow-100 text-yellow-700' },
    departed: { label: 'Departed', class: 'bg-purple-100 text-purple-700' },
    in_transit: { label: 'In Transit', class: 'bg-indigo-100 text-indigo-700' },
    arrived_depot: { label: 'At Depot', class: 'bg-orange-100 text-orange-700' },
    completed: { label: 'Completed', class: 'bg-green-100 text-green-700' },
    cancelled: { label: 'Cancelled', class: 'bg-gray-100 text-gray-700' },
  };

  const config = statusConfig[status] || { label: status, class: 'bg-gray-100 text-gray-700' };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.class}`}>
      {config.label}
    </span>
  );
}

function Loads() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loads, setLoads] = useState([]);
  const [sites, setSites] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ total: 0, limit: 20, offset: 0 });
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    status: searchParams.get('status') || '',
    originSiteId: searchParams.get('origin') || '',
    destinationSiteId: searchParams.get('destination') || '',
    startDate: searchParams.get('startDate') || '',
    endDate: searchParams.get('endDate') || '',
    hasDiscrepancy: searchParams.get('hasDiscrepancy') || '',
    hasOvertime: searchParams.get('hasOvertime') || '',
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadLoads();
  }, [filters, pagination.offset]);

  const loadData = async () => {
    try {
      const [sitesRes, channelsRes] = await Promise.all([
        getSites({ active: true }),
        getChannels(),
      ]);
      setSites(sitesRes.data.sites);
      setChannels(channelsRes.data.channels);
    } catch (error) {
      toast.error('Failed to load data');
    }
  };

  const loadLoads = async () => {
    setLoading(true);
    try {
      const params = {
        ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v)),
        limit: pagination.limit,
        offset: pagination.offset,
      };
      const response = await getLoads(params);
      setLoads(response.data.loads);
      setPagination(prev => ({ ...prev, ...response.data.pagination }));
    } catch (error) {
      toast.error('Failed to load loads');
    } finally {
      setLoading(false);
    }
  };

  /** @param {{ id: string; load_number: string }} load */
  const handleDeleteLoad = async (load) => {
    if (!window.confirm(`Are you sure you want to delete load ${load.load_number}? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteLoad(load.id);
      toast.success('Load deleted successfully');
      loadLoads();
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to delete load');
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, offset: 0 }));
    
    // Update URL
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    setSearchParams(newParams);
  };

  const clearFilters = () => {
    setFilters({
      status: '',
      originSiteId: '',
      destinationSiteId: '',
      startDate: '',
      endDate: '',
      hasDiscrepancy: '',
      hasOvertime: '',
    });
    setSearchParams({});
  };

  const hasActiveFilters = Object.values(filters).some(v => v);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Loads</h1>
          <p className="text-sm text-gray-500">
            Manage and track all packaging loads
          </p>
        </div>
        <Link to="/loads/new" className="btn btn-primary">
          <PlusIcon className="w-5 h-5 mr-2" />
          New Load
        </Link>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="p-4 flex flex-wrap items-center gap-4">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn btn-secondary ${hasActiveFilters ? 'ring-2 ring-primary-500' : ''}`}
          >
            <FunnelIcon className="w-5 h-5 mr-2" />
            Filters
            {hasActiveFilters && (
              <span className="ml-2 w-2 h-2 bg-primary-500 rounded-full"></span>
            )}
          </button>

          {/* Quick status filters */}
          <div className="flex flex-wrap gap-2">
            {['scheduled', 'in_transit', 'completed'].map(status => (
              <button
                key={status}
                onClick={() => handleFilterChange('status', filters.status === status ? '' : status)}
                className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                  filters.status === status
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {status.replace('_', ' ')}
              </button>
            ))}
          </div>

          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-sm text-gray-500 hover:text-gray-700">
              Clear all
            </button>
          )}
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="p-4 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="scheduled">Scheduled</option>
                <option value="loading">Loading</option>
                <option value="departed">Departed</option>
                <option value="in_transit">In Transit</option>
                <option value="arrived_depot">At Depot</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="form-label">Origin</label>
              <select
                className="form-select"
                value={filters.originSiteId}
                onChange={(e) => handleFilterChange('originSiteId', e.target.value)}
              >
                <option value="">All origins</option>
                {sites.map(site => (
                  <option key={site.id} value={site.id}>{site.code} - {site.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">Destination</label>
              <select
                className="form-select"
                value={filters.destinationSiteId}
                onChange={(e) => handleFilterChange('destinationSiteId', e.target.value)}
              >
                <option value="">All destinations</option>
                {sites.map(site => (
                  <option key={site.id} value={site.id}>{site.code} - {site.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">Discrepancy</label>
              <select
                className="form-select"
                value={filters.hasDiscrepancy}
                onChange={(e) => handleFilterChange('hasDiscrepancy', e.target.value)}
              >
                <option value="">All loads</option>
                <option value="true">With discrepancy</option>
                <option value="false">No discrepancy</option>
              </select>
            </div>

            <div>
              <label className="form-label">Overtime</label>
              <select
                className="form-select"
                value={filters.hasOvertime}
                onChange={(e) => handleFilterChange('hasOvertime', e.target.value)}
              >
                <option value="">All loads</option>
                <option value="true">With overtime</option>
                <option value="false">No overtime</option>
              </select>
            </div>

            <div>
              <label className="form-label">Start Date</label>
              <input
                type="date"
                className="form-input"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
              />
            </div>

            <div>
              <label className="form-label">End Date</label>
              <input
                type="date"
                className="form-input"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Loads List */}
      <div className="space-y-4">
        {loading ? (
          <div className="card flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : loads.length === 0 ? (
          <div className="card flex flex-col items-center justify-center h-64 text-gray-500">
            <TruckIcon className="w-12 h-12 mb-4" />
            <p>No loads found</p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-2 text-primary-600 hover:underline">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Load Cards */}
            {loads.map((load) => (
              <div key={load.id} className="card hover:shadow-md transition-shadow">
                {/* Card Header */}
                <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <Link 
                      to={`/loads/${load.id}`}
                      className="text-lg font-bold text-primary-600 hover:underline"
                    >
                      {load.load_number}
                    </Link>
                    <LoadStatusBadge status={load.status} />
                    {load.has_discrepancy && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">
                        <ExclamationTriangleIcon className="w-3 h-3" />
                        Discrepancy
                      </span>
                    )}
                    {load.has_overtime && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700">
                        <ClockIcon className="w-3 h-3" />
                        Overtime
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {(load.status === 'scheduled' || load.status === 'loading') && (
                      <Link
                        to={`/loads/${load.id}/edit`}
                        className="p-2 text-gray-400 hover:text-primary-600 hover:bg-gray-100 rounded-lg"
                        title="Edit"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </Link>
                    )}
                    {load.status === 'scheduled' && (
                      <button
                        onClick={() => handleDeleteLoad(load)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        title="Delete"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                    <Link
                      to={`/loads/${load.id}`}
                      className="btn btn-secondary btn-sm"
                    >
                      View Details
                    </Link>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    
                    {/* Route Section */}
                    <div className="lg:col-span-2">
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                            <MapPinIcon className="w-3 h-3" />
                            Origin
                          </div>
                          <p className="font-semibold text-gray-900">{load.origin_site_name}</p>
                          <p className="text-xs text-gray-500">{load.origin_site_code}</p>
                        </div>
                        <div className="flex items-center gap-2 text-gray-300">
                          <div className="w-8 h-0.5 bg-gray-200"></div>
                          <TruckIcon className="w-5 h-5 text-gray-400" />
                          <ArrowRightIcon className="w-4 h-4" />
                          <div className="w-8 h-0.5 bg-gray-200"></div>
                        </div>
                        <div className="flex-1 text-right">
                          <div className="flex items-center justify-end gap-1 text-xs text-gray-500 mb-1">
                            <MapPinIcon className="w-3 h-3" />
                            Destination
                          </div>
                          <p className="font-semibold text-gray-900">{load.destination_site_name}</p>
                          <p className="text-xs text-gray-500">{load.destination_site_code}</p>
                        </div>
                      </div>
                    </div>

                    {/* Schedule Section */}
                    <div>
                      <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                        <ClockIcon className="w-3 h-3" />
                        Schedule
                      </div>
                      <p className="font-semibold text-gray-900">
                        {format(new Date(load.dispatch_date), 'MMM d, yyyy')}
                      </p>
                      {load.scheduled_departure_time && (
                        <p className="text-xs text-gray-500">Depart: {load.scheduled_departure_time}</p>
                      )}
                      {load.estimated_arrival_time && (
                        <p className="text-xs text-gray-500">ETA: {load.estimated_arrival_time}</p>
                      )}
                    </div>

                    {/* Transport Section */}
                    <div>
                      <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                        <TruckIcon className="w-3 h-3" />
                        Transport
                      </div>
                      <p className="font-semibold text-gray-900">{load.vehicle_name || '-'}</p>
                      {load.driver_name && (
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <UserIcon className="w-3 h-3" />
                          {load.driver_name}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Bottom Row - Times & Packaging */}
                  <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4">
                    
                    {/* Farm Times */}
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-orange-50 rounded-lg">
                        <ClockIcon className="w-4 h-4 text-orange-500" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-gray-500">Farm Times</p>
                        <div className="flex gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Arr: </span>
                            <span className={`font-medium ${load.actual_farm_arrival_time ? (load.farm_arrival_overtime_minutes > 0 ? 'text-red-600' : 'text-green-600') : 'text-gray-400'}`}>
                              {load.actual_farm_arrival_time 
                                ? format(new Date(load.actual_farm_arrival_time), 'HH:mm')
                                : load.expected_farm_arrival_time || '14:00'}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Dep: </span>
                            <span className={`font-medium ${load.actual_farm_departure_time ? (load.farm_departure_overtime_minutes > 0 ? 'text-red-600' : 'text-green-600') : 'text-gray-400'}`}>
                              {load.actual_farm_departure_time 
                                ? format(new Date(load.actual_farm_departure_time), 'HH:mm')
                                : load.expected_farm_departure_time || '17:00'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Depot Times */}
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-blue-50 rounded-lg">
                        <ClockIcon className="w-4 h-4 text-blue-500" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-gray-500">Depot Times</p>
                        <div className="flex gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Arr: </span>
                            <span className={`font-medium ${load.arrived_depot_time ? 'text-green-600' : 'text-gray-400'}`}>
                              {load.arrived_depot_time 
                                ? format(new Date(load.arrived_depot_time), 'HH:mm')
                                : load.estimated_arrival_time || '-'}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Dep: </span>
                            <span className={`font-medium ${load.departed_depot_time ? 'text-green-600' : 'text-gray-400'}`}>
                              {load.departed_depot_time 
                                ? format(new Date(load.departed_depot_time), 'HH:mm')
                                : load.expected_depot_departure_time || '-'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Packaging Summary */}
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-primary-50 rounded-lg">
                        <TruckIcon className="w-4 h-4 text-primary-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-gray-500">Packaging</p>
                        {load.packaging && load.packaging.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {load.packaging.slice(0, 3).map((pkg, idx) => (
                              <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                                {pkg.quantity_dispatched}x {pkg.packaging_type_code || pkg.packaging_type_name}
                              </span>
                            ))}
                            {load.packaging.length > 3 && (
                              <span className="text-xs text-gray-500">+{load.packaging.length - 3} more</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Backload Badge */}
                  {load.backload_site_name && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                        <ArrowRightIcon className="w-3 h-3 rotate-180" />
                        Backload: {load.backload_site_name}
                      </span>
                      {load.backload_packaging && load.backload_packaging.length > 0 && (
                        <span className="text-xs text-gray-500">
                          ({load.backload_packaging.reduce((sum, bp) => sum + (bp.quantity_returned || 0), 0)} items returning)
                        </span>
                      )}
                    </div>
                  )}

                  {/* Channel Badge */}
                  {load.channel_name && (
                    <div className="mt-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">
                        {load.channel_name}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Pagination */}
            <div className="card p-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing {pagination.offset + 1} to {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total} loads
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
                  disabled={pagination.offset === 0}
                  className="btn btn-secondary btn-sm"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
                  disabled={pagination.offset + pagination.limit >= pagination.total}
                  className="btn btn-secondary btn-sm"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Loads;
