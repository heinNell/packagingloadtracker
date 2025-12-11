import {
  ArrowLeftIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
  MapPinIcon,
  PencilIcon,
  TagIcon,
  TrashIcon,
  TruckIcon,
  UserIcon
} from '@heroicons/react/24/outline';
import { differenceInMinutes, format } from 'date-fns';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { confirmFarmArrival, confirmFarmDeparture, deleteLoad, dispatchLoad, duplicateLoad, getLoad, receiveLoad } from '../lib/api';

/** Default expected farm times for BV and CBC farms */
const EXPECTED_FARM_ARRIVAL_TIME = '14:00';
const EXPECTED_FARM_DEPARTURE_TIME = '17:00';

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
 * Format duration for display (positive only)
 * @param {number} minutes
 * @returns {string}
 */
function formatDurationPositive(minutes) {
  if (!minutes || minutes < 0) return '-';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Calculate on-time status based on scheduled vs actual times
 * @param {string|null} scheduledTime - TIME format (HH:mm:ss)
 * @param {string|null} actualTime - TIMESTAMP format
 * @param {string} scheduledDate - DATE format
 * @returns {{ status: 'on_time' | 'delayed' | 'early' | null; diff: number | null }}
 */
function calculateOnTimeStatus(scheduledTime, actualTime, scheduledDate) {
  if (!scheduledTime || !actualTime) return { status: null, diff: null };
  
  try {
    // Create scheduled datetime
    const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
    const actualDateTime = new Date(actualTime);
    
    const diffMinutes = differenceInMinutes(actualDateTime, scheduledDateTime);
    
    if (diffMinutes <= -5) return { status: 'early', diff: Math.abs(diffMinutes) };
    if (diffMinutes >= 5) return { status: 'delayed', diff: diffMinutes };
    return { status: 'on_time', diff: 0 };
  } catch {
    return { status: null, diff: null };
  }
}

/**
 * On-Time Status Badge
 * @param {{ status: 'on_time' | 'delayed' | 'early' | null; diff: number | null }} props
 */
function OnTimeStatusBadge({ status, diff }) {
  if (!status) return null;
  
  const config = {
    on_time: { label: 'On Time', class: 'bg-green-100 text-green-700' },
    delayed: { label: `Delayed ${formatDurationPositive(diff)}`, class: 'bg-red-100 text-red-700' },
    early: { label: `Early ${formatDurationPositive(diff)}`, class: 'bg-blue-100 text-blue-700' },
  };
  
  const c = config[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.class}`}>
      {c.label}
    </span>
  );
}

/**
 * Overtime Status Badge - specifically for farm arrival/departure times
 * @param {{ overtimeMinutes: number | null; label?: string }} props
 */
function OvertimeStatusBadge({ overtimeMinutes, label }) {
  if (overtimeMinutes === null || overtimeMinutes === undefined) {
    return null;
  }
  
  if (overtimeMinutes <= 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
        ✓ On Time
      </span>
    );
  }
  
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
      ⚠️ {label || 'Overtime'} +{formatDurationPositive(overtimeMinutes)}
    </span>
  );
}

/**
 * Calculate farm time overtime
 * @param {string} expectedTime - Expected TIME format (HH:mm)
 * @param {string|null} actualTime - Actual TIMESTAMP format
 * @param {string} date - DATE format for expected time
 * @returns {{ isOvertime: boolean; overtimeMinutes: number }}
 */
function calculateFarmOvertime(expectedTime, actualTime, date) {
  if (!expectedTime || !actualTime) {
    return { isOvertime: false, overtimeMinutes: 0 };
  }
  
  try {
    const expectedDateTime = new Date(`${date}T${expectedTime}`);
    const actualDateTime = new Date(actualTime);
    const diffMinutes = differenceInMinutes(actualDateTime, expectedDateTime);
    
    return {
      isOvertime: diffMinutes > 0,
      overtimeMinutes: Math.max(0, diffMinutes)
    };
  } catch {
    return { isOvertime: false, overtimeMinutes: 0 };
  }
}

/**
 * Timeline component showing load journey with duration calculations
 * @param {{ load: object }} props
 */
function LoadTimeline({ load }) {
  // Calculate durations
  const departureStatus = calculateOnTimeStatus(
    load.scheduled_departure_time,
    load.actual_departure_time,
    load.dispatch_date
  );
  
  const arrivalStatus = calculateOnTimeStatus(
    load.estimated_arrival_time,
    load.actual_arrival_time,
    load.expected_arrival_date || load.dispatch_date
  );
  
  // Calculate farm overtime (BV and CBC have fixed expected times)
  const farmArrivalOvertime = calculateFarmOvertime(
    load.expected_farm_arrival_time || EXPECTED_FARM_ARRIVAL_TIME,
    load.actual_farm_arrival_time,
    load.dispatch_date
  );
  
  const farmDepartureOvertime = calculateFarmOvertime(
    load.expected_farm_departure_time || EXPECTED_FARM_DEPARTURE_TIME,
    load.actual_farm_departure_time,
    load.dispatch_date
  );
  
  // Calculate transit duration
  let transitDuration = null;
  if (load.actual_departure_time && load.actual_arrival_time) {
    transitDuration = differenceInMinutes(
      new Date(load.actual_arrival_time),
      new Date(load.actual_departure_time)
    );
  }
  
  // Calculate depot duration (if applicable)
  let depotDuration = null;
  if (load.arrived_depot_time && load.departed_depot_time) {
    depotDuration = differenceInMinutes(
      new Date(load.departed_depot_time),
      new Date(load.arrived_depot_time)
    );
  }
  
  // Calculate farm loading duration (time at farm)
  let farmLoadingDuration = null;
  if (load.actual_farm_arrival_time && load.actual_farm_departure_time) {
    farmLoadingDuration = differenceInMinutes(
      new Date(load.actual_farm_departure_time),
      new Date(load.actual_farm_arrival_time)
    );
  }

  const timelineSteps = [
    {
      label: 'Scheduled',
      date: load.dispatch_date,
      time: load.scheduled_departure_time,
      completed: true,
      icon: '📋'
    },
    {
      label: 'Arrived at Farm',
      date: load.actual_farm_arrival_time ? format(new Date(load.actual_farm_arrival_time), 'yyyy-MM-dd') : null,
      time: load.actual_farm_arrival_time ? format(new Date(load.actual_farm_arrival_time), 'HH:mm') : null,
      completed: !!load.actual_farm_arrival_time,
      expected: load.expected_farm_arrival_time || EXPECTED_FARM_ARRIVAL_TIME,
      overtime: farmArrivalOvertime,
      icon: '🚛'
    },
    {
      label: 'Departed Farm',
      date: load.actual_farm_departure_time ? format(new Date(load.actual_farm_departure_time), 'yyyy-MM-dd') : null,
      time: load.actual_farm_departure_time ? format(new Date(load.actual_farm_departure_time), 'HH:mm') : null,
      completed: !!load.actual_farm_departure_time,
      expected: load.expected_farm_departure_time || EXPECTED_FARM_DEPARTURE_TIME,
      overtime: farmDepartureOvertime,
      icon: '📦'
    },
    {
      label: 'Dispatched',
      date: load.actual_departure_time ? format(new Date(load.actual_departure_time), 'yyyy-MM-dd') : null,
      time: load.actual_departure_time ? format(new Date(load.actual_departure_time), 'HH:mm') : null,
      completed: !!load.actual_departure_time,
      status: departureStatus,
      icon: '🚚'
    },
    {
      label: 'Arrived Depot',
      date: load.arrived_depot_time ? format(new Date(load.arrived_depot_time), 'yyyy-MM-dd') : null,
      time: load.arrived_depot_time ? format(new Date(load.arrived_depot_time), 'HH:mm') : null,
      completed: !!load.arrived_depot_time,
      icon: '🏭'
    },
    {
      label: 'Departed Depot',
      date: load.departed_depot_time ? format(new Date(load.departed_depot_time), 'yyyy-MM-dd') : null,
      time: load.departed_depot_time ? format(new Date(load.departed_depot_time), 'HH:mm') : null,
      completed: !!load.departed_depot_time,
      icon: '🚛'
    },
    {
      label: 'Completed',
      date: load.actual_arrival_time ? format(new Date(load.actual_arrival_time), 'yyyy-MM-dd') : null,
      time: load.actual_arrival_time ? format(new Date(load.actual_arrival_time), 'HH:mm') : null,
      completed: load.status === 'completed',
      status: arrivalStatus,
      icon: '✅'
    }
  ];

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Journey Timeline</h2>
        {load.has_overtime && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
            ⚠️ Overtime Recorded
          </span>
        )}
      </div>
      
      {/* Duration Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{formatDurationPositive(farmLoadingDuration)}</div>
          <div className="text-xs text-gray-500">At Farm</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{formatDurationPositive(transitDuration)}</div>
          <div className="text-xs text-gray-500">Transit Time</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{formatDurationPositive(depotDuration)}</div>
          <div className="text-xs text-gray-500">At Depot</div>
        </div>
        <div className="text-center">
          {farmArrivalOvertime.isOvertime ? (
            <OvertimeStatusBadge overtimeMinutes={farmArrivalOvertime.overtimeMinutes} />
          ) : load.actual_farm_arrival_time ? (
            <span className="text-green-600 font-medium">✓ On Time</span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
          <div className="text-xs text-gray-500 mt-1">Farm Arrival</div>
        </div>
        <div className="text-center">
          {farmDepartureOvertime.isOvertime ? (
            <OvertimeStatusBadge overtimeMinutes={farmDepartureOvertime.overtimeMinutes} />
          ) : load.actual_farm_departure_time ? (
            <span className="text-green-600 font-medium">✓ On Time</span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
          <div className="text-xs text-gray-500 mt-1">Farm Departure</div>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
        <div className="space-y-4">
          {timelineSteps.map((step, index) => (
            <div key={index} className="relative flex items-start pl-10">
              <div className={`absolute left-2 w-5 h-5 rounded-full flex items-center justify-center text-xs
                ${step.completed ? 'bg-green-100' : 'bg-gray-100'}`}>
                {step.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-medium ${step.completed ? 'text-gray-900' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                  {step.status?.status && (
                    <OnTimeStatusBadge status={step.status.status} diff={step.status.diff} />
                  )}
                  {step.overtime?.isOvertime && (
                    <OvertimeStatusBadge overtimeMinutes={step.overtime.overtimeMinutes} />
                  )}
                </div>
                {step.completed && step.date && (
                  <div className="text-sm text-gray-500">
                    {format(new Date(step.date), 'MMM d, yyyy')} {step.time && `at ${step.time}`}
                    {step.expected && (
                      <span className="ml-2 text-gray-400">(Expected: {step.expected})</span>
                    )}
                  </div>
                )}
                {!step.completed && step.expected && (
                  <div className="text-sm text-gray-400">
                    Expected: {step.expected}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${config.class}`}>
      {config.label}
    </span>
  );
}

function LoadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [load, setLoad] = useState(null);
  const [packaging, setPackaging] = useState([]);
  const [backloadPackaging, setBackloadPackaging] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showFarmArrivalModal, setShowFarmArrivalModal] = useState(false);
  const [showFarmDepartureModal, setShowFarmDepartureModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const response = await getLoad(id);
      setLoad(response.data.load);
      setPackaging(response.data.packaging);
      setBackloadPackaging(response.data.backloadPackaging || []);
    } catch (error) {
      toast.error('Failed to load details');
      navigate('/loads');
    } finally {
      setLoading(false);
    }
  };

  /** @param {{ actualDepartureTime?: string }} data */
  const handleDispatch = async (data = {}) => {
    setActionLoading(true);
    try {
      await dispatchLoad(id, {
        actualDepartureTime: data.actualDepartureTime || new Date().toISOString()
      });
      toast.success('Load dispatched successfully');
      loadData();
      setShowDispatchModal(false);
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to dispatch load');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReceive = async (data) => {
    setActionLoading(true);
    try {
      const receivedPackaging = packaging.map(pkg => ({
        id: pkg.id,
        quantityReceived: parseInt(data[`received_${pkg.id}`]) || pkg.quantity_dispatched,
        quantityDamaged: parseInt(data[`damaged_${pkg.id}`]) || 0,
        quantityMissing: parseInt(data[`missing_${pkg.id}`]) || 0,
      }));

      await receiveLoad(id, {
        packaging: receivedPackaging,
        discrepancyNotes: data.discrepancyNotes,
        actualArrivalTime: data.actualArrivalTime || new Date().toISOString()
      });
      toast.success('Load received successfully');
      loadData();
      setShowReceiveModal(false);
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to receive load');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDuplicate = async () => {
    try {
      const response = await duplicateLoad(id, {
        dispatchDate: new Date().toISOString().split('T')[0],
      });
      toast.success(`Load duplicated: ${response.data.loadNumber}`);
      navigate(`/loads/${response.data.load.id}`);
    } catch (error) {
      toast.error('Failed to duplicate load');
    }
  };

  /**
   * Handle farm arrival confirmation
   * @param {{ actualFarmArrivalTime: string }} data 
   */
  const handleFarmArrival = async (data) => {
    setActionLoading(true);
    try {
      const response = await confirmFarmArrival(id, {
        actualFarmArrivalTime: data.actualFarmArrivalTime
      });
      if (response.data.isOvertime) {
        toast.success(`Farm arrival recorded - Overtime: ${formatDuration(response.data.overtimeMinutes)}`, {
          icon: '⚠️',
          duration: 5000
        });
      } else {
        toast.success('Farm arrival recorded - On Time');
      }
      loadData();
      setShowFarmArrivalModal(false);
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to record farm arrival');
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Handle farm departure confirmation
   * @param {{ actualFarmDepartureTime: string }} data 
   */
  const handleFarmDeparture = async (data) => {
    setActionLoading(true);
    try {
      const response = await confirmFarmDeparture(id, {
        actualFarmDepartureTime: data.actualFarmDepartureTime
      });
      if (response.data.isOvertime) {
        toast.success(`Farm departure recorded - Overtime detected`, {
          icon: '⚠️',
          duration: 5000
        });
      } else {
        toast.success('Farm departure recorded - On Time');
      }
      loadData();
      setShowFarmDepartureModal(false);
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to record farm departure');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!load) {
    return null;
  }

  const canDispatch = load.status === 'scheduled' || load.status === 'loading';
  const canReceive = load.status === 'departed' || load.status === 'in_transit' || load.status === 'arrived_depot';
  const canEdit = load.status === 'scheduled' || load.status === 'loading';
  const canDelete = load.status === 'scheduled';
  
  // Farm time tracking - can record farm arrival/departure if not yet recorded and load is scheduled/loading
  const canRecordFarmArrival = !load.actual_farm_arrival_time && (load.status === 'scheduled' || load.status === 'loading');
  const canRecordFarmDeparture = load.actual_farm_arrival_time && !load.actual_farm_departure_time && (load.status === 'scheduled' || load.status === 'loading');

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete load ${load.load_number}? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteLoad(id);
      toast.success('Load deleted successfully');
      navigate('/loads');
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Failed to delete load');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/loads')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{load.load_number}</h1>
            <LoadStatusBadge status={load.status} />
            {load.has_discrepancy && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-sm">
                <ExclamationTriangleIcon className="w-4 h-4" />
                Discrepancy
              </span>
            )}
            {load.has_overtime && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded text-sm">
                <ClockIcon className="w-4 h-4" />
                Overtime
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            Dispatched {format(new Date(load.dispatch_date), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canEdit && (
            <Link to={`/loads/${id}/edit`} className="btn btn-secondary">
              <PencilIcon className="w-5 h-5 mr-2" />
              Edit
            </Link>
          )}
          {canDelete && (
            <button onClick={handleDelete} className="btn btn-secondary text-red-600 hover:bg-red-50">
              <TrashIcon className="w-5 h-5 mr-2" />
              Delete
            </button>
          )}
          <button onClick={handleDuplicate} className="btn btn-secondary">
            <DocumentDuplicateIcon className="w-5 h-5 mr-2" />
            Duplicate
          </button>
          {canRecordFarmArrival && (
            <button onClick={() => setShowFarmArrivalModal(true)} className="btn btn-secondary border-orange-300 text-orange-700 hover:bg-orange-50">
              <ClockIcon className="w-5 h-5 mr-2" />
              Farm Arrival
            </button>
          )}
          {canRecordFarmDeparture && (
            <button onClick={() => setShowFarmDepartureModal(true)} className="btn btn-secondary border-orange-300 text-orange-700 hover:bg-orange-50">
              <TruckIcon className="w-5 h-5 mr-2" />
              Farm Departure
            </button>
          )}
          {canDispatch && (
            <button onClick={() => setShowDispatchModal(true)} className="btn btn-primary">
              <TruckIcon className="w-5 h-5 mr-2" />
              Confirm Dispatch
            </button>
          )}
          {canReceive && (
            <button onClick={() => setShowReceiveModal(true)} className="btn btn-primary">
              <CheckCircleIcon className="w-5 h-5 mr-2" />
              Confirm Receipt
            </button>
          )}
        </div>
      </div>

      {/* Route Info */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <MapPinIcon className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Route Details</h2>
        </div>
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <MapPinIcon className="w-4 h-4" />
              Origin
            </div>
            <Link to={`/sites/${load.origin_site_id}`} className="text-lg font-semibold text-primary-600 hover:underline">
              {load.origin_site_name}
            </Link>
            <p className="text-sm text-gray-500">{load.origin_site_code}</p>
          </div>

          <div className="flex items-center justify-center">
            <div className="w-16 h-0.5 bg-gray-300"></div>
            <TruckIcon className="w-8 h-8 text-gray-400 mx-2" />
            <div className="w-16 h-0.5 bg-gray-300"></div>
          </div>

          <div className="flex-1 text-right">
            <div className="flex items-center justify-end gap-2 text-gray-500 text-sm mb-1">
              <MapPinIcon className="w-4 h-4" />
              Destination
            </div>
            <Link to={`/sites/${load.destination_site_id}`} className="text-lg font-semibold text-primary-600 hover:underline">
              {load.destination_site_name}
            </Link>
            <p className="text-sm text-gray-500">{load.destination_site_code}</p>
          </div>
        </div>

        {load.channel_name && (
          <div className="mt-4 pt-4 border-t border-gray-200 flex items-center gap-2">
            <TagIcon className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-500">Channel:</span>
            <span className="font-medium text-gray-900">{load.channel_name}</span>
          </div>
        )}
      </div>

      {/* Schedule & Transport Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Schedule */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDaysIcon className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Schedule</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <ClockIcon className="w-4 h-4" />
                Dispatch Date
              </div>
              <p className="font-semibold text-gray-900">{format(new Date(load.dispatch_date), 'MMM d, yyyy')}</p>
              {load.scheduled_departure_time && (
                <p className="text-sm text-gray-500 mt-1">Scheduled: {load.scheduled_departure_time}</p>
              )}
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <ClockIcon className="w-4 h-4" />
                Expected Arrival
              </div>
              <p className="font-semibold text-gray-900">
                {load.expected_arrival_date 
                  ? format(new Date(load.expected_arrival_date), 'MMM d, yyyy')
                  : '-'}
              </p>
              {load.estimated_arrival_time && (
                <p className="text-sm text-gray-500 mt-1">ETA: {load.estimated_arrival_time}</p>
              )}
            </div>
          </div>
        </div>

        {/* Transport */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <TruckIcon className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Transport</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <TruckIcon className="w-4 h-4" />
                Vehicle
              </div>
              <p className="font-semibold text-gray-900">{load.vehicle_name || '-'}</p>
              {load.vehicle_registration && (
                <p className="text-sm text-gray-500 mt-1">{load.vehicle_registration}</p>
              )}
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <UserIcon className="w-4 h-4" />
                Driver
              </div>
              <p className="font-semibold text-gray-900">{load.driver_name || '-'}</p>
              {load.driver_phone && (
                <p className="text-sm text-gray-500 mt-1">{load.driver_phone}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Farm & Depot Times Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Farm Times */}
        <div className="card p-6 border-l-4 border-l-orange-400">
          <div className="flex items-center gap-2 mb-4">
            <ClockIcon className="w-5 h-5 text-orange-500" />
            <h2 className="text-lg font-semibold text-gray-900">Farm Times</h2>
            <span className="text-xs text-gray-400 ml-auto">(Default: Arrival 14:00, Departure 17:00)</span>
          </div>
          
          <div className="space-y-4">
            {/* Farm Arrival */}
            <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-orange-800">Arrival at Farm</h3>
                {load.actual_farm_arrival_time && (
                  load.farm_arrival_overtime_minutes > 0 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                      ⚠️ Overtime {formatDuration(load.farm_arrival_overtime_minutes)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                      ✓ On Time
                    </span>
                  )
                )}
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 block">Expected</span>
                  <span className="font-semibold text-gray-900">{load.expected_farm_arrival_time || EXPECTED_FARM_ARRIVAL_TIME}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Actual</span>
                  <span className="font-semibold text-gray-900">
                    {load.actual_farm_arrival_time 
                      ? format(new Date(load.actual_farm_arrival_time), 'HH:mm')
                      : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block">Difference</span>
                  <span className={`font-semibold ${load.farm_arrival_overtime_minutes > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {load.actual_farm_arrival_time ? formatDuration(load.farm_arrival_overtime_minutes || 0) : '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* Farm Departure */}
            <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-orange-800">Departure from Farm</h3>
                {load.actual_farm_departure_time && (
                  load.farm_departure_overtime_minutes > 0 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                      ⚠️ Overtime {formatDuration(load.farm_departure_overtime_minutes)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                      ✓ On Time
                    </span>
                  )
                )}
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 block">Expected</span>
                  <span className="font-semibold text-gray-900">{load.expected_farm_departure_time || EXPECTED_FARM_DEPARTURE_TIME}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Actual</span>
                  <span className="font-semibold text-gray-900">
                    {load.actual_farm_departure_time 
                      ? format(new Date(load.actual_farm_departure_time), 'HH:mm')
                      : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block">Difference</span>
                  <span className={`font-semibold ${load.farm_departure_overtime_minutes > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {load.actual_farm_departure_time ? formatDuration(load.farm_departure_overtime_minutes || 0) : '-'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Depot Times */}
        <div className="card p-6 border-l-4 border-l-blue-400">
          <div className="flex items-center gap-2 mb-4">
            <BuildingOffice2Icon className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-gray-900">Depot Times</h2>
          </div>
          
          <div className="space-y-4">
            {/* Depot Arrival */}
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-blue-800">Arrival at Depot</h3>
                {load.arrived_depot_time && load.estimated_arrival_time && (
                  (() => {
                    const expected = new Date(`${load.dispatch_date}T${load.estimated_arrival_time}`);
                    const actual = new Date(load.arrived_depot_time);
                    const diff = differenceInMinutes(actual, expected);
                    return diff > 5 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                        ⚠️ Late {formatDuration(diff)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                        ✓ On Time
                      </span>
                    );
                  })()
                )}
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 block">Expected</span>
                  <span className="font-semibold text-gray-900">{load.estimated_arrival_time || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Actual</span>
                  <span className="font-semibold text-gray-900">
                    {load.arrived_depot_time 
                      ? format(new Date(load.arrived_depot_time), 'HH:mm')
                      : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block">Difference</span>
                  <span className="font-semibold text-gray-600">
                    {load.arrived_depot_time && load.estimated_arrival_time
                      ? formatDuration(differenceInMinutes(
                          new Date(load.arrived_depot_time),
                          new Date(`${load.dispatch_date}T${load.estimated_arrival_time}`)
                        ))
                      : '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* Depot Departure */}
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-blue-800">Departure from Depot</h3>
                {load.departed_depot_time && load.expected_depot_departure_time && (
                  (() => {
                    const expected = new Date(`${load.dispatch_date}T${load.expected_depot_departure_time}`);
                    const actual = new Date(load.departed_depot_time);
                    const diff = differenceInMinutes(actual, expected);
                    return diff > 5 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                        ⚠️ Late {formatDuration(diff)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                        ✓ On Time
                      </span>
                    );
                  })()
                )}
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 block">Expected</span>
                  <span className="font-semibold text-gray-900">{load.expected_depot_departure_time || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Actual</span>
                  <span className="font-semibold text-gray-900">
                    {load.departed_depot_time 
                      ? format(new Date(load.departed_depot_time), 'HH:mm')
                      : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block">Difference</span>
                  <span className="font-semibold text-gray-600">
                    {load.departed_depot_time && load.expected_depot_departure_time
                      ? formatDuration(differenceInMinutes(
                          new Date(load.departed_depot_time),
                          new Date(`${load.dispatch_date}T${load.expected_depot_departure_time}`)
                        ))
                      : '-'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline & Duration */}
      <LoadTimeline load={load} />      {/* Packaging */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900">Packaging</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Product</th>
                <th className="text-right">Dispatched</th>
                <th className="text-right">Received</th>
                <th className="text-right">Damaged</th>
                <th className="text-right">Missing</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {packaging.map((pkg) => (
                <tr key={pkg.id}>
                  <td className="font-medium">{pkg.packaging_type_name}</td>
                  <td>
                    {pkg.product_type_name ? (
                      <div>
                        <span>{pkg.product_type_name}</span>
                        {pkg.product_variety_name && (
                          <span className="text-gray-500 text-xs ml-1">({pkg.product_variety_name})</span>
                        )}
                        {pkg.product_grade_name && (
                          <span className="text-gray-500 text-xs block">{pkg.product_grade_name}</span>
                        )}
                      </div>
                    ) : '-'}
                  </td>
                  <td className="text-right font-medium">{pkg.quantity_dispatched}</td>
                  <td className="text-right">
                    {pkg.quantity_received !== null ? pkg.quantity_received : '-'}
                  </td>
                  <td className="text-right">
                    {pkg.quantity_damaged > 0 ? (
                      <span className="text-red-600">{pkg.quantity_damaged}</span>
                    ) : '-'}
                  </td>
                  <td className="text-right">
                    {pkg.quantity_missing > 0 ? (
                      <span className="text-red-600">{pkg.quantity_missing}</span>
                    ) : '-'}
                  </td>
                  <td className="text-sm text-gray-500">{pkg.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Backload (Return Trip) */}
      {(load.backload_site_id || backloadPackaging.length > 0) && (
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">Backload (Return Trip)</h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                Returns
              </span>
            </div>
            {load.backload_site_name && (
              <p className="text-sm text-gray-500">From: {load.backload_site_name} ({load.backload_site_code})</p>
            )}
          </div>
          
          {backloadPackaging.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Packaging Type</th>
                    <th className="text-right">Quantity Returned</th>
                    <th className="text-right">Damaged</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {backloadPackaging.map((bp) => (
                    <tr key={bp.id}>
                      <td className="font-medium">{bp.packaging_type_name}</td>
                      <td className="text-right font-medium text-orange-600">{bp.quantity_returned}</td>
                      <td className="text-right">
                        {bp.quantity_damaged > 0 ? (
                          <span className="text-red-600">{bp.quantity_damaged}</span>
                        ) : '-'}
                      </td>
                      <td className="text-sm text-gray-500">{bp.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 text-gray-500 text-sm">
              No return packaging specified for this backload.
            </div>
          )}
          
          {load.backload_notes && (
            <div className="p-4 border-t border-gray-100">
              <p className="text-sm text-gray-500 mb-1">Backload Notes</p>
              <p className="text-gray-700">{load.backload_notes}</p>
            </div>
          )}
          
          {load.linked_load_number && (
            <div className="p-4 border-t border-gray-100 bg-blue-50">
              <p className="text-sm text-gray-500 mb-1">Linked to Next Load</p>
              <Link to={`/loads/${load.linked_load_id}`} className="text-primary-600 hover:underline font-medium">
                {load.linked_load_number} →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Notes & Discrepancy */}
      {(load.notes || load.discrepancy_notes) && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Notes</h2>
          {load.notes && (
            <div className="mb-4">
              <p className="text-sm text-gray-500 mb-1">General Notes</p>
              <p>{load.notes}</p>
            </div>
          )}
          {load.discrepancy_notes && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm font-medium text-red-800 mb-1">Discrepancy Notes</p>
              <p className="text-red-700">{load.discrepancy_notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Audit Info */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Audit Trail</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Created</p>
            <p className="font-medium">{load.created_by_name || 'System'}</p>
            <p className="text-gray-500">{format(new Date(load.created_at), 'MMM d, yyyy HH:mm')}</p>
          </div>
          {load.confirmed_farm_arrival_at && (
            <div>
              <p className="text-gray-500">Farm Arrival</p>
              <p className="font-medium">{load.confirmed_farm_arrival_by_name || 'User'}</p>
              <p className="text-gray-500">{format(new Date(load.confirmed_farm_arrival_at), 'MMM d, yyyy HH:mm')}</p>
              {load.farm_arrival_overtime_minutes > 0 && (
                <p className="text-orange-600 text-xs">+{formatDuration(load.farm_arrival_overtime_minutes)} overtime</p>
              )}
            </div>
          )}
          {load.confirmed_farm_departure_at && (
            <div>
              <p className="text-gray-500">Farm Departure</p>
              <p className="font-medium">{load.confirmed_farm_departure_by_name || 'User'}</p>
              <p className="text-gray-500">{format(new Date(load.confirmed_farm_departure_at), 'MMM d, yyyy HH:mm')}</p>
              {load.farm_departure_overtime_minutes > 0 && (
                <p className="text-orange-600 text-xs">+{formatDuration(load.farm_departure_overtime_minutes)} overtime</p>
              )}
            </div>
          )}
          {load.confirmed_dispatch_at && (
            <div>
              <p className="text-gray-500">Dispatched</p>
              <p className="font-medium">{load.confirmed_dispatch_by_name}</p>
              <p className="text-gray-500">{format(new Date(load.confirmed_dispatch_at), 'MMM d, yyyy HH:mm')}</p>
            </div>
          )}
          {load.confirmed_receipt_at && (
            <div>
              <p className="text-gray-500">Received</p>
              <p className="font-medium">{load.confirmed_receipt_by_name}</p>
              <p className="text-gray-500">{format(new Date(load.confirmed_receipt_at), 'MMM d, yyyy HH:mm')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Dispatch Modal */}
      {showDispatchModal && (
        <DispatchModal
          load={load}
          onClose={() => setShowDispatchModal(false)}
          onSubmit={handleDispatch}
          loading={actionLoading}
        />
      )}

      {/* Receive Modal */}
      {showReceiveModal && (
        <ReceiveModal
          load={load}
          packaging={packaging}
          onClose={() => setShowReceiveModal(false)}
          onSubmit={handleReceive}
          loading={actionLoading}
        />
      )}

      {/* Farm Arrival Modal */}
      {showFarmArrivalModal && (
        <FarmArrivalModal
          load={load}
          onClose={() => setShowFarmArrivalModal(false)}
          onSubmit={handleFarmArrival}
          loading={actionLoading}
        />
      )}

      {/* Farm Departure Modal */}
      {showFarmDepartureModal && (
        <FarmDepartureModal
          load={load}
          onClose={() => setShowFarmDepartureModal(false)}
          onSubmit={handleFarmDeparture}
          loading={actionLoading}
        />
      )}
    </div>
  );
}

/**
 * Receive modal component
 */
function ReceiveModal({ load, packaging, onClose, onSubmit, loading }) {
  const { register, handleSubmit, watch } = useForm({
    defaultValues: {
      arrivalDate: new Date().toISOString().split('T')[0],
      arrivalTime: format(new Date(), 'HH:mm')
    }
  });

  /** @param {object} data */
  const handleFormSubmit = (data) => {
    const actualArrivalTime = new Date(`${data.arrivalDate}T${data.arrivalTime}`).toISOString();
    onSubmit({ ...data, actualArrivalTime });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 py-8">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose}></div>
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmit(handleFormSubmit)}>
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Confirm Receipt</h3>
              <p className="text-sm text-gray-500 mt-1">Load {load.load_number}</p>
              {load.estimated_arrival_time && (
                <p className="text-sm text-gray-500">Expected: {load.estimated_arrival_time}</p>
              )}
            </div>

            <div className="p-6">
              <table className="data-table mb-6">
                <thead>
                  <tr>
                    <th>Packaging Type</th>
                    <th className="text-center">Dispatched</th>
                    <th className="text-center">Received</th>
                    <th className="text-center">Damaged</th>
                  </tr>
                </thead>
                <tbody>
                  {packaging.map((pkg) => (
                    <tr key={pkg.id}>
                      <td className="font-medium">{pkg.packaging_type_name}</td>
                      <td className="text-center">{pkg.quantity_dispatched}</td>
                      <td className="text-center">
                        <input
                          type="number"
                          className="form-input w-20 text-center"
                          defaultValue={pkg.quantity_dispatched}
                          min="0"
                          {...register(`received_${pkg.id}`)}
                        />
                      </td>
                      <td className="text-center">
                        <input
                          type="number"
                          className="form-input w-20 text-center"
                          defaultValue="0"
                          min="0"
                          {...register(`damaged_${pkg.id}`)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="form-label">Arrival Date</label>
                  <input
                    type="date"
                    className="form-input"
                    defaultValue={new Date().toISOString().split('T')[0]}
                    {...register('arrivalDate')}
                  />
                </div>
                <div>
                  <label className="form-label">Arrival Time</label>
                  <input
                    type="time"
                    className="form-input"
                    defaultValue={format(new Date(), 'HH:mm')}
                    {...register('arrivalTime')}
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Discrepancy Notes (if any)</label>
                <textarea
                  className="form-input"
                  rows="3"
                  placeholder="Describe any issues with the delivery..."
                  {...register('discrepancyNotes')}
                ></textarea>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
              <button type="button" onClick={onClose} className="btn btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="btn btn-primary">
                {loading ? 'Processing...' : 'Confirm Receipt'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * Farm Arrival Modal - captures actual arrival time at farm
 * Expected arrival time for BV and CBC farms is 14:00
 * @param {{ load: object; onClose: () => void; onSubmit: (data: { actualFarmArrivalTime: string }) => void; loading: boolean }} props
 */
function FarmArrivalModal({ load, onClose, onSubmit, loading }) {
  const { register, handleSubmit } = useForm({
    defaultValues: {
      arrivalDate: new Date().toISOString().split('T')[0],
      arrivalTime: format(new Date(), 'HH:mm')
    }
  });

  const expectedTime = load.expected_farm_arrival_time || EXPECTED_FARM_ARRIVAL_TIME;

  /** @param {object} data */
  const handleFormSubmit = (data) => {
    const actualFarmArrivalTime = new Date(`${data.arrivalDate}T${data.arrivalTime}`).toISOString();
    onSubmit({ actualFarmArrivalTime });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose}></div>
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full">
          <form onSubmit={handleSubmit(handleFormSubmit)}>
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Record Farm Arrival</h3>
              <p className="text-sm text-gray-500 mt-1">Load {load.load_number}</p>
            </div>

            <div className="p-6">
              <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-sm text-orange-800">
                  <strong>Expected Arrival Time:</strong> {expectedTime}
                </p>
                <p className="text-xs text-orange-600 mt-1">
                  Arrivals after {expectedTime} will be flagged as overtime.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Arrival Date</label>
                  <input
                    type="date"
                    className="form-input"
                    {...register('arrivalDate')}
                  />
                </div>
                <div>
                  <label className="form-label">Actual Arrival Time</label>
                  <input
                    type="time"
                    className="form-input"
                    {...register('arrivalTime')}
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
              <button type="button" onClick={onClose} className="btn btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="btn btn-primary">
                {loading ? 'Recording...' : 'Record Arrival'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * Farm Departure Modal - captures actual departure time from farm
 * Expected departure time for BV and CBC farms is 17:00
 * @param {{ load: object; onClose: () => void; onSubmit: (data: { actualFarmDepartureTime: string }) => void; loading: boolean }} props
 */
function FarmDepartureModal({ load, onClose, onSubmit, loading }) {
  const { register, handleSubmit } = useForm({
    defaultValues: {
      departureDate: new Date().toISOString().split('T')[0],
      departureTime: format(new Date(), 'HH:mm')
    }
  });

  const expectedTime = load.expected_farm_departure_time || EXPECTED_FARM_DEPARTURE_TIME;

  /** @param {object} data */
  const handleFormSubmit = (data) => {
    const actualFarmDepartureTime = new Date(`${data.departureDate}T${data.departureTime}`).toISOString();
    onSubmit({ actualFarmDepartureTime });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose}></div>
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full">
          <form onSubmit={handleSubmit(handleFormSubmit)}>
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Record Farm Departure</h3>
              <p className="text-sm text-gray-500 mt-1">Load {load.load_number}</p>
            </div>

            <div className="p-6">
              <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-sm text-orange-800">
                  <strong>Expected Departure Time:</strong> {expectedTime}
                </p>
                <p className="text-xs text-orange-600 mt-1">
                  Departures after {expectedTime} will be flagged as overtime.
                </p>
              </div>

              {load.actual_farm_arrival_time && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Arrived at Farm:</strong> {format(new Date(load.actual_farm_arrival_time), 'MMM d, yyyy HH:mm')}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Departure Date</label>
                  <input
                    type="date"
                    className="form-input"
                    {...register('departureDate')}
                  />
                </div>
                <div>
                  <label className="form-label">Actual Departure Time</label>
                  <input
                    type="time"
                    className="form-input"
                    {...register('departureTime')}
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
              <button type="button" onClick={onClose} className="btn btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="btn btn-primary">
                {loading ? 'Recording...' : 'Record Departure'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * Dispatch modal component with actual departure time input
 * @param {{ load: object; onClose: () => void; onSubmit: (data: object) => void; loading: boolean }} props
 */
function DispatchModal({ load, onClose, onSubmit, loading }) {
  const { register, handleSubmit, watch } = useForm({
    defaultValues: {
      departureDate: new Date().toISOString().split('T')[0],
      departureTime: format(new Date(), 'HH:mm')
    }
  });

  /** @param {object} data */
  const handleFormSubmit = (data) => {
    const actualDepartureTime = new Date(`${data.departureDate}T${data.departureTime}`).toISOString();
    onSubmit({ actualDepartureTime });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose}></div>
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full">
          <form onSubmit={handleSubmit(handleFormSubmit)}>
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Confirm Dispatch</h3>
              <p className="text-sm text-gray-500 mt-1">Load {load.load_number}</p>
            </div>

            <div className="p-6">
              <p className="text-gray-600 mb-4">
                Confirm dispatch for this load. This will deduct the packaging from the origin site inventory.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Departure Date</label>
                  <input
                    type="date"
                    className="form-input"
                    {...register('departureDate')}
                  />
                </div>
                <div>
                  <label className="form-label">Departure Time</label>
                  <input
                    type="time"
                    className="form-input"
                    {...register('departureTime')}
                  />
                </div>
              </div>

              {load.scheduled_departure_time && (
                <p className="mt-3 text-sm text-gray-500">
                  Scheduled departure: {load.scheduled_departure_time}
                </p>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
              <button type="button" onClick={onClose} className="btn btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="btn btn-primary">
                {loading ? 'Dispatching...' : 'Confirm Dispatch'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default LoadDetail;
