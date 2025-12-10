import {
    ArrowDownTrayIcon,
    ArrowLeftIcon,
    BuildingOfficeIcon,
    CubeIcon,
    EnvelopeIcon,
    MapPinIcon,
    PhoneIcon,
    TruckIcon,
} from '@heroicons/react/24/outline';
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Title, Tooltip } from 'chart.js';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getDepotStatement, getFarmStatement, getLoads, getSite, getSiteInventory } from '../lib/api';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

/**
 * Status badge
 * @param {{ status: string }} props
 */
function StatusBadge({ status }) {
  const statusClasses = {
    normal: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    critical: 'bg-red-100 text-red-700',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusClasses[status] || 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  );
}

function SiteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [site, setSite] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [recentLoads, setRecentLoads] = useState([]);
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('inventory');

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [siteRes, inventoryRes, loadsRes] = await Promise.all([
        getSite(id),
        getSiteInventory(id),
        getLoads({ originSiteId: id, limit: 5 }),
      ]);

      setSite(siteRes.data.site);
      setInventory(inventoryRes.data.inventory);
      setRecentLoads(loadsRes.data.loads);

      // Load statement based on site type
      const siteData = siteRes.data.site;
      if (siteData.site_type_name === 'Farm') {
        const stmtRes = await getFarmStatement(id, {});
        setStatement(stmtRes.data);
      } else {
        const stmtRes = await getDepotStatement(id, {});
        setStatement(stmtRes.data);
      }
    } catch (error) {
      toast.error('Failed to load site details');
      navigate('/sites');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!site) {
    return null;
  }

  const isFarm = site.site_type_name === 'Farm';

  // Chart data for inventory
  const inventoryChartData = {
    labels: inventory.slice(0, 6).map(i => i.packaging_type_code),
    datasets: [{
      label: 'Quantity',
      data: inventory.slice(0, 6).map(i => i.quantity),
      backgroundColor: 'rgba(34, 197, 94, 0.7)',
      borderRadius: 4,
    }]
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/sites')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{site.name}</h1>
            <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
              {site.site_type_name}
            </span>
          </div>
          <p className="text-primary-600 font-medium">{site.code}</p>
        </div>
      </div>

      {/* Site Info */}
      <div className="card p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {(site.city || site.region) && (
            <div className="flex items-start gap-3">
              <MapPinIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500">Location</p>
                <p className="font-medium">{[site.city, site.region].filter(Boolean).join(', ')}</p>
                {site.country && <p className="text-sm text-gray-500">{site.country}</p>}
              </div>
            </div>
          )}

          {site.contact_name && (
            <div className="flex items-start gap-3">
              <BuildingOfficeIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500">Contact</p>
                <p className="font-medium">{site.contact_name}</p>
              </div>
            </div>
          )}

          {site.contact_phone && (
            <div className="flex items-start gap-3">
              <PhoneIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500">Phone</p>
                <p className="font-medium">{site.contact_phone}</p>
              </div>
            </div>
          )}

          {site.contact_email && (
            <div className="flex items-start gap-3">
              <EnvelopeIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="font-medium">{site.contact_email}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-8">
          {['inventory', 'loads', 'statement'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {/* Inventory Tab */}
      {activeTab === 'inventory' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card">
            <div className="card-header">
              <h2 className="text-lg font-semibold text-gray-900">Packaging Inventory</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Packaging Type</th>
                    <th className="text-right">Quantity</th>
                    <th className="text-right">Damaged</th>
                    <th className="text-right">Threshold</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-center text-gray-500 py-8">
                        No inventory data
                      </td>
                    </tr>
                  ) : (
                    inventory.map((item) => {
                      const status = item.min_threshold && item.quantity <= item.min_threshold 
                        ? 'critical' 
                        : item.min_threshold && item.quantity <= item.min_threshold * 1.2 
                          ? 'warning' 
                          : 'normal';
                      return (
                        <tr key={item.id}>
                          <td>
                            <div className="font-medium">{item.packaging_type_name}</div>
                            <div className="text-sm text-gray-500">{item.packaging_type_code}</div>
                          </td>
                          <td className="text-right font-medium">{item.quantity.toLocaleString()}</td>
                          <td className="text-right">
                            {item.quantity_damaged > 0 ? (
                              <span className="text-red-600">{item.quantity_damaged}</span>
                            ) : '-'}
                          </td>
                          <td className="text-right text-gray-500">
                            {item.min_threshold || '-'}
                          </td>
                          <td>
                            <StatusBadge status={status} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-4">Inventory Overview</h3>
            {inventory.length > 0 ? (
              <Bar
                data={inventoryChartData}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { display: false },
                  },
                  scales: {
                    y: { beginAtZero: true },
                  },
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-48 text-gray-500">
                No data
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loads Tab */}
      {activeTab === 'loads' && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Loads</h2>
            <Link 
              to={`/loads?origin=${id}`}
              className="text-sm text-primary-600 hover:underline"
            >
              View all loads
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Load #</th>
                  <th>Date</th>
                  <th>Destination</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentLoads.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center text-gray-500 py-8">
                      No loads found
                    </td>
                  </tr>
                ) : (
                  recentLoads.map((load) => (
                    <tr key={load.id}>
                      <td>
                        <Link 
                          to={`/loads/${load.id}`}
                          className="text-primary-600 hover:underline font-medium"
                        >
                          {load.load_number}
                        </Link>
                      </td>
                      <td>{format(new Date(load.dispatch_date), 'MMM d, yyyy')}</td>
                      <td>{load.destination_site_name}</td>
                      <td>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium load-${load.status}`}>
                          {load.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Statement Tab */}
      {activeTab === 'statement' && statement && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-5">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <TruckIcon className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{isFarm ? 'Sent Out' : 'Incoming'}</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {(isFarm ? statement.sentOut : statement.incoming)?.length || 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg">
                  <CubeIcon className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{isFarm ? 'Received' : 'Outgoing'}</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {(isFarm ? statement.received : statement.outgoing)?.length || 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <CubeIcon className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Current Inventory</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {statement.currentInventory?.reduce((sum, i) => sum + (i.on_hand || 0), 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Outstanding (for farms) */}
          {isFarm && statement.outstanding?.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2 className="text-lg font-semibold text-gray-900">Outstanding Packaging</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Location</th>
                      <th>Packaging Type</th>
                      <th className="text-right">Quantity</th>
                      <th>Oldest Dispatch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.outstanding.map((item, idx) => (
                      <tr key={idx}>
                        <td className="font-medium">{item.location}</td>
                        <td>{item.packaging_type}</td>
                        <td className="text-right">{item.quantity}</td>
                        <td>{format(new Date(item.oldest_dispatch), 'MMM d, yyyy')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Current Inventory */}
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Current Inventory</h2>
              <button className="btn btn-secondary btn-sm">
                <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                Export
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Packaging Type</th>
                    <th className="text-right">On Hand</th>
                    <th className="text-right">Damaged</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.currentInventory?.map((item, idx) => (
                    <tr key={idx}>
                      <td className="font-medium">{item.packaging_type}</td>
                      <td className="text-right">{item.on_hand.toLocaleString()}</td>
                      <td className="text-right">
                        {item.damaged > 0 ? (
                          <span className="text-red-600">{item.damaged}</span>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SiteDetail;
