import express from 'express';
import { body, validationResult } from 'express-validator';
import { supabase } from '../db/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/planner/schedules
 * Get dispatch schedules with filtering
 */
router.get('/schedules', authenticate, async (req, res, next) => {
  try {
    const { startDate, endDate, originSiteId, destinationSiteId, channelId, status } = req.query;

    let query = supabase
      .from('dispatch_schedules')
      .select(`
        *,
        origin_site:sites!dispatch_schedules_origin_site_id_fkey (id, code, name),
        destination_site:sites!dispatch_schedules_destination_site_id_fkey (id, code, name),
        channels (id, code, name),
        vehicles (id, registration, name),
        drivers (id, first_name, last_name),
        loads (id, load_number, status)
      `)
      .order('dispatch_date', { ascending: true })
      .order('dispatch_time', { ascending: true });

    if (startDate) query = query.gte('dispatch_date', startDate);
    if (endDate) query = query.lte('dispatch_date', endDate);
    if (originSiteId) query = query.eq('origin_site_id', originSiteId);
    if (destinationSiteId) query = query.eq('destination_site_id', destinationSiteId);
    if (channelId) query = query.eq('channel_id', channelId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;

    if (error) throw error;

    const schedules = data.map(s => ({
      ...s,
      origin_code: s.origin_site?.code,
      origin_name: s.origin_site?.name,
      destination_code: s.destination_site?.code,
      destination_name: s.destination_site?.name,
      channel_code: s.channels?.code,
      channel_name: s.channels?.name,
      vehicle_registration: s.vehicles?.registration,
      vehicle_name: s.vehicles?.name,
      driver_name: s.drivers ? `${s.drivers.first_name} ${s.drivers.last_name}` : null,
      load_number: s.loads?.load_number,
      load_status: s.loads?.status
    }));

    res.json({ schedules });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/planner/schedules/week
 * Get schedules for a specific week
 */
router.get('/schedules/week', authenticate, async (req, res, next) => {
  try {
    const { weekStart } = req.query;
    
    // Default to current week
    const startDate = weekStart || getWeekStart(new Date());
    const endDate = addDays(new Date(startDate), 6).toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('dispatch_schedules')
      .select(`
        *,
        origin_site:sites!dispatch_schedules_origin_site_id_fkey (id, code, name),
        destination_site:sites!dispatch_schedules_destination_site_id_fkey (id, code, name),
        channels (id, code, name),
        vehicles (id, registration, name),
        drivers (id, first_name, last_name)
      `)
      .gte('dispatch_date', startDate)
      .lte('dispatch_date', endDate)
      .order('dispatch_date', { ascending: true })
      .order('dispatch_time', { ascending: true });

    if (error) throw error;

    // Group by day
    const byDay = {};
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    data.forEach(schedule => {
      const date = schedule.dispatch_date;
      const dayName = days[new Date(date).getDay()];
      
      if (!byDay[date]) {
        byDay[date] = { date, dayName, schedules: [] };
      }
      
      byDay[date].schedules.push({
        ...schedule,
        origin_code: schedule.origin_site?.code,
        origin_name: schedule.origin_site?.name,
        destination_code: schedule.destination_site?.code,
        destination_name: schedule.destination_site?.name,
        channel_code: schedule.channels?.code,
        channel_name: schedule.channels?.name,
        vehicle_registration: schedule.vehicles?.registration,
        driver_name: schedule.drivers ? `${schedule.drivers.first_name} ${schedule.drivers.last_name}` : null
      });
    });

    res.json({ 
      weekStart: startDate,
      weekEnd: endDate,
      days: Object.values(byDay).sort((a, b) => new Date(a.date) - new Date(b.date))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/planner/schedules/:id
 * Get single schedule
 */
router.get('/schedules/:id', authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('dispatch_schedules')
      .select(`
        *,
        origin_site:sites!dispatch_schedules_origin_site_id_fkey (id, code, name),
        destination_site:sites!dispatch_schedules_destination_site_id_fkey (id, code, name),
        channels (id, code, name),
        vehicles (id, registration, name),
        drivers (id, first_name, last_name),
        loads (id, load_number, status)
      `)
      .eq('id', req.params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Schedule not found' } });
      }
      throw error;
    }

    res.json({ schedule: data });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/planner/schedules
 * Create a new dispatch schedule
 */
router.post('/schedules', authenticate, authorize('admin', 'dispatcher'), [
  body('dispatchDate').isISO8601(),
  body('expectedArrivalDate').isISO8601(),
  body('originSiteId').isUUID(),
  body('destinationSiteId').isUUID()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      dispatchDate, dispatchTime, expectedArrivalDate, expectedArrivalTime,
      originSiteId, destinationSiteId, channelId,
      cratesCount, binsCount, boxesCount, palletsCount,
      packagingEtaFarm, packagingSuppliedDate, ripeningStartDate,
      salesDespatchDate, packagingCollectionDate, packagingDeliveryFarmDate,
      vehicleId, driverId, customerName, productType, notes,
      isRecurring, recurrencePattern, recurrenceDayOfWeek
    } = req.body;

    const { data, error } = await supabase
      .from('dispatch_schedules')
      .insert({
        dispatch_date: dispatchDate,
        dispatch_time: dispatchTime || null,
        expected_arrival_date: expectedArrivalDate,
        expected_arrival_time: expectedArrivalTime || null,
        origin_site_id: originSiteId,
        destination_site_id: destinationSiteId,
        channel_id: channelId || null,
        crates_count: cratesCount || 0,
        bins_count: binsCount || 0,
        boxes_count: boxesCount || 0,
        pallets_count: palletsCount || 0,
        packaging_eta_farm: packagingEtaFarm || null,
        packaging_supplied_date: packagingSuppliedDate || null,
        ripening_start_date: ripeningStartDate || null,
        sales_despatch_date: salesDespatchDate || null,
        packaging_collection_date: packagingCollectionDate || null,
        packaging_delivery_farm_date: packagingDeliveryFarmDate || null,
        vehicle_id: vehicleId || null,
        driver_id: driverId || null,
        customer_name: customerName || null,
        product_type: productType || null,
        notes: notes || null,
        is_recurring: isRecurring || false,
        recurrence_pattern: recurrencePattern || null,
        recurrence_day_of_week: recurrenceDayOfWeek || null,
        status: 'planned',
        created_by: req.user?.id || null
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ schedule: data });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/planner/schedules/:id
 * Update a dispatch schedule
 */
router.put('/schedules/:id', authenticate, authorize('admin', 'dispatcher'), async (req, res, next) => {
  try {
    const {
      dispatchDate, dispatchTime, expectedArrivalDate, expectedArrivalTime,
      originSiteId, destinationSiteId, channelId,
      cratesCount, binsCount, boxesCount, palletsCount,
      packagingEtaFarm, packagingSuppliedDate, ripeningStartDate,
      salesDespatchDate, packagingCollectionDate, packagingDeliveryFarmDate,
      vehicleId, driverId, customerName, productType, notes, status
    } = req.body;

    const updateData = { updated_at: new Date().toISOString() };
    
    if (dispatchDate !== undefined) updateData.dispatch_date = dispatchDate;
    if (dispatchTime !== undefined) updateData.dispatch_time = dispatchTime;
    if (expectedArrivalDate !== undefined) updateData.expected_arrival_date = expectedArrivalDate;
    if (expectedArrivalTime !== undefined) updateData.expected_arrival_time = expectedArrivalTime;
    if (originSiteId !== undefined) updateData.origin_site_id = originSiteId;
    if (destinationSiteId !== undefined) updateData.destination_site_id = destinationSiteId;
    if (channelId !== undefined) updateData.channel_id = channelId;
    if (cratesCount !== undefined) updateData.crates_count = cratesCount;
    if (binsCount !== undefined) updateData.bins_count = binsCount;
    if (boxesCount !== undefined) updateData.boxes_count = boxesCount;
    if (palletsCount !== undefined) updateData.pallets_count = palletsCount;
    if (packagingEtaFarm !== undefined) updateData.packaging_eta_farm = packagingEtaFarm;
    if (packagingSuppliedDate !== undefined) updateData.packaging_supplied_date = packagingSuppliedDate;
    if (ripeningStartDate !== undefined) updateData.ripening_start_date = ripeningStartDate;
    if (salesDespatchDate !== undefined) updateData.sales_despatch_date = salesDespatchDate;
    if (packagingCollectionDate !== undefined) updateData.packaging_collection_date = packagingCollectionDate;
    if (packagingDeliveryFarmDate !== undefined) updateData.packaging_delivery_farm_date = packagingDeliveryFarmDate;
    if (vehicleId !== undefined) updateData.vehicle_id = vehicleId;
    if (driverId !== undefined) updateData.driver_id = driverId;
    if (customerName !== undefined) updateData.customer_name = customerName;
    if (productType !== undefined) updateData.product_type = productType;
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) updateData.status = status;
    
    updateData.updated_by = req.user?.id || null;

    const { data, error } = await supabase
      .from('dispatch_schedules')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Schedule not found' } });
      }
      throw error;
    }

    res.json({ schedule: data });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/planner/schedules/:id
 * Delete a dispatch schedule
 */
router.delete('/schedules/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('dispatch_schedules')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ message: 'Schedule deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/planner/schedules/:id/create-load
 * Convert schedule to actual load
 */
router.post('/schedules/:id/create-load', authenticate, authorize('admin', 'dispatcher'), async (req, res, next) => {
  try {
    // Get schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from('dispatch_schedules')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (scheduleError) {
      if (scheduleError.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Schedule not found' } });
      }
      throw scheduleError;
    }

    if (schedule.load_id) {
      return res.status(400).json({ error: { message: 'Load already created for this schedule' } });
    }

    // Get origin site code for load number
    const { data: originSite } = await supabase
      .from('sites')
      .select('code')
      .eq('id', schedule.origin_site_id)
      .single();

    // Generate load number
    const date = new Date(schedule.dispatch_date);
    const prefix = `${originSite.code}${date.getFullYear().toString().slice(-2)}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
    
    const { data: existingLoads } = await supabase
      .from('loads')
      .select('load_number')
      .like('load_number', `${prefix}%`)
      .order('load_number', { ascending: false })
      .limit(1);

    let loadNumber = prefix;
    if (existingLoads && existingLoads.length > 0) {
      const lastNumber = existingLoads[0].load_number;
      const suffix = lastNumber.replace(prefix, '');
      if (!suffix) {
        loadNumber = prefix + 'A';
      } else {
        loadNumber = prefix + String.fromCharCode(suffix.charCodeAt(0) + 1);
      }
    }

    // Create load
    const { data: load, error: loadError } = await supabase
      .from('loads')
      .insert({
        load_number: loadNumber,
        origin_site_id: schedule.origin_site_id,
        destination_site_id: schedule.destination_site_id,
        channel_id: schedule.channel_id,
        vehicle_id: schedule.vehicle_id,
        driver_id: schedule.driver_id,
        dispatch_date: schedule.dispatch_date,
        scheduled_departure_time: schedule.dispatch_time,
        expected_arrival_date: schedule.expected_arrival_date,
        estimated_arrival_time: schedule.expected_arrival_time,
        notes: schedule.notes,
        status: 'scheduled',
        created_by: req.user?.id || null
      })
      .select()
      .single();

    if (loadError) throw loadError;

    // Create load packaging items
    const packagingItems = [];
    
    if (schedule.crates_count > 0) {
      const { data: crateType } = await supabase
        .from('packaging_types')
        .select('id')
        .ilike('code', '%CRATE%')
        .limit(1)
        .single();
      
      if (crateType) {
        packagingItems.push({
          load_id: load.id,
          packaging_type_id: crateType.id,
          quantity_dispatched: schedule.crates_count
        });
      }
    }

    if (schedule.bins_count > 0) {
      const { data: binType } = await supabase
        .from('packaging_types')
        .select('id')
        .ilike('code', '%BIN%')
        .limit(1)
        .single();
      
      if (binType) {
        packagingItems.push({
          load_id: load.id,
          packaging_type_id: binType.id,
          quantity_dispatched: schedule.bins_count
        });
      }
    }

    if (packagingItems.length > 0) {
      await supabase.from('load_packaging').insert(packagingItems);
    }

    // Link schedule to load
    await supabase
      .from('dispatch_schedules')
      .update({ 
        load_id: load.id, 
        status: 'confirmed',
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id);

    res.status(201).json({ load, loadNumber });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/planner/packaging-demand
 * Get packaging demand summary for a date range
 */
router.get('/packaging-demand', authenticate, async (req, res, next) => {
  try {
    const { startDate, endDate, originSiteId } = req.query;

    let query = supabase
      .from('dispatch_schedules')
      .select(`
        dispatch_date, origin_site_id,
        crates_count, bins_count, boxes_count, pallets_count,
        origin_site:sites!dispatch_schedules_origin_site_id_fkey (code, name)
      `)
      .neq('status', 'cancelled');

    if (startDate) query = query.gte('dispatch_date', startDate);
    if (endDate) query = query.lte('dispatch_date', endDate);
    if (originSiteId) query = query.eq('origin_site_id', originSiteId);

    const { data, error } = await query;

    if (error) throw error;

    // Aggregate by site
    const demandBySite = {};
    data.forEach(schedule => {
      const siteId = schedule.origin_site_id;
      if (!demandBySite[siteId]) {
        demandBySite[siteId] = {
          site_id: siteId,
          site_code: schedule.origin_site?.code,
          site_name: schedule.origin_site?.name,
          total_crates: 0,
          total_bins: 0,
          total_boxes: 0,
          total_pallets: 0,
          dispatch_count: 0
        };
      }
      demandBySite[siteId].total_crates += schedule.crates_count || 0;
      demandBySite[siteId].total_bins += schedule.bins_count || 0;
      demandBySite[siteId].total_boxes += schedule.boxes_count || 0;
      demandBySite[siteId].total_pallets += schedule.pallets_count || 0;
      demandBySite[siteId].dispatch_count++;
    });

    res.json({ demand: Object.values(demandBySite) });
  } catch (error) {
    next(error);
  }
});

// Helper functions
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export default router;
