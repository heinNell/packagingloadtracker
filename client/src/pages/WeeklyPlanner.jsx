import {
  ArrowPathIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
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

/** Default expected farm times for BV and CBC farms */
const DEFAULT_EXPECTED_FARM_ARRIVAL_TIME = '14:00';
const DEFAULT_EXPECTED_FARM_DEPARTURE_TIME = '17:00';

/**
 * Format duration from minutes to human-readable string
 * @param {number} minutes
 * @returns {string}
 */
function formatDuration(minutes) {
  if (minutes === null || minutes === undefined || isNaN(minutes)) return '-';
  const absMinutes = Math.abs(minutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;
  const sign = minutes < 0 ? '-' : '+';
  if (hours === 0) return `${sign}${mins}m`;
  if (mins === 0) return `${sign}${hours}h`;
  return `${sign}${hours}h ${mins}m`;
}

/**
 * Calculate time difference between expected and actual
 * @param {string} expectedTime - TIME format HH:mm
 * @param {string} actualTime - TIME format HH:mm  
 * @param {string} date - DATE format YYYY-MM-DD
 * @returns {{ diff: number | null; isOvertime: boolean }}
 */
function calculateTimeDiff(expectedTime, actualTime, date) {
  if (!expectedTime || !actualTime || !date) {
    return { diff: null, isOvertime: false };
  }
  try {
    const expectedDateTime = new Date(`${date}T${expectedTime}`);
    const actualDateTime = new Date(`${date}T${actualTime}`);
    const diffMinutes = differenceInMinutes(actualDateTime, expectedDateTime);
    return { diff: diffMinutes, isOvertime: diffMinutes > 0 };
  } catch {
    return { diff: null, isOvertime: false };
  }
}/**
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
      // Farm times
      expectedFarmArrivalTime: DEFAULT_EXPECTED_FARM_ARRIVAL_TIME,
      actualFarmArrivalTime: '',
      expectedFarmDepartureTime: DEFAULT_EXPECTED_FARM_DEPARTURE_TIME,
      actualFarmDepartureTime: '',
      // Depot times
      expectedDepotArrivalTime: '',
      actualDepotArrivalTime: '',
      expectedDepotDepartureTime: '',
      actualDepotDepartureTime: '',
      // Planning dates
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

  // Watch time fields for calculating differences
  const watchedDispatchDate = watch('dispatchDate');
  const watchedExpectedFarmArrival = watch('expectedFarmArrivalTime');
  const watchedActualFarmArrival = watch('actualFarmArrivalTime');
  const watchedExpectedFarmDeparture = watch('expectedFarmDepartureTime');
  const watchedActualFarmDeparture = watch('actualFarmDepartureTime');
  const watchedExpectedDepotArrival = watch('expectedDepotArrivalTime');
  const watchedActualDepotArrival = watch('actualDepotArrivalTime');
  const watchedExpectedDepotDeparture = watch('expectedDepotDepartureTime');
  const watchedActualDepotDeparture = watch('actualDepotDepartureTime');

  // Calculate differences
  const farmArrivalDiff = calculateTimeDiff(watchedExpectedFarmArrival, watchedActualFarmArrival, watchedDispatchDate);
  const farmDepartureDiff = calculateTimeDiff(watchedExpectedFarmDeparture, watchedActualFarmDeparture, watchedDispatchDate);
  const depotArrivalDiff = calculateTimeDiff(watchedExpectedDepotArrival, watchedActualDepotArrival, watchedDispatchDate);
  const depotDepartureDiff = calculateTimeDiff(watchedExpectedDepotDeparture, watchedActualDepotDeparture, watchedDispatchDate);

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
        // Farm times
        expectedFarmArrivalTime: schedule.expected_farm_arrival_time || DEFAULT_EXPECTED_FARM_ARRIVAL_TIME,
        actualFarmArrivalTime: schedule.actual_farm_arrival_time || '',
        expectedFarmDepartureTime: schedule.expected_farm_departure_time || DEFAULT_EXPECTED_FARM_DEPARTURE_TIME,
        actualFarmDepartureTime: schedule.actual_farm_departure_time || '',
        // Depot times
        expectedDepotArrivalTime: schedule.expected_depot_arrival_time || '',
        actualDepotArrivalTime: schedule.actual_depot_arrival_time || '',
        expectedDepotDepartureTime: schedule.expected_depot_departure_time || '',
        actualDepotDepartureTime: schedule.actual_depot_departure_time || '',
        // Planning dates
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
        expectedFarmArrivalTime: DEFAULT_EXPECTED_FARM_ARRIVAL_TIME,
        actualFarmArrivalTime: '',
        expectedFarmDepartureTime: DEFAULT_EXPECTED_FARM_DEPARTURE_TIME,
        actualFarmDepartureTime: '',
        expectedDepotArrivalTime: '',
        actualDepotArrivalTime: '',
        expectedDepotDepartureTime: '',
        actualDepotDepartureTime: '',
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
        
        <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
            <h3 className="text-lg font-semibold text-gray-900">
              {schedule ? 'Edit Dispatch Schedule' : 'New Dispatch Schedule'}
            </h3>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-500">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
            {/* Route Details Section */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Route Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Origin (Farm) *</label>
                  <select
                    {...register('originSiteId', { required: 'Required' })}
                    className="form-select"
                  >
                    <option value="">Select farm...</option>
                    {farms.map(s => (
                      <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                    ))}
                  </select>
                  {errors.originSiteId && <span className="text-red-500 text-xs mt-1">{errors.originSiteId.message}</span>}
                </div>
                <div>
                  <label className="form-label">Destination (Depot) *</label>
                  <select
                    {...register('destinationSiteId', { required: 'Required' })}
                    className="form-select"
                  >
                    <option value="">Select depot...</option>
                    {depots.map(s => (
                      <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                    ))}
                  </select>
                  {errors.destinationSiteId && <span className="text-red-500 text-xs mt-1">{errors.destinationSiteId.message}</span>}
                </div>
                <div>
                  <label className="form-label">Channel</label>
                  <select
                    {...register('channelId')}
                    className="form-select"
                  >
                    <option value="">Select channel...</option>
                    {channels.map(c => (
                      <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Customer</label>
                  <input
                    type="text"
                    {...register('customerName')}
                    placeholder="Customer name"
                    className="form-input"
                  />
                </div>
              </div>
            </div>

            {/* Schedule Section */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Schedule</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="form-label">Dispatch Date *</label>
                  <input
                    type="date"
                    {...register('dispatchDate', { required: 'Required' })}
                    className="form-input"
                  />
                  {errors.dispatchDate && <span className="text-red-500 text-xs mt-1">{errors.dispatchDate.message}</span>}
                </div>
                <div>
                  <label className="form-label">Dispatch Time</label>
                  <input
                    type="time"
                    {...register('dispatchTime')}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Expected Arrival Date *</label>
                  <input
                    type="date"
                    {...register('expectedArrivalDate', { required: 'Required' })}
                    className="form-input"
                  />
                  {errors.expectedArrivalDate && <span className="text-red-500 text-xs mt-1">{errors.expectedArrivalDate.message}</span>}
                </div>
                <div>
                  <label className="form-label">Expected Arrival Time</label>
                  <input
                    type="time"
                    {...register('expectedArrivalTime')}
                    className="form-input"
                  />
                </div>
              </div>
            </div>

            {/* Farm Times Section */}
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <ClockIcon className="w-5 h-5 text-orange-500" />
                <h2 className="text-lg font-semibold text-gray-900">Farm Times</h2>
                <span className="text-xs text-gray-500">(BV/CBC default: Arrival 14:00, Departure 17:00)</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Farm Arrival */}
                <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <h3 className="font-medium text-orange-800 mb-3">Arrival at Farm</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="form-label">Expected Time</label>
                      <input
                        type="time"
                        className="form-input"
                        {...register('expectedFarmArrivalTime')}
                      />
                    </div>
                    <div>
                      <label className="form-label">Actual Time</label>
                      <input
                        type="time"
                        className="form-input"
                        {...register('actualFarmArrivalTime')}
                      />
                    </div>
                  </div>
                  {farmArrivalDiff.diff !== null && (
                    <div className={`mt-3 p-2 rounded text-sm font-medium ${farmArrivalDiff.isOvertime ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      Difference: {formatDuration(farmArrivalDiff.diff)} {farmArrivalDiff.isOvertime && '⚠️ Overtime'}
                    </div>
                  )}
                </div>

                {/* Farm Departure */}
                <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <h3 className="font-medium text-orange-800 mb-3">Departure from Farm</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="form-label">Expected Time</label>
                      <input
                        type="time"
                        className="form-input"
                        {...register('expectedFarmDepartureTime')}
                      />
                    </div>
                    <div>
                      <label className="form-label">Actual Time</label>
                      <input
                        type="time"
                        className="form-input"
                        {...register('actualFarmDepartureTime')}
                      />
                    </div>
                  </div>
                  {farmDepartureDiff.diff !== null && (
                    <div className={`mt-3 p-2 rounded text-sm font-medium ${farmDepartureDiff.isOvertime ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      Difference: {formatDuration(farmDepartureDiff.diff)} {farmDepartureDiff.isOvertime && '⚠️ Overtime'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Depot Times Section */}
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <ClockIcon className="w-5 h-5 text-blue-500" />
                <h2 className="text-lg font-semibold text-gray-900">Depot Times</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Depot Arrival */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h3 className="font-medium text-blue-800 mb-3">Arrival at Depot</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="form-label">Expected Time</label>
                      <input
                        type="time"
                        className="form-input"
                        {...register('expectedDepotArrivalTime')}
                      />
                    </div>
                    <div>
                      <label className="form-label">Actual Time</label>
                      <input
                        type="time"
                        className="form-input"
                        {...register('actualDepotArrivalTime')}
                      />
                    </div>
                  </div>
                  {depotArrivalDiff.diff !== null && (
                    <div className={`mt-3 p-2 rounded text-sm font-medium ${depotArrivalDiff.isOvertime ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      Difference: {formatDuration(depotArrivalDiff.diff)} {depotArrivalDiff.isOvertime && '⚠️ Late'}
                    </div>
                  )}
                </div>

                {/* Depot Departure */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h3 className="font-medium text-blue-800 mb-3">Departure from Depot</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="form-label">Expected Time</label>
                      <input
                        type="time"
                        className="form-input"
                        {...register('expectedDepotDepartureTime')}
                      />
                    </div>
                    <div>
                      <label className="form-label">Actual Time</label>
                      <input
                        type="time"
                        className="form-input"
                        {...register('actualDepotDepartureTime')}
                      />
                    </div>
                  </div>
                  {depotDepartureDiff.diff !== null && (
                    <div className={`mt-3 p-2 rounded text-sm font-medium ${depotDepartureDiff.isOvertime ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      Difference: {formatDuration(depotDepartureDiff.diff)} {depotDepartureDiff.isOvertime && '⚠️ Late'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Packaging Quantities Section */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Packaging Quantities</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="form-label">Crates</label>
                  <input
                    type="number"
                    {...register('cratesCount', { valueAsNumber: true })}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Bins</label>
                  <input
                    type="number"
                    {...register('binsCount', { valueAsNumber: true })}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Boxes</label>
                  <input
                    type="number"
                    {...register('boxesCount', { valueAsNumber: true })}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Pallets</label>
                  <input
                    type="number"
                    {...register('palletsCount', { valueAsNumber: true })}
                    className="form-input"
                  />
                </div>
              </div>
            </div>

            {/* Key Planning Dates Section */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Key Planning Dates</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="form-label">Packaging ETA (Farm)</label>
                  <input
                    type="date"
                    {...register('packagingEtaFarm')}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Packaging Supplied</label>
                  <input
                    type="date"
                    {...register('packagingSuppliedDate')}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Ripening Start</label>
                  <input
                    type="date"
                    {...register('ripeningStartDate')}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Sales Despatch</label>
                  <input
                    type="date"
                    {...register('salesDespatchDate')}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Packaging Collection</label>
                  <input
                    type="date"
                    {...register('packagingCollectionDate')}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Packaging Delivery (Farm)</label>
                  <input
                    type="date"
                    {...register('packagingDeliveryFarmDate')}
                    className="form-input"
                  />
                </div>
              </div>
            </div>

            {/* Transport Section */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Transport</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Vehicle</label>
                  <select
                    {...register('vehicleId')}
                    className="form-select"
                  >
                    <option value="">Select vehicle...</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.registration} - {v.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Driver</label>
                  <select
                    {...register('driverId')}
                    className="form-select"
                  >
                    <option value="">Select driver...</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Product, Status & Notes Section */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Additional Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="form-label">Product Type</label>
                  <input
                    type="text"
                    {...register('productType')}
                    placeholder="e.g., Avocados, Mangoes"
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Status</label>
                  <select
                    {...register('status')}
                    className="form-select"
                  >
                    <option value="planned">Planned</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="form-label">Notes</label>
                <textarea
                  {...register('notes')}
                  rows={3}
                  className="form-textarea"
                  placeholder="Additional notes..."
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-between pt-4 border-t">
              <div>
                {schedule && onDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(schedule.id)}
                    className="btn btn-danger"
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
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn btn-primary"
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
