import {
  ArrowDownIcon,
  ArrowsRightLeftIcon,
  ArrowUpIcon,
  CubeIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { createPackagingType, deletePackagingType, getPackagingMovements, getPackagingTypes, updatePackagingType } from '../lib/api';

function Packaging() {
  const [packagingTypes, setPackagingTypes] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('types');
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [typesRes, movementsRes] = await Promise.all([
        getPackagingTypes({ active: true }),
        getPackagingMovements({ limit: 50 }),
      ]);
      setPackagingTypes(typesRes.data.packagingTypes || []);
      setMovements(movementsRes.data.movements || []);
    } catch (error) {
      toast.error('Failed to load packaging data');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (type = null) => {
    setEditingType(type);
    if (type) {
      reset({
        code: type.code,
        name: type.name,
        description: type.description || '',
        capacityKg: type.capacity_kg || '',
        expectedTurnaroundDays: type.expected_turnaround_days || 14,
        isReturnable: type.is_returnable,
        isActive: type.is_active,
      });
    } else {
      reset({
        code: '',
        name: '',
        description: '',
        capacityKg: '',
        expectedTurnaroundDays: 14,
        isReturnable: true,
        isActive: true,
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingType(null);
    reset();
  };

  const onSubmit = async (data) => {
    setSaving(true);
    try {
      if (editingType) {
        await updatePackagingType(editingType.id, data);
        toast.success('Packaging type updated');
      } else {
        await createPackagingType(data);
        toast.success('Packaging type created');
      }
      closeModal();
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (type) => {
    if (!window.confirm(`Are you sure you want to delete "${type.name}"? This cannot be undone.`)) {
      return;
    }
    try {
      await deletePackagingType(type.id);
      // Remove from local state immediately so it disappears
      setPackagingTypes(prev => prev.filter(t => t.id !== type.id));
      toast.success('Packaging type deleted');
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to delete');
    }
  };

  /**
   * Movement type icon
   * @param {{ type: string }} props
   */
  const MovementIcon = ({ type }) => {
    switch (type) {
      case 'in':
        return <ArrowDownIcon className="w-4 h-4 text-green-500" />;
      case 'out':
        return <ArrowUpIcon className="w-4 h-4 text-red-500" />;
      case 'transfer':
        return <ArrowsRightLeftIcon className="w-4 h-4 text-blue-500" />;
      default:
        return <CubeIcon className="w-4 h-4 text-gray-500" />;
    }
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Packaging</h1>
          <p className="text-sm text-gray-500">
            Manage packaging types and track movements
          </p>
        </div>
        <button onClick={() => openModal()} className="btn btn-primary">
          <PlusIcon className="w-5 h-5 mr-2" />
          Add Type
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-8">
          {['types', 'movements'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'types' ? 'Packaging Types' : 'Recent Movements'}
            </button>
          ))}
        </nav>
      </div>

      {/* Packaging Types */}
      {activeTab === 'types' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {packagingTypes.map(type => (
            <div key={type.id} className="card p-5 relative group">
              <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => openModal(type)}
                  className="p-2 hover:bg-gray-100 rounded"
                  title="Edit"
                >
                  <PencilIcon className="w-4 h-4 text-gray-500" />
                </button>
                <button
                  onClick={() => handleDelete(type)}
                  className="p-2 hover:bg-red-50 rounded"
                  title="Delete"
                >
                  <TrashIcon className="w-4 h-4 text-red-500" />
                </button>
              </div>
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-primary-100 rounded-lg">
                  <CubeIcon className="w-6 h-6 text-primary-600" />
                </div>
                <span className={`px-2 py-1 text-xs rounded ${
                  type.is_active 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {type.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              
              <h3 className="font-semibold text-gray-900">{type.name}</h3>
              <p className="text-primary-600 font-medium text-sm mb-2">{type.code}</p>
              
              {type.description && (
                <p className="text-sm text-gray-500 mb-4">{type.description}</p>
              )}

              <div className="pt-4 border-t border-gray-100">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Capacity:</span>
                    <span className="ml-2 font-medium">{type.capacity || '-'} kg</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Returnable:</span>
                    <span className="ml-2 font-medium">{type.is_returnable ? 'Yes' : 'No'}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Movements */}
      {activeTab === 'movements' && (
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900">Recent Movements</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Packaging</th>
                  <th>Site</th>
                  <th className="text-right">Quantity</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center text-gray-500 py-8">
                      No movements found
                    </td>
                  </tr>
                ) : (
                  movements.map((movement) => (
                    <tr key={movement.id}>
                      <td>{format(new Date(movement.created_at), 'MMM d, yyyy HH:mm')}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <MovementIcon type={movement.movement_type} />
                          <span className="capitalize">{movement.movement_type}</span>
                        </div>
                      </td>
                      <td>
                        <span className="font-medium">{movement.packaging_type_name}</span>
                      </td>
                      <td>{movement.site_name}</td>
                      <td className="text-right font-medium">
                        <span className={
                          movement.movement_type === 'in' 
                            ? 'text-green-600' 
                            : movement.movement_type === 'out' 
                              ? 'text-red-600' 
                              : ''
                        }>
                          {movement.movement_type === 'in' ? '+' : '-'}
                          {movement.quantity}
                        </span>
                      </td>
                      <td className="text-gray-500">{movement.reference_number || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">
                {editingType ? 'Edit Packaging Type' : 'Add Packaging Type'}
              </h3>
              <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Code *</label>
                  <input
                    {...register('code', { required: 'Code is required' })}
                    className="form-input"
                    placeholder="e.g. BIN-500"
                  />
                  {errors.code && <p className="text-red-500 text-xs mt-1">{errors.code.message}</p>}
                </div>
                <div>
                  <label className="form-label">Name *</label>
                  <input
                    {...register('name', { required: 'Name is required' })}
                    className="form-input"
                    placeholder="e.g. 500kg Bin"
                  />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                </div>
              </div>

              <div>
                <label className="form-label">Description</label>
                <textarea
                  {...register('description')}
                  className="form-textarea"
                  rows="2"
                  placeholder="Optional description"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Capacity (kg)</label>
                  <input
                    type="number"
                    {...register('capacityKg')}
                    className="form-input"
                    placeholder="e.g. 500"
                  />
                </div>
                <div>
                  <label className="form-label">Turnaround Days</label>
                  <input
                    type="number"
                    {...register('expectedTurnaroundDays')}
                    className="form-input"
                    placeholder="e.g. 14"
                  />
                </div>
              </div>

              <div className="flex gap-6">
                <label className="flex items-center gap-2">
                  <input type="checkbox" {...register('isReturnable')} className="rounded" />
                  <span className="text-sm">Returnable</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" {...register('isActive')} className="rounded" />
                  <span className="text-sm">Active</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={closeModal} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? 'Saving...' : editingType ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Packaging;
