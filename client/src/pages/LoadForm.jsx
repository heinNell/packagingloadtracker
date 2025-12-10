import {
    ArrowLeftIcon,
    PlusIcon,
    TrashIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import {
    createLoad,
    getChannels,
    getDrivers,
    getLoad,
    getPackagingTypes,
    getProducts,
    getSites,
    getVehicles,
    updateLoad,
} from '../lib/api';

function LoadForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sites, setSites] = useState([]);
  const [packagingTypes, setPackagingTypes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [channels, setChannels] = useState([]);
  const [products, setProducts] = useState([]);

  const { register, control, handleSubmit, reset, watch, formState: { errors } } = useForm({
    defaultValues: {
      dispatchDate: new Date().toISOString().split('T')[0],
      packaging: [{ packagingTypeId: '', quantity: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'packaging',
  });

  useEffect(() => {
    loadFormData();
  }, [id]);

  const loadFormData = async () => {
    try {
      const [sitesRes, packagingRes, vehiclesRes, driversRes, channelsRes, productsRes] = await Promise.all([
        getSites({ active: true }),
        getPackagingTypes({ active: true }),
        getVehicles(),
        getDrivers(),
        getChannels(),
        getProducts(),
      ]);

      setSites(sitesRes.data.sites);
      setPackagingTypes(packagingRes.data.packagingTypes);
      setVehicles(vehiclesRes.data.vehicles);
      setDrivers(driversRes.data.drivers);
      setChannels(channelsRes.data.channels);
      setProducts(productsRes.data.productTypes || []);

      if (isEdit) {
        const loadRes = await getLoad(id);
        const load = loadRes.data.load;
        const packaging = loadRes.data.packaging;

        reset({
          originSiteId: load.origin_site_id,
          destinationSiteId: load.destination_site_id,
          channelId: load.channel_id || '',
          dispatchDate: load.dispatch_date,
          scheduledDepartureTime: load.scheduled_departure_time || '',
          expectedArrivalDate: load.expected_arrival_date || '',
          estimatedArrivalTime: load.estimated_arrival_time || '',
          vehicleId: load.vehicle_id || '',
          driverId: load.driver_id || '',
          notes: load.notes || '',
          packaging: packaging.map(p => ({
            packagingTypeId: p.packaging_type_id,
            quantity: p.quantity_dispatched,
            productTypeId: p.product_type_id || '',
            productVarietyId: p.product_variety_id || '',
            notes: p.notes || '',
          })),
        });
      }
    } catch (error) {
      toast.error('Failed to load form data');
      navigate('/loads');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data) => {
    setSaving(true);
    try {
      if (isEdit) {
        await updateLoad(id, {
          destinationSiteId: data.destinationSiteId,
          channelId: data.channelId || null,
          dispatchDate: data.dispatchDate,
          scheduledDepartureTime: data.scheduledDepartureTime || null,
          expectedArrivalDate: data.expectedArrivalDate || null,
          estimatedArrivalTime: data.estimatedArrivalTime || null,
          vehicleId: data.vehicleId || null,
          driverId: data.driverId || null,
          notes: data.notes || null,
        });
        toast.success('Load updated successfully');
        navigate(`/loads/${id}`);
      } else {
        const response = await createLoad({
          originSiteId: data.originSiteId,
          destinationSiteId: data.destinationSiteId,
          channelId: data.channelId || null,
          dispatchDate: data.dispatchDate,
          scheduledDepartureTime: data.scheduledDepartureTime || null,
          expectedArrivalDate: data.expectedArrivalDate || null,
          estimatedArrivalTime: data.estimatedArrivalTime || null,
          vehicleId: data.vehicleId || null,
          driverId: data.driverId || null,
          notes: data.notes || null,
          packaging: data.packaging.map(p => ({
            packagingTypeId: p.packagingTypeId,
            quantity: parseInt(p.quantity),
            productTypeId: p.productTypeId || null,
            productVarietyId: p.productVarietyId || null,
            notes: p.notes || null,
          })),
        });
        toast.success(`Load created: ${response.data.loadNumber}`);
        navigate(`/loads/${response.data.load.id}`);
      }
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to save load');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const farms = sites.filter(s => s.site_type_name === 'Farm');
  const destinations = sites;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/loads')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEdit ? 'Edit Load' : 'New Load'}
          </h1>
          <p className="text-sm text-gray-500">
            {isEdit ? 'Update load details' : 'Create a new packaging load'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Route */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Route Details</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Origin *</label>
              <select
                className="form-select"
                disabled={isEdit}
                {...register('originSiteId', { required: 'Origin is required' })}
              >
                <option value="">Select origin...</option>
                {farms.map(site => (
                  <option key={site.id} value={site.id}>
                    {site.code} - {site.name}
                  </option>
                ))}
              </select>
              {errors.originSiteId && (
                <p className="mt-1 text-sm text-red-600">{errors.originSiteId.message}</p>
              )}
            </div>

            <div>
              <label className="form-label">Destination *</label>
              <select
                className="form-select"
                {...register('destinationSiteId', { required: 'Destination is required' })}
              >
                <option value="">Select destination...</option>
                {destinations.map(site => (
                  <option key={site.id} value={site.id}>
                    {site.code} - {site.name}
                  </option>
                ))}
              </select>
              {errors.destinationSiteId && (
                <p className="mt-1 text-sm text-red-600">{errors.destinationSiteId.message}</p>
              )}
            </div>

            <div>
              <label className="form-label">Channel</label>
              <select className="form-select" {...register('channelId')}>
                <option value="">Select channel...</option>
                {channels.map(channel => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Timing */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Schedule</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="form-label">Dispatch Date *</label>
              <input
                type="date"
                className="form-input"
                {...register('dispatchDate', { required: 'Dispatch date is required' })}
              />
              {errors.dispatchDate && (
                <p className="mt-1 text-sm text-red-600">{errors.dispatchDate.message}</p>
              )}
            </div>

            <div>
              <label className="form-label">Scheduled Departure Time</label>
              <input
                type="time"
                className="form-input"
                {...register('scheduledDepartureTime')}
              />
            </div>

            <div>
              <label className="form-label">Expected Arrival Date</label>
              <input
                type="date"
                className="form-input"
                {...register('expectedArrivalDate')}
              />
            </div>

            <div>
              <label className="form-label">Estimated Arrival Time</label>
              <input
                type="time"
                className="form-input"
                {...register('estimatedArrivalTime')}
              />
            </div>
          </div>
        </div>

        {/* Vehicle & Driver */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Transport</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Vehicle</label>
              <select className="form-select" {...register('vehicleId')}>
                <option value="">Select vehicle...</option>
                {vehicles.map(vehicle => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.name} ({vehicle.registration})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">Driver</label>
              <select className="form-select" {...register('driverId')}>
                <option value="">Select driver...</option>
                {drivers.map(driver => (
                  <option key={driver.id} value={driver.id}>
                    {driver.first_name} {driver.last_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Packaging */}
        {!isEdit && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Packaging</h2>
              <button
                type="button"
                onClick={() => append({ packagingTypeId: '', quantity: 1 })}
                className="btn btn-secondary btn-sm"
              >
                <PlusIcon className="w-4 h-4 mr-1" />
                Add Item
              </button>
            </div>
            
            <div className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className="flex gap-4 items-start p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="form-label">Packaging Type *</label>
                      <select
                        className="form-select"
                        {...register(`packaging.${index}.packagingTypeId`, { required: true })}
                      >
                        <option value="">Select type...</option>
                        {packagingTypes.map(pt => (
                          <option key={pt.id} value={pt.id}>
                            {pt.name} ({pt.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="form-label">Quantity *</label>
                      <input
                        type="number"
                        min="1"
                        className="form-input"
                        {...register(`packaging.${index}.quantity`, { required: true, min: 1 })}
                      />
                    </div>

                    <div>
                      <label className="form-label">Product (optional)</label>
                      <select
                        className="form-select"
                        {...register(`packaging.${index}.productTypeId`)}
                      >
                        <option value="">None</option>
                        {products.map(product => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="mt-7 p-2 text-red-500 hover:bg-red-50 rounded"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Notes</h2>
          <textarea
            className="form-input"
            rows="3"
            placeholder="Add any notes about this load..."
            {...register('notes')}
          ></textarea>
        </div>

        {/* Actions */}
        <div className="flex gap-4 justify-end">
          <button type="button" onClick={() => navigate('/loads')} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? 'Saving...' : isEdit ? 'Update Load' : 'Create Load'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default LoadForm;
