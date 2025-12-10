import {
    ArrowTrendingDownIcon,
    ArrowTrendingUpIcon,
    BuildingOfficeIcon,
    CheckCircleIcon,
    ClockIcon,
    CubeIcon,
    ExclamationTriangleIcon,
    TruckIcon,
} from '@heroicons/react/24/outline';
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, LineElement, PointElement, Title, Tooltip } from 'chart.js';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import { Doughnut } from 'react-chartjs-2';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { acknowledgeAlert, getDashboardSummary } from '../lib/api';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, LineElement, PointElement);

/**
 * Status badge component
 * @param {{ status: string, className?: string }} props
 */
function StatusBadge({ status, className = '' }) {
  const statusClasses = {
    normal: 'status-normal',
    warning: 'status-warning',
    critical: 'status-critical',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClasses[status] || 'bg-gray-100 text-gray-800'} ${className}`}>
      {status}
    </span>
  );
}

/**
 * Stat card component
 * @param {{ title: string, value: string | number, icon: any, trend?: string, trendUp?: boolean, color?: string }} props
 */
function StatCard({ title, value, icon: Icon, trend, trendUp, color = 'primary' }) {
  const colorClasses = {
    primary: 'bg-primary-100 text-primary-600',
    blue: 'bg-blue-100 text-blue-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    red: 'bg-red-100 text-red-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
  };

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-1 text-3xl font-semibold text-gray-900">{value}</p>
          {trend && (
            <div className="mt-2 flex items-center text-sm">
              {trendUp ? (
                <ArrowTrendingUpIcon className="w-4 h-4 text-green-500 mr-1" />
              ) : (
                <ArrowTrendingDownIcon className="w-4 h-4 text-red-500 mr-1" />
              )}
              <span className={trendUp ? 'text-green-600' : 'text-red-600'}>{trend}</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-xl ${colorClasses[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const response = await getDashboardSummary();
      setData(response.data);
    } catch (error) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledgeAlert = async (alertId) => {
    try {
      await acknowledgeAlert(alertId);
      toast.success('Alert acknowledged');
      loadDashboardData();
    } catch (error) {
      toast.error('Failed to acknowledge alert');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const todaySummary = data?.todaySummary || {};
  const inTransit = data?.inTransit || [];
  const siteBalances = data?.siteBalances || [];
  const alerts = data?.alerts || [];
  const discrepancies = data?.recentDiscrepancies || [];
  const lowStock = data?.lowStock || [];

  // Prepare chart data
  const inTransitChartData = {
    labels: inTransit.map(item => item.packaging_type_name),
    datasets: [{
      data: inTransit.map(item => parseInt(item.total_quantity)),
      backgroundColor: [
        'rgba(34, 197, 94, 0.8)',
        'rgba(59, 130, 246, 0.8)',
        'rgba(249, 115, 22, 0.8)',
        'rgba(139, 92, 246, 0.8)',
      ],
      borderWidth: 0,
    }]
  };

  // Group site balances by type
  const farms = siteBalances.filter(s => s.site_type === 'Farm');
  const depots = siteBalances.filter(s => s.site_type === 'Depot');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <Link to="/loads/new" className="btn btn-primary">
          <TruckIcon className="w-5 h-5 mr-2" />
          New Load
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Dispatched Today"
          value={todaySummary.dispatched_today || 0}
          icon={TruckIcon}
          color="blue"
        />
        <StatCard
          title="Received Today"
          value={todaySummary.received_today || 0}
          icon={CheckCircleIcon}
          color="green"
        />
        <StatCard
          title="In Transit"
          value={todaySummary.currently_in_transit || 0}
          icon={ClockIcon}
          color="purple"
        />
        <StatCard
          title="Pending Dispatch"
          value={todaySummary.pending_dispatch || 0}
          icon={CubeIcon}
          color="yellow"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Packaging In Transit */}
        <div className="card lg:col-span-1">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900">Packaging In Transit</h2>
          </div>
          <div className="card-body">
            {inTransit.length > 0 ? (
              <div className="space-y-4">
                <div className="h-48">
                  <Doughnut
                    data={inTransitChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: 'bottom',
                        },
                      },
                    }}
                  />
                </div>
                <div className="divide-y divide-gray-100">
                  {inTransit.map((item) => (
                    <div key={item.packaging_type_id} className="py-2 flex items-center justify-between">
                      <span className="text-sm text-gray-600">{item.packaging_type_name}</span>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-gray-900">{parseInt(item.total_quantity).toLocaleString()}</span>
                        <span className="text-xs text-gray-500 ml-1">({item.load_count} loads)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">No packaging in transit</p>
            )}
          </div>
        </div>

        {/* Alerts & Low Stock */}
        <div className="card lg:col-span-2">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Alerts & Warnings
              {alerts.length > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                  {alerts.length}
                </span>
              )}
            </h2>
          </div>
          <div className="card-body">
            {alerts.length > 0 || lowStock.length > 0 ? (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-lg border ${
                      alert.severity === 'critical' ? 'bg-red-50 border-red-200' :
                      alert.severity === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                      'bg-blue-50 border-blue-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <ExclamationTriangleIcon className={`w-5 h-5 flex-shrink-0 ${
                          alert.severity === 'critical' ? 'text-red-500' :
                          alert.severity === 'warning' ? 'text-yellow-500' :
                          'text-blue-500'
                        }`} />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{alert.message}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {alert.site_name && `${alert.site_name} • `}
                            {format(new Date(alert.created_at), 'MMM d, HH:mm')}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleAcknowledgeAlert(alert.id)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
                
                {lowStock.map((item, index) => (
                  <div
                    key={`low-${index}`}
                    className="p-3 rounded-lg bg-yellow-50 border border-yellow-200"
                  >
                    <div className="flex items-start gap-2">
                      <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          Low stock: {item.packaging_type_name}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {item.site_name}: {item.current_quantity} remaining (min: {item.min_threshold})
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircleIcon className="w-12 h-12 text-green-500 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No active alerts</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Site Balances */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Farms */}
        <div className="card">
          <div className="card-header flex items-center gap-2">
            <BuildingOfficeIcon className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">Farm Balances</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Farm</th>
                  <th>Packaging</th>
                  <th className="text-right">Qty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {farms.slice(0, 5).flatMap((site) =>
                  (site.packaging || []).filter(p => p.quantity > 0).slice(0, 3).map((pkg, idx) => (
                    <tr key={`${site.site_id}-${pkg.packaging_type_id}`}>
                      {idx === 0 && (
                        <td rowSpan={Math.min(3, site.packaging.filter(p => p.quantity > 0).length)} className="font-medium">
                          <Link to={`/sites/${site.site_id}`} className="text-primary-600 hover:underline">
                            {site.site_code}
                          </Link>
                        </td>
                      )}
                      <td>{pkg.packaging_type_name}</td>
                      <td className="text-right font-medium">{pkg.quantity.toLocaleString()}</td>
                      <td>
                        <StatusBadge status={pkg.status} />
                      </td>
                    </tr>
                  ))
                )}
                {farms.length === 0 && (
                  <tr>
                    <td colSpan="4" className="text-center text-gray-500">No farm data</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-gray-200">
            <Link to="/sites?type=Farm" className="text-sm text-primary-600 hover:underline">
              View all farms →
            </Link>
          </div>
        </div>

        {/* Depots */}
        <div className="card">
          <div className="card-header flex items-center gap-2">
            <BuildingOfficeIcon className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Depot Balances</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Depot</th>
                  <th>Packaging</th>
                  <th className="text-right">Qty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {depots.slice(0, 5).flatMap((site) =>
                  (site.packaging || []).filter(p => p.quantity > 0).slice(0, 3).map((pkg, idx) => (
                    <tr key={`${site.site_id}-${pkg.packaging_type_id}`}>
                      {idx === 0 && (
                        <td rowSpan={Math.min(3, site.packaging.filter(p => p.quantity > 0).length)} className="font-medium">
                          <Link to={`/sites/${site.site_id}`} className="text-primary-600 hover:underline">
                            {site.site_code}
                          </Link>
                        </td>
                      )}
                      <td>{pkg.packaging_type_name}</td>
                      <td className="text-right font-medium">{pkg.quantity.toLocaleString()}</td>
                      <td>
                        <StatusBadge status={pkg.status} />
                      </td>
                    </tr>
                  ))
                )}
                {depots.length === 0 && (
                  <tr>
                    <td colSpan="4" className="text-center text-gray-500">No depot data</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-gray-200">
            <Link to="/sites?type=Depot" className="text-sm text-primary-600 hover:underline">
              View all depots →
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Discrepancies */}
      {discrepancies.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900">Recent Discrepancies</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Load #</th>
                  <th>Date</th>
                  <th>Route</th>
                  <th>Issues</th>
                </tr>
              </thead>
              <tbody>
                {discrepancies.slice(0, 5).map((disc) => (
                  <tr key={disc.id}>
                    <td>
                      <Link to={`/loads/${disc.id}`} className="text-primary-600 hover:underline font-medium">
                        {disc.load_number}
                      </Link>
                    </td>
                    <td>{format(new Date(disc.dispatch_date), 'MMM d, yyyy')}</td>
                    <td>{disc.origin_site} → {disc.destination_site}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {disc.items?.map((item, idx) => (
                          <span key={idx} className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">
                            {item.packaging_type}: {item.dispatched - item.received} missing
                            {item.damaged > 0 && `, ${item.damaged} damaged`}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-gray-200">
            <Link to="/reports?type=exceptions" className="text-sm text-primary-600 hover:underline">
              View all discrepancies →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
