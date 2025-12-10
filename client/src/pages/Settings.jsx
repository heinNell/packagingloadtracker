import {
    IdentificationIcon,
    PlusIcon,
    TruckIcon,
    UserGroupIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
    createDriver,
    createUser,
    createVehicle,
    getDrivers,
    getUsers,
    getVehicles,
} from '../lib/api';

function Settings() {
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRes, vehiclesRes, driversRes] = await Promise.all([
        getUsers(),
        getVehicles(),
        getDrivers(),
      ]);
      setUsers(usersRes.data.users);
      setVehicles(vehiclesRes.data.vehicles);
      setDrivers(driversRes.data.drivers);
    } catch (error) {
      toast.error('Failed to load settings data');
    } finally {
      setLoading(false);
    }
  };

  const openModal = () => {
    setFormData({});
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (activeTab === 'users') {
        await createUser(formData);
        toast.success('User created successfully');
      } else if (activeTab === 'vehicles') {
        await createVehicle(formData);
        toast.success('Vehicle created successfully');
      } else if (activeTab === 'drivers') {
        await createDriver(formData);
        toast.success('Driver created successfully');
      }
      setShowModal(false);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const roleLabels = {
    admin: 'Administrator',
    dispatcher: 'Dispatcher',
    farm_user: 'Farm User',
    depot_user: 'Depot User',
    readonly: 'Read Only',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">
          Manage users, vehicles, and drivers
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-8">
          {[
            { id: 'users', label: 'Users', icon: UserGroupIcon },
            { id: 'vehicles', label: 'Vehicles', icon: TruckIcon },
            { id: 'drivers', label: 'Drivers', icon: IdentificationIcon },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Users</h2>
            <button onClick={openModal} className="btn btn-primary btn-sm">
              <PlusIcon className="w-4 h-4 mr-1" />
              Add User
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Site</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td className="font-medium">{user.first_name} {user.last_name}</td>
                    <td>{user.email}</td>
                    <td>
                      <span className="px-2 py-1 text-xs bg-primary-100 text-primary-700 rounded">
                        {roleLabels[user.role] || user.role}
                      </span>
                    </td>
                    <td>{user.site_name || '-'}</td>
                    <td>
                      <span className={`px-2 py-1 text-xs rounded ${
                        user.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Vehicles Tab */}
      {activeTab === 'vehicles' && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Vehicles</h2>
            <button onClick={openModal} className="btn btn-primary btn-sm">
              <PlusIcon className="w-4 h-4 mr-1" />
              Add Vehicle
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Registration</th>
                  <th>Type</th>
                  <th>Capacity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map(vehicle => (
                  <tr key={vehicle.id}>
                    <td className="font-medium">{vehicle.name}</td>
                    <td>{vehicle.registration}</td>
                    <td>{vehicle.vehicle_type || '-'}</td>
                    <td>{vehicle.capacity ? `${vehicle.capacity} pallets` : '-'}</td>
                    <td>
                      <span className={`px-2 py-1 text-xs rounded ${
                        vehicle.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {vehicle.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drivers Tab */}
      {activeTab === 'drivers' && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Drivers</h2>
            <button onClick={openModal} className="btn btn-primary btn-sm">
              <PlusIcon className="w-4 h-4 mr-1" />
              Add Driver
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Employee ID</th>
                  <th>Phone</th>
                  <th>License</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map(driver => (
                  <tr key={driver.id}>
                    <td className="font-medium">{driver.first_name} {driver.last_name}</td>
                    <td>{driver.employee_id || '-'}</td>
                    <td>{driver.phone || '-'}</td>
                    <td>{driver.license_number || '-'}</td>
                    <td>
                      <span className={`px-2 py-1 text-xs rounded ${
                        driver.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {driver.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">
                Add {activeTab === 'users' ? 'User' : activeTab === 'vehicles' ? 'Vehicle' : 'Driver'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {activeTab === 'users' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="form-label">First Name *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={formData.firstName || ''}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="form-label">Last Name *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={formData.lastName || ''}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Email *</label>
                    <input
                      type="email"
                      className="form-input"
                      value={formData.email || ''}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="form-label">Password *</label>
                    <input
                      type="password"
                      className="form-input"
                      value={formData.password || ''}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="form-label">Role *</label>
                    <select
                      className="form-select"
                      value={formData.role || ''}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    >
                      <option value="">Select role...</option>
                      {Object.entries(roleLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {activeTab === 'vehicles' && (
                <>
                  <div>
                    <label className="form-label">Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g., Truck 23H"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="form-label">Registration *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g., ABC 1234"
                      value={formData.registration || ''}
                      onChange={(e) => setFormData({ ...formData, registration: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="form-label">Type</label>
                    <select
                      className="form-select"
                      value={formData.vehicleType || ''}
                      onChange={(e) => setFormData({ ...formData, vehicleType: e.target.value })}
                    >
                      <option value="">Select type...</option>
                      <option value="truck">Truck</option>
                      <option value="rigid">Rigid</option>
                      <option value="trailer">Trailer</option>
                      <option value="van">Van</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Capacity (pallets)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={formData.capacity || ''}
                      onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                    />
                  </div>
                </>
              )}

              {activeTab === 'drivers' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="form-label">First Name *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={formData.firstName || ''}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="form-label">Last Name *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={formData.lastName || ''}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Employee ID</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.employeeId || ''}
                      onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="form-label">Phone</label>
                    <input
                      type="tel"
                      className="form-input"
                      value={formData.phone || ''}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="form-label">License Number</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.licenseNumber || ''}
                      onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 p-4 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowModal(false)}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn btn-primary flex-1"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
