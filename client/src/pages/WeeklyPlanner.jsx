import {
    ArrowPathIcon,
    CalendarIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    PlusIcon,
    TrashIcon,
    TruckIcon,
    XMarkIcon
} from '@heroicons/react/24/outline';
import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import {
    createLoadFromSchedule,
    createSchedule,
    deleteSchedule,
    getChannels,
    getDrivers,
    getPackagingDemand,
    getSites,
    getVehicles,
    getWeekSchedules,
    updateSchedule
} from '../lib/api';

/**
 * Schedule status badge
 * @param {{ status: string }} props
 */
function StatusBadge({ status }) {
  /** @type {Record<string, { label: string; class: string }>} */
  const statusConfig = {
    planned: { label: 'Planned', class: 'bg-blue-100 text-blue-700' },
    confirmed: { label: 'Confirmed', class: 'bg-green-100 text-green-700' },
    cancelled: { label: 'Cancelled', class: 'bg-red-100 text-red-700' },
    completed: { label: 'Completed', class: 'bg-gray-100 text-gray-700' },
  };

  const config = statusConfig[status] || { label: status, class: 'bg-gray-100 text-gray-700' };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config.class}`}>
      {config.label}
    </span>
  );
}

/**
 * Schedule card for calendar display
 * @param {{ schedule: object; onEdit: (s: object) => void; onCreateLoad: (s: object) => void }} props
 */
function ScheduleCard({ schedule, onEdit, onCreateLoad }) {
  return (
    <div 
      className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onEdit(schedule)}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-semibold text-gray-900">
            {schedule.dispatch_time || '--:--'}
          </span>
          <StatusBadge status={schedule.status} />
        </div>
        {schedule.load_number && (
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
            {schedule.load_number}
          </span>
        )}
      </div>
      
      <div className="text-sm text-gray-600 mb-1">
        <span className="font-medium">{schedule.origin_code || 'Origin'}</span>
        <span className="mx-1">→</span>
        <span className="font-medium">{schedule.destination_code || 'Dest'}</span>
      </div>
      
      {schedule.channel_code && (
        <div className="text-xs text-gray-500 mb-1">
          Channel: {schedule.channel_code}
        </div>
      )}

      <div className="text-xs text-gray-500 flex flex-wrap gap-2 mt-2">
        {schedule.crates_count > 0 && <span>Crates: {schedule.crates_count}</span>}
        {schedule.bins_count > 0 && <span>Bins: {schedule.bins_count}</span>}
        {schedule.boxes_count > 0 && <span>Boxes: {schedule.boxes_count}</span>}
        {schedule.pallets_count > 0 && <span>Pallets: {schedule.pallets_count}</span>}
      </div>

      {!schedule.load_id && schedule.status === 'planned' && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCreateLoad(schedule);
          }}
          className="mt-2 w-full text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-2 py-1 rounded flex items-center justify-center"
        >
          <TruckIcon className="h-3 w-3 mr-1" />
          Create Load
        </button>
      )}
    </div>
  );
}

/**
 * Day column in weekly view
 * @param {{ day: object; onEdit: (s: object) => void; onCreateLoad: (s: object) => void; onAddNew: (date: string) => void }} props
 */
function DayColumn({ day, onEdit, onCreateLoad, onAddNew }) {
  const isToday = day.date === format(new Date(), 'yyyy-MM-dd');
  
  return (
    <div className={`flex-1 min-w-0 border-r border-gray-200 last:border-r-0 ${isToday ? 'bg-blue-50' : 'bg-gray-50'}`}>
      <div className={`sticky top-0 p-2 text-center border-b ${isToday ? 'bg-blue-100' : 'bg-gray-100'}`}>
        <div className="text-xs text-gray-500 uppercase">{day.dayName}</div>
        <div className={`text-lg font-semibold ${isToday ? 'text-blue-700' : 'text-gray-900'}`}>
          {format(parseISO(day.date), 'd')}
        </div>
      </div>
      
      <div className="p-2 space-y-2 min-h-[400px]">
        {day.schedules.map((schedule) => (
          <ScheduleCard
            key={schedule.id}
            schedule={schedule}
            onEdit={onEdit}
            onCreateLoad={onCreateLoad}
          />
        ))}
        
        <button
          type="button"
          onClick={() => onAddNew(day.date)}
          className="w-full text-sm text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 hover:border-gray-400 rounded-lg p-2 flex items-center justify-center"
        >
          <PlusIcon className="h-4 w-4 mr-1" />
          Add
        </button>
      </div>
    </div>
  );
}

/**
 * Schedule Form Modal
 * @param {{ isOpen: boolean; schedule?: object; date?: string; sites: Array<object>; channels: Array<object>; vehicles: Array<object>; drivers: Array<object>; onClose: () => void; onSave: (data: object) => void; onDelete?: (id: string) => void }} props
 */
function ScheduleModal({ isOpen, schedule, date, sites, channels, vehicles, drivers, onClose, onSave, onDelete }) {
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      dispatchDate: date || format(new Date(), 'yyyy-MM-dd'),
      dispatchTime: '',
      expectedArrivalDate: date || format(new Date(), 'yyyy-MM-dd'),
      expectedArrivalTime: '',
      originSiteId: '',
      destinationSiteId: '',
      channelId: '',
      cratesCount: 0,
      binsCount: 0,
      boxesCount: 0,
      palletsCount: 0,
      packagingEtaFarm: '',
      packagingSuppliedDate: '',
      ripeningStartDate: '',
      salesDespatchDate: '',
      packagingCollectionDate: '',
      packagingDeliveryFarmDate: '',
      vehicleId: '',
      driverId: '',
      customerName: '',
      productType: '',
      notes: '',
      status: 'planned'
    }
  });

  useEffect(() => {
    if (schedule) {
      reset({
        dispatchDate: schedule.dispatch_date || '',
        dispatchTime: schedule.dispatch_time || '',
        expectedArrivalDate: schedule.expected_arrival_date || '',
        expectedArrivalTime: schedule.expected_arrival_time || '',
        originSiteId: schedule.origin_site_id || '',
        destinationSiteId: schedule.destination_site_id || '',
        channelId: schedule.channel_id || '',
        cratesCount: schedule.crates_count || 0,
        binsCount: schedule.bins_count || 0,
        boxesCount: schedule.boxes_count || 0,
        palletsCount: schedule.pallets_count || 0,
        packagingEtaFarm: schedule.packaging_eta_farm || '',
        packagingSuppliedDate: schedule.packaging_supplied_date || '',
        ripeningStartDate: schedule.ripening_start_date || '',
        salesDespatchDate: schedule.sales_despatch_date || '',
        packagingCollectionDate: schedule.packaging_collection_date || '',
        packagingDeliveryFarmDate: schedule.packaging_delivery_farm_date || '',
        vehicleId: schedule.vehicle_id || '',
        driverId: schedule.driver_id || '',
        customerName: schedule.customer_name || '',
        productType: schedule.product_type || '',
        notes: schedule.notes || '',
        status: schedule.status || 'planned'
      });
    } else if (date) {
      reset({
        dispatchDate: date,
        dispatchTime: '',
        expectedArrivalDate: date,
        expectedArrivalTime: '',
        originSiteId: '',
        destinationSiteId: '',
        channelId: '',
        cratesCount: 0,
        binsCount: 0,
        boxesCount: 0,
        palletsCount: 0,
        packagingEtaFarm: '',
        packagingSuppliedDate: '',
        ripeningStartDate: '',
        salesDespatchDate: '',
        packagingCollectionDate: '',
        packagingDeliveryFarmDate: '',
        vehicleId: '',
        driverId: '',
        customerName: '',
        productType: '',
        notes: '',
        status: 'planned'
      });
    }
  }, [schedule, date, reset]);

  /** @param {object} data */
  const onSubmit = async (data) => {
    await onSave(data);
  };

  if (!isOpen) return null;

  const farms = sites.filter(s => s.site_type_code?.toLowerCase().includes('farm'));
  const depots = sites.filter(s => !s.site_type_code?.toLowerCase().includes('farm'));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black bg-opacity-30" onClick={onClose} />
        
        <div className="relative bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              {schedule ? 'Edit Dispatch Schedule' : 'New Dispatch Schedule'}
            </h3>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-500">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
            {/* Date & Time Section */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dispatch Date *</label>
                <input
                  type="date"
                  {...register('dispatchDate', { required: 'Required' })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
                {errors.dispatchDate && <span className="text-red-500 text-xs">{errors.dispatchDate.message}</span>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dispatch Time</label>
                <input
                  type="time"
                  {...register('dispatchTime')}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expected Arrival Date *</label>
                <input
                  type="date"
                  {...register('expectedArrivalDate', { required: 'Required' })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
                {errors.expectedArrivalDate && <span className="text-red-500 text-xs">{errors.expectedArrivalDate.message}</span>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expected Arrival Time</label>
                <input
                  type="time"
                  {...register('expectedArrivalTime')}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
            </div>

            {/* Route Section */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Origin (Farm) *</label>
                <select
                  {...register('originSiteId', { required: 'Required' })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Select farm...</option>
                  {farms.map(s => (
                    <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                  ))}
                </select>
                {errors.originSiteId && <span className="text-red-500 text-xs">{errors.originSiteId.message}</span>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Destination (Depot) *</label>
                <select
                  {...register('destinationSiteId', { required: 'Required' })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Select depot...</option>
                  {depots.map(s => (
                    <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                  ))}
                </select>
                {errors.destinationSiteId && <span className="text-red-500 text-xs">{errors.destinationSiteId.message}</span>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Channel</label>
                <select
                  {...register('channelId')}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Select channel...</option>
                  {channels.map(c => (
                    <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
                <input
                  type="text"
                  {...register('customerName')}
                  placeholder="Customer name"
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
            </div>

            {/* Packaging Quantities */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Packaging Quantities</h4>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Crates</label>
                  <input
                    type="number"
                    {...register('cratesCount', { valueAsNumber: true })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Bins</label>
                  <input
                    type="number"
                    {...register('binsCount', { valueAsNumber: true })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Boxes</label>
                  <input
                    type="number"
                    {...register('boxesCount', { valueAsNumber: true })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Pallets</label>
                  <input
                    type="number"
                    {...register('palletsCount', { valueAsNumber: true })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
              </div>
            </div>

            {/* Key Dates Section */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Key Planning Dates</h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Packaging ETA (Farm)</label>
                  <input
                    type="date"
                    {...register('packagingEtaFarm')}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Packaging Supplied</label>
                  <input
                    type="date"
                    {...register('packagingSuppliedDate')}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Ripening Start</label>
                  <input
                    type="date"
                    {...register('ripeningStartDate')}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Sales Despatch</label>
                  <input
                    type="date"
                    {...register('salesDespatchDate')}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Packaging Collection</label>
                  <input
                    type="date"
                    {...register('packagingCollectionDate')}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Packaging Delivery (Farm)</label>
                  <input
                    type="date"
                    {...register('packagingDeliveryFarmDate')}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
              </div>
            </div>

            {/* Transport Section */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle</label>
                <select
                  {...register('vehicleId')}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Select vehicle...</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.registration} - {v.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Driver</label>
                <select
                  {...register('driverId')}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Select driver...</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Product & Notes */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Type</label>
                <input
                  type="text"
                  {...register('productType')}
                  placeholder="e.g., Avocados, Mangoes"
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  {...register('status')}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="planned">Planned</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                {...register('notes')}
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="Additional notes..."
              />
            </div>

            {/* Actions */}
            <div className="flex justify-between pt-4 border-t">
              <div>
                {schedule && onDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(schedule.id)}
                    className="text-red-600 hover:text-red-700 flex items-center"
                  >
                    <TrashIcon className="h-4 w-4 mr-1" />
                    Delete
                  </button>
                )}
              </div>
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Schedule'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * Weekly Planner Page
 */
function WeeklyPlanner() {
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    return format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  });
  const [weekData, setWeekData] = useState({ days: [] });
  /** @type {[Array<{ site_id: string; site_code: string; site_name: string; total_crates: number; total_bins: number; dispatch_count: number }>, React.Dispatch<React.SetStateAction<Array<object>>>]} */
  const [demandData, setDemandData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState([]);
  const [channels, setChannels] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    loadReferenceData();
  }, []);

  useEffect(() => {
    loadWeekData();
  }, [weekStart]);

  const loadReferenceData = async () => {
    try {
      const [sitesRes, channelsRes, vehiclesRes, driversRes] = await Promise.all([
        getSites({ active: true }),
        getChannels(),
        getVehicles(),
        getDrivers()
      ]);
      setSites(sitesRes.data.sites || []);
      setChannels(channelsRes.data.channels || []);
      setVehicles(vehiclesRes.data.vehicles || []);
      setDrivers(driversRes.data.drivers || []);
    } catch (error) {
      toast.error('Failed to load reference data');
    }
  };

  const loadWeekData = async () => {
    setLoading(true);
    try {
      const weekEndDate = format(addDays(parseISO(weekStart), 6), 'yyyy-MM-dd');
      const [weekRes, demandRes] = await Promise.all([
        getWeekSchedules(weekStart),
        getPackagingDemand({ startDate: weekStart, endDate: weekEndDate })
      ]);
      
      // Fill in empty days
      const daysMap = {};
      (weekRes.data.days || []).forEach(day => {
        daysMap[day.date] = day;
      });
      
      const allDays = [];
      const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      for (let i = 0; i < 7; i++) {
        const date = format(addDays(parseISO(weekStart), i), 'yyyy-MM-dd');
        if (daysMap[date]) {
          allDays.push(daysMap[date]);
        } else {
          allDays.push({ date, dayName: dayNames[i], schedules: [] });
        }
      }
      
      setWeekData({ ...weekRes.data, days: allDays });
      setDemandData(demandRes.data.demand || []);
    } catch (error) {
      toast.error('Failed to load week data');
    } finally {
      setLoading(false);
    }
  };

  const goToPreviousWeek = () => {
    setWeekStart(format(addDays(parseISO(weekStart), -7), 'yyyy-MM-dd'));
  };

  const goToNextWeek = () => {
    setWeekStart(format(addDays(parseISO(weekStart), 7), 'yyyy-MM-dd'));
  };

  const goToCurrentWeek = () => {
    setWeekStart(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  };

  /** @param {object} schedule */
  const handleEditSchedule = (schedule) => {
    setSelectedSchedule(schedule);
    setSelectedDate(null);
    setIsModalOpen(true);
  };

  /** @param {string} date */
  const handleAddNew = (date) => {
    setSelectedSchedule(null);
    setSelectedDate(date);
    setIsModalOpen(true);
  };

  /** @param {object} data */
  const handleSaveSchedule = async (data) => {
    try {
      if (selectedSchedule) {
        await updateSchedule(selectedSchedule.id, data);
        toast.success('Schedule updated');
      } else {
        await createSchedule(data);
        toast.success('Schedule created');
      }
      setIsModalOpen(false);
      loadWeekData();
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to save schedule');
    }
  };

  /** @param {string} id */
  const handleDeleteSchedule = async (id) => {
    if (!window.confirm('Are you sure you want to delete this schedule?')) return;
    try {
      await deleteSchedule(id);
      toast.success('Schedule deleted');
      setIsModalOpen(false);
      loadWeekData();
    } catch (error) {
      toast.error('Failed to delete schedule');
    }
  };

  /** @param {object} schedule */
  const handleCreateLoad = async (schedule) => {
    if (!window.confirm('Create a load from this schedule? This will move the schedule to confirmed status.')) return;
    try {
      const response = await createLoadFromSchedule(schedule.id);
      toast.success(`Load ${response.data.loadNumber} created`);
      loadWeekData();
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to create load');
    }
  };

  const weekEndDate = format(addDays(parseISO(weekStart), 6), 'MMM d, yyyy');
  const weekStartFormatted = format(parseISO(weekStart), 'MMM d');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Weekly Planner</h1>
          <p className="text-sm text-gray-500">Plan and schedule dispatches for the week</p>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={goToPreviousWeek}
            className="p-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          
          <div className="px-4 py-2 bg-white border border-gray-300 rounded-md text-center min-w-[200px]">
            <div className="text-sm font-medium text-gray-900">
              {weekStartFormatted} - {weekEndDate}
            </div>
          </div>
          
          <button
            type="button"
            onClick={goToNextWeek}
            className="p-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
          
          <button
            type="button"
            onClick={goToCurrentWeek}
            className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 flex items-center"
          >
            <CalendarIcon className="h-4 w-4 mr-1" />
            Today
          </button>
          
          <button
            type="button"
            onClick={loadWeekData}
            className="p-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <ArrowPathIcon className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Packaging Demand Summary */}
      {demandData.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Weekly Packaging Demand by Site</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {demandData.map(site => (
              <div key={site.site_id} className="bg-gray-50 rounded-lg p-3">
                <div className="text-sm font-medium text-gray-900">{site.site_code}</div>
                <div className="text-xs text-gray-500 mb-2">{site.dispatch_count} dispatches</div>
                <div className="space-y-1 text-xs">
                  {site.total_crates > 0 && <div>Crates: <span className="font-medium">{site.total_crates}</span></div>}
                  {site.total_bins > 0 && <div>Bins: <span className="font-medium">{site.total_bins}</span></div>}
                  {site.total_boxes > 0 && <div>Boxes: <span className="font-medium">{site.total_boxes}</span></div>}
                  {site.total_pallets > 0 && <div>Pallets: <span className="font-medium">{site.total_pallets}</span></div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly Calendar */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">
            <ArrowPathIcon className="h-8 w-8 animate-spin mx-auto mb-2" />
            Loading...
          </div>
        ) : (
          <div className="flex overflow-x-auto">
            {weekData.days.map(day => (
              <DayColumn
                key={day.date}
                day={day}
                onEdit={handleEditSchedule}
                onCreateLoad={handleCreateLoad}
                onAddNew={handleAddNew}
              />
            ))}
          </div>
        )}
      </div>

      {/* Schedule Modal */}
      <ScheduleModal
        isOpen={isModalOpen}
        schedule={selectedSchedule}
        date={selectedDate}
        sites={sites}
        channels={channels}
        vehicles={vehicles}
        drivers={drivers}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveSchedule}
        onDelete={handleDeleteSchedule}
      />
    </div>
  );
}

export default WeeklyPlanner;
