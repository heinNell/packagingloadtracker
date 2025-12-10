import {
    BuildingOfficeIcon,
    MapPinIcon,
    PhoneIcon,
    PlusIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useSearchParams } from 'react-router-dom';
import { getSites, getSiteTypes } from '../lib/api';

function Sites() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sites, setSites] = useState([]);
  const [siteTypes, setSiteTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState(searchParams.get('type') || '');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadData();
  }, [selectedType]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sitesRes, typesRes] = await Promise.all([
        getSites({ type: selectedType || undefined, active: true }),
        getSiteTypes(),
      ]);
      setSites(sitesRes.data.sites);
      setSiteTypes(typesRes.data.siteTypes);
    } catch (error) {
      toast.error('Failed to load sites');
    } finally {
      setLoading(false);
    }
  };

  const handleTypeChange = (type) => {
    setSelectedType(type);
    if (type) {
      setSearchParams({ type });
    } else {
      setSearchParams({});
    }
  };

  const filteredSites = sites.filter(site =>
    site.name.toLowerCase().includes(search.toLowerCase()) ||
    site.code.toLowerCase().includes(search.toLowerCase())
  );

  // Group sites by type
  const groupedSites = filteredSites.reduce((acc, site) => {
    const type = site.site_type_name;
    if (!acc[type]) acc[type] = [];
    acc[type].push(site);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sites</h1>
          <p className="text-sm text-gray-500">
            Manage farms, depots, and other locations
          </p>
        </div>
        <button className="btn btn-primary">
          <PlusIcon className="w-5 h-5 mr-2" />
          Add Site
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              className="form-input"
              placeholder="Search sites..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleTypeChange('')}
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                !selectedType
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            {siteTypes.map(type => (
              <button
                key={type.id}
                onClick={() => handleTypeChange(type.name)}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                  selectedType === type.name
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {type.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sites */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : filteredSites.length === 0 ? (
        <div className="card p-12 text-center">
          <BuildingOfficeIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No sites found</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedSites).map(([type, typeSites]) => (
            <div key={type}>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <BuildingOfficeIcon className="w-5 h-5 text-gray-500" />
                {type}s
                <span className="text-sm font-normal text-gray-500">({typeSites.length})</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {typeSites.map(site => (
                  <Link
                    key={site.id}
                    to={`/sites/${site.id}`}
                    className="card p-5 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-900">{site.name}</h3>
                        <p className="text-sm text-primary-600 font-medium">{site.code}</p>
                      </div>
                      <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                        {site.site_type_name}
                      </span>
                    </div>
                    
                    {(site.city || site.region) && (
                      <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                        <MapPinIcon className="w-4 h-4" />
                        <span>{[site.city, site.region].filter(Boolean).join(', ')}</span>
                      </div>
                    )}
                    
                    {site.contact_phone && (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <PhoneIcon className="w-4 h-4" />
                        <span>{site.contact_phone}</span>
                      </div>
                    )}

                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-500">
                        {site.load_count || 0} loads
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Sites;
