import {
    ArrowDownTrayIcon,
    ClockIcon,
    CubeIcon,
    DocumentArrowDownIcon,
    ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { format, subDays } from 'date-fns';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
    exportLoads,
    getDepotStatement,
    getExceptionReport,
    getFarmStatement,
    getSites,
} from '../lib/api';

function Reports() {
  const [activeTab, setActiveTab] = useState('statements');
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(false);

  // Statement state
  const [selectedSite, setSelectedSite] = useState('');
  const [statementType, setStatementType] = useState('farm');
  const [dateRange, setDateRange] = useState({
    startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
  });
  const [statement, setStatement] = useState(null);

  // Exception state
  const [exceptionType, setExceptionType] = useState('lost');
  const [exceptions, setExceptions] = useState([]);

  useEffect(() => {
    loadSites();
  }, []);

  const loadSites = async () => {
    try {
      const res = await getSites({ active: true });
      setSites(res.data.sites);
    } catch (error) {
      toast.error('Failed to load sites');
    }
  };

  const loadStatement = async () => {
    if (!selectedSite) {
      toast.error('Please select a site');
      return;
    }

    setLoading(true);
    try {
      const params = {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      };

      const res = statementType === 'farm'
        ? await getFarmStatement(selectedSite, params)
        : await getDepotStatement(selectedSite, params);

      setStatement(res.data);
    } catch (error) {
      toast.error('Failed to load statement');
    } finally {
      setLoading(false);
    }
  };

  const loadExceptions = async () => {
    setLoading(true);
    try {
      const res = await getExceptionReport({
        type: exceptionType,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      setExceptions(res.data.exceptions);
    } catch (error) {
      toast.error('Failed to load exceptions');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportLoads({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        format: 'csv',
      });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `loads-${dateRange.startDate}-to-${dateRange.endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success('Export downloaded');
    } catch (error) {
      toast.error('Failed to export data');
    }
  };

  const farms = sites.filter(s => s.site_type_name === 'Farm');
  const depots = sites.filter(s => ['Depot', 'Cold Store', 'Packhouse'].includes(s.site_type_name));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500">
            Generate statements and exception reports
          </p>
        </div>
        <button onClick={handleExport} className="btn btn-secondary">
          <ArrowDownTrayIcon className="w-5 h-5 mr-2" />
          Export All Loads
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-8">
          {[
            { id: 'statements', label: 'Site Statements' },
            { id: 'exceptions', label: 'Exception Reports' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Statements Tab */}
      {activeTab === 'statements' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="card p-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label className="form-label">Statement Type</label>
                <select
                  className="form-select"
                  value={statementType}
                  onChange={(e) => {
                    setStatementType(e.target.value);
                    setSelectedSite('');
                    setStatement(null);
                  }}
                >
                  <option value="farm">Farm Statement</option>
                  <option value="depot">Depot Statement</option>
                </select>
              </div>
              <div>
                <label className="form-label">Site</label>
                <select
                  className="form-select"
                  value={selectedSite}
                  onChange={(e) => setSelectedSite(e.target.value)}
                >
                  <option value="">Select {statementType}...</option>
                  {(statementType === 'farm' ? farms : depots).map(site => (
                    <option key={site.id} value={site.id}>
                      {site.code} - {site.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Start Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label">End Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={loadStatement}
                  disabled={loading || !selectedSite}
                  className="btn btn-primary w-full"
                >
                  {loading ? 'Loading...' : 'Generate'}
                </button>
              </div>
            </div>
          </div>

          {/* Statement Results */}
          {statement && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="card p-4">
                  <div className="flex items-center gap-3">
                    <DocumentArrowDownIcon className="w-8 h-8 text-blue-500" />
                    <div>
                      <p className="text-sm text-gray-500">
                        {statementType === 'farm' ? 'Sent Out' : 'Received'}
                      </p>
                      <p className="text-xl font-bold">
                        {(statementType === 'farm' ? statement.sentOut : statement.incoming)?.length || 0}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="card p-4">
                  <div className="flex items-center gap-3">
                    <DocumentArrowDownIcon className="w-8 h-8 text-green-500" />
                    <div>
                      <p className="text-sm text-gray-500">
                        {statementType === 'farm' ? 'Returns' : 'Dispatched'}
                      </p>
                      <p className="text-xl font-bold">
                        {(statementType === 'farm' ? statement.received : statement.outgoing)?.length || 0}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="card p-4">
                  <div className="flex items-center gap-3">
                    <CubeIcon className="w-8 h-8 text-purple-500" />
                    <div>
                      <p className="text-sm text-gray-500">On Hand</p>
                      <p className="text-xl font-bold">
                        {statement.currentInventory?.reduce((sum, i) => sum + (i.on_hand || 0), 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
                {statementType === 'farm' && (
                  <div className="card p-4">
                    <div className="flex items-center gap-3">
                      <ClockIcon className="w-8 h-8 text-orange-500" />
                      <div>
                        <p className="text-sm text-gray-500">Outstanding</p>
                        <p className="text-xl font-bold">
                          {statement.outstanding?.reduce((sum, i) => sum + i.quantity, 0).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Outstanding Table (for farms) */}
              {statementType === 'farm' && statement.outstanding?.length > 0 && (
                <div className="card">
                  <div className="card-header">
                    <h3 className="font-semibold text-gray-900">Outstanding Packaging</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Location</th>
                          <th>Packaging Type</th>
                          <th className="text-right">Quantity</th>
                          <th>Oldest</th>
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

              {/* Inventory Table */}
              <div className="card">
                <div className="card-header">
                  <h3 className="font-semibold text-gray-900">Current Inventory</h3>
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
                          <td className="text-right text-red-600">
                            {item.damaged > 0 ? item.damaged : '-'}
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
      )}

      {/* Exceptions Tab */}
      {activeTab === 'exceptions' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="card p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Exception Type</label>
                <select
                  className="form-select"
                  value={exceptionType}
                  onChange={(e) => setExceptionType(e.target.value)}
                >
                  <option value="lost">Lost Packaging</option>
                  <option value="short">Short Deliveries</option>
                  <option value="aging">Aging Stock</option>
                  <option value="overdue">Overdue Returns</option>
                </select>
              </div>
              <div>
                <label className="form-label">Start Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label">End Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={loadExceptions}
                  disabled={loading}
                  className="btn btn-primary w-full"
                >
                  {loading ? 'Loading...' : 'Generate'}
                </button>
              </div>
            </div>
          </div>

          {/* Exception Results */}
          {exceptions.length > 0 ? (
            <div className="card">
              <div className="card-header flex items-center gap-2">
                <ExclamationTriangleIcon className="w-5 h-5 text-warning-500" />
                <h3 className="font-semibold text-gray-900">
                  {exceptionType.charAt(0).toUpperCase() + exceptionType.slice(1)} Exceptions
                </h3>
                <span className="text-sm text-gray-500">({exceptions.length} found)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Load #</th>
                      <th>Date</th>
                      <th>Origin</th>
                      <th>Destination</th>
                      <th>Packaging</th>
                      <th className="text-right">Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exceptions.map((exc, idx) => (
                      <tr key={idx}>
                        <td className="font-medium text-primary-600">{exc.load_number}</td>
                        <td>{format(new Date(exc.dispatch_date), 'MMM d, yyyy')}</td>
                        <td>{exc.origin_site}</td>
                        <td>{exc.destination_site}</td>
                        <td>{exc.packaging_type}</td>
                        <td className="text-right">
                          <span className="text-red-600 font-medium">
                            {exceptionType === 'short' 
                              ? `${exc.shortfall} short` 
                              : exceptionType === 'aging'
                                ? `${exc.days_old} days`
                                : exceptionType === 'overdue'
                                  ? `${exc.days_overdue} days overdue`
                                  : `${exc.quantity_lost} lost`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="card p-12 text-center">
              <ExclamationTriangleIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">
                No exceptions found. Click Generate to load data.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Reports;
