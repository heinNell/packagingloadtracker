import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FunnelIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  TruckIcon
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useSearchParams } from 'react-router-dom';
import { getChannels, getLoads, getSites } from '../lib/api';

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

      {/* Loads Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : loads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
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
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Load #</th>
                    <th>Dispatch Date</th>
                    <th>Origin</th>
                    <th>Destination</th>
                    <th>Channel</th>
                    <th>Vehicle</th>
                    <th>Packaging</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loads.map((load) => (
                    <tr key={load.id}>
                      <td>
                        <Link 
                          to={`/loads/${load.id}`}
                          className="text-primary-600 hover:underline font-medium"
                        >
                          {load.load_number}
                        </Link>
                        {load.has_discrepancy && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700" title="Discrepancy">
                            !
                          </span>
                        )}
                        {load.has_overtime && (
                          <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700" title="Overtime">
                            ⏱
                          </span>
                        )}
                      </td>
                      <td>{format(new Date(load.dispatch_date), 'MMM d, yyyy')}</td>
                      <td>
                        <span className="font-medium">{load.origin_site_code}</span>
                        <span className="text-gray-500 text-xs ml-1">{load.origin_site_name}</span>
                      </td>
                      <td>
                        <span className="font-medium">{load.destination_site_code}</span>
                        <span className="text-gray-500 text-xs ml-1">{load.destination_site_name}</span>
                      </td>
                      <td>{load.channel_name || '-'}</td>
                      <td>
                        {load.vehicle_name || '-'}
                        {load.driver_name && (
                          <span className="text-gray-500 text-xs block">{load.driver_name}</span>
                        )}
                      </td>
                      <td>
                        {load.packaging ? (
                          <div className="text-xs space-y-0.5">
                            {load.packaging.slice(0, 2).map((pkg, idx) => (
                              <div key={idx}>
                                {pkg.quantity_dispatched}x {pkg.packaging_type_name}
                              </div>
                            ))}
                            {load.packaging.length > 2 && (
                              <div className="text-gray-500">+{load.packaging.length - 2} more</div>
                            )}
                          </div>
                        ) : '-'}
                      </td>
                      <td>
                        <LoadStatusBadge status={load.status} />
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          {(load.status === 'scheduled' || load.status === 'loading') && (
                            <Link
                              to={`/loads/${load.id}/edit`}
                              className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-gray-100 rounded"
                              title="Edit"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </Link>
                          )}
                          {load.status === 'scheduled' && (
                            <button
                              onClick={() => handleDeleteLoad(load)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Delete"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="p-4 border-t border-gray-200 flex items-center justify-between">
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
