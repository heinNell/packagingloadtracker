import express from 'express';
import { body, validationResult } from 'express-validator';
import { supabase } from '../db/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

/**
 * Generate load number based on farm code and date
 */
async function generateLoadNumber(farmCode, dispatchDate) {
  const date = new Date(dispatchDate);
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  const prefix = `${farmCode}${year}${month}${day}`;
  
  const { data } = await supabase
    .from('loads')
    .select('load_number')
    .like('load_number', `${prefix}%`)
    .order('load_number', { ascending: false })
    .limit(1);

  if (!data || data.length === 0) {
    return prefix;
  }

  const lastNumber = data[0].load_number;
  const suffix = lastNumber.replace(prefix, '');
  
  if (!suffix) {
    return prefix + 'A';
  }
  
  const nextChar = String.fromCharCode(suffix.charCodeAt(0) + 1);
  return prefix + nextChar;
}

/**
 * GET /api/loads
 * Get loads with filtering
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { 
      status, originSiteId, destinationSiteId, 
      startDate, endDate, vehicleId, driverId,
      channelId, hasDiscrepancy, hasOvertime, limit = 50, offset = 0 
    } = req.query;
    
    let query = supabase
      .from('loads')
      .select(`
        *,
        origin_site:sites!loads_origin_site_id_fkey (id, code, name),
        destination_site:sites!loads_destination_site_id_fkey (id, code, name),
        backload_site:sites!loads_backload_site_id_fkey (id, code, name),
        vehicles (id, name, registration),
        drivers (id, first_name, last_name),
        channels (id, name),
        load_packaging (
          id, packaging_type_id, quantity_dispatched, quantity_received, quantity_damaged, quantity_missing,
          packaging_types (id, code, name)
        ),
        backload_packaging (
          id, packaging_type_id, quantity_returned, quantity_damaged,
          packaging_types (id, code, name)
        )
      `, { count: 'exact' })
      .order('dispatch_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) query = query.eq('status', status);
    if (originSiteId) query = query.eq('origin_site_id', originSiteId);
    if (destinationSiteId) query = query.eq('destination_site_id', destinationSiteId);
    if (startDate) query = query.gte('dispatch_date', startDate);
    if (endDate) query = query.lte('dispatch_date', endDate);
    if (vehicleId) query = query.eq('vehicle_id', vehicleId);
    if (driverId) query = query.eq('driver_id', driverId);
    if (channelId) query = query.eq('channel_id', channelId);
    if (hasDiscrepancy !== undefined) query = query.eq('has_discrepancy', hasDiscrepancy === 'true');
    if (hasOvertime !== undefined) query = query.eq('has_overtime', hasOvertime === 'true');

    const { data, error, count } = await query;

    if (error) throw error;

    const loads = data.map(l => ({
      ...l,
      origin_site_name: l.origin_site?.name,
      origin_site_code: l.origin_site?.code,
      destination_site_name: l.destination_site?.name,
      destination_site_code: l.destination_site?.code,
      backload_site_name: l.backload_site?.name,
      backload_site_code: l.backload_site?.code,
      vehicle_name: l.vehicles?.name,
      vehicle_registration: l.vehicles?.registration,
      driver_name: l.drivers ? `${l.drivers.first_name} ${l.drivers.last_name}` : null,
      channel_name: l.channels?.name,
      packaging: l.load_packaging?.map(lp => ({
        id: lp.id,
        packaging_type_id: lp.packaging_type_id,
        packaging_type_name: lp.packaging_types?.name,
        packaging_type_code: lp.packaging_types?.code,
        quantity_dispatched: lp.quantity_dispatched,
        quantity_received: lp.quantity_received,
        quantity_damaged: lp.quantity_damaged,
        quantity_missing: lp.quantity_missing
      })),
      backload_packaging: l.backload_packaging?.map(bp => ({
        id: bp.id,
        packaging_type_id: bp.packaging_type_id,
        packaging_type_name: bp.packaging_types?.name,
        packaging_type_code: bp.packaging_types?.code,
        quantity_returned: bp.quantity_returned,
        quantity_damaged: bp.quantity_damaged
      }))
    }));

    res.json({ 
      loads,
      pagination: {
        total: count || 0,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/loads/tracking/active
 * Get active loads with vehicle telematics info for live tracking overlay
 */
router.get('/tracking/active', authenticate, async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('loads')
      .select(`
        id,
        load_number,
        dispatch_date,
        status,
        expected_farm_arrival_time,
        actual_farm_arrival_time,
        expected_depot_arrival_time,
        actual_depot_arrival_time,
        origin_site:sites!loads_origin_site_id_fkey (id, code, name, latitude, longitude),
        destination_site:sites!loads_destination_site_id_fkey (id, code, name, latitude, longitude),
        vehicles (id, name, registration, telematics_asset_id, telematics_asset_code),
        drivers (id, first_name, last_name, phone)
      `)
      .in('status', ['scheduled', 'loading', 'departed', 'in_transit', 'arrived_depot'])
      .gte('dispatch_date', yesterday)
      .lte('dispatch_date', today)
      .order('dispatch_date', { ascending: false });

    if (error) throw error;

    const activeLoads = data.map(l => ({
      loadId: l.id,
      loadNumber: l.load_number,
      dispatchDate: l.dispatch_date,
      status: l.status,
      expectedFarmArrival: l.expected_farm_arrival_time,
      actualFarmArrival: l.actual_farm_arrival_time,
      expectedDepotArrival: l.expected_depot_arrival_time,
      actualDepotArrival: l.actual_depot_arrival_time,
      origin: l.origin_site ? {
        id: l.origin_site.id,
        code: l.origin_site.code,
        name: l.origin_site.name,
        latitude: l.origin_site.latitude,
        longitude: l.origin_site.longitude
      } : null,
      destination: l.destination_site ? {
        id: l.destination_site.id,
        code: l.destination_site.code,
        name: l.destination_site.name,
        latitude: l.destination_site.latitude,
        longitude: l.destination_site.longitude
      } : null,
      vehicle: l.vehicles ? {
        id: l.vehicles.id,
        name: l.vehicles.name,
        registration: l.vehicles.registration,
        telematicsAssetId: l.vehicles.telematics_asset_id,
        telematicsAssetCode: l.vehicles.telematics_asset_code
      } : null,
      driver: l.drivers ? {
        id: l.drivers.id,
        name: `${l.drivers.first_name} ${l.drivers.last_name}`,
        phone: l.drivers.phone
      } : null
    }));

    res.json({ activeLoads });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/loads/:id
 * Get single load by ID
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { data: load, error } = await supabase
      .from('loads')
      .select(`
        *,
        origin_site:sites!loads_origin_site_id_fkey (id, code, name),
        destination_site:sites!loads_destination_site_id_fkey (id, code, name),
        backload_site:sites!loads_backload_site_id_fkey (id, code, name),
        linked_load:loads!loads_linked_load_id_fkey (id, load_number),
        vehicles (id, name, registration),
        drivers (id, first_name, last_name),
        channels (id, name),
        created_by_user:users!loads_created_by_fkey (first_name, last_name),
        confirmed_dispatch_user:users!loads_confirmed_dispatch_by_fkey (first_name, last_name),
        confirmed_receipt_user:users!loads_confirmed_receipt_by_fkey (first_name, last_name)
      `)
      .eq('id', req.params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Load not found' } });
      }
      throw error;
    }

    // Get packaging details
    const { data: packaging, error: packError } = await supabase
      .from('load_packaging')
      .select(`
        *,
        packaging_types (id, code, name),
        product_types (id, code, name),
        product_varieties (id, code, name),
        product_grades (id, code, name)
      `)
      .eq('load_id', req.params.id);

    if (packError) throw packError;

    // Get backload packaging details
    const { data: backloadPackaging, error: backloadError } = await supabase
      .from('backload_packaging')
      .select(`
        *,
        packaging_types (id, code, name)
      `)
      .eq('load_id', req.params.id);

    if (backloadError) throw backloadError;

    const formattedLoad = {
      ...load,
      origin_site_name: load.origin_site?.name,
      origin_site_code: load.origin_site?.code,
      destination_site_name: load.destination_site?.name,
      destination_site_code: load.destination_site?.code,
      backload_site_name: load.backload_site?.name,
      backload_site_code: load.backload_site?.code,
      linked_load_number: load.linked_load?.load_number,
      linked_load_id: load.linked_load?.id,
      vehicle_name: load.vehicles?.name,
      vehicle_registration: load.vehicles?.registration,
      driver_name: load.drivers ? `${load.drivers.first_name} ${load.drivers.last_name}` : null,
      channel_name: load.channels?.name,
      created_by_name: load.created_by_user ? `${load.created_by_user.first_name} ${load.created_by_user.last_name}` : null,
      confirmed_dispatch_by_name: load.confirmed_dispatch_user ? `${load.confirmed_dispatch_user.first_name} ${load.confirmed_dispatch_user.last_name}` : null,
      confirmed_receipt_by_name: load.confirmed_receipt_user ? `${load.confirmed_receipt_user.first_name} ${load.confirmed_receipt_user.last_name}` : null
    };

    const formattedPackaging = packaging.map(p => ({
      ...p,
      packaging_type_name: p.packaging_types?.name,
      packaging_type_code: p.packaging_types?.code,
      product_type_name: p.product_types?.name,
      product_variety_name: p.product_varieties?.name,
      product_grade_name: p.product_grades?.name
    }));

    const formattedBackloadPackaging = backloadPackaging.map(bp => ({
      ...bp,
      packaging_type_name: bp.packaging_types?.name,
      packaging_type_code: bp.packaging_types?.code
    }));

    res.json({ 
      load: formattedLoad,
      packaging: formattedPackaging,
      backloadPackaging: formattedBackloadPackaging
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/loads
 * Create a new load
 */
router.post('/', authenticate, authorize('admin', 'dispatcher', 'farm_user'), [
  body('originSiteId').isUUID(),
  body('destinationSiteId').isUUID(),
  body('dispatchDate').isISO8601(),
  body('packaging').isArray({ min: 1 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      originSiteId, destinationSiteId, channelId, vehicleId, driverId,
      dispatchDate, scheduledDepartureTime, estimatedArrivalTime,
      expectedFarmArrivalTime, expectedFarmDepartureTime,
      expectedDepotArrivalTime, expectedDepotDepartureTime,
      backloadSiteId, backloadNotes, linkedLoadId,
      notes, packaging, backloadPackaging
    } = req.body;

    // Get origin site code for load number
    const { data: originSite, error: siteError } = await supabase
      .from('sites')
      .select('code')
      .eq('id', originSiteId)
      .single();

    if (siteError) throw siteError;

    const loadNumber = await generateLoadNumber(originSite.code, dispatchDate);

    // Create load
    const { data: load, error: loadError } = await supabase
      .from('loads')
      .insert({
        load_number: loadNumber,
        origin_site_id: originSiteId,
        destination_site_id: destinationSiteId,
        channel_id: channelId || null,
        vehicle_id: vehicleId || null,
        driver_id: driverId || null,
        dispatch_date: dispatchDate,
        scheduled_departure_time: scheduledDepartureTime || null,
        estimated_arrival_time: estimatedArrivalTime || null,
        // Farm times (default to 14:00 and 17:00 for BV/CBC)
        expected_farm_arrival_time: expectedFarmArrivalTime || '14:00',
        expected_farm_departure_time: expectedFarmDepartureTime || '17:00',
        // Depot times
        expected_depot_arrival_time: expectedDepotArrivalTime || null,
        expected_depot_departure_time: expectedDepotDepartureTime || null,
        // Backload info
        backload_site_id: backloadSiteId || null,
        backload_notes: backloadNotes || null,
        linked_load_id: linkedLoadId || null,
        notes,
        status: 'scheduled',
        created_by: req.user?.id || null
      })
      .select()
      .single();

    if (loadError) throw loadError;

    // Insert packaging items
    const packagingItems = packaging.map(p => ({
      load_id: load.id,
      packaging_type_id: p.packagingTypeId,
      product_type_id: p.productTypeId || null,
      product_variety_id: p.productVarietyId || null,
      product_grade_id: p.productGradeId || null,
      quantity_dispatched: p.quantity,
      weight_kg: p.weightKg || null,
      notes: p.notes || null
    }));

    const { error: packError } = await supabase
      .from('load_packaging')
      .insert(packagingItems);

    if (packError) throw packError;

    // Insert backload packaging items if provided
    if (backloadPackaging && backloadPackaging.length > 0) {
      const backloadItems = backloadPackaging.map(bp => ({
        load_id: load.id,
        packaging_type_id: bp.packagingTypeId,
        quantity_returned: bp.quantityReturned || bp.quantity || 0,
        quantity_damaged: bp.quantityDamaged || 0,
        notes: bp.notes || null
      }));

      const { error: backloadError } = await supabase
        .from('backload_packaging')
        .insert(backloadItems);

      if (backloadError) throw backloadError;
    }

    res.status(201).json({ load, loadNumber });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/loads/:id
 * Update a load
 */
router.put('/:id', authenticate, authorize('admin', 'dispatcher', 'farm_user'), async (req, res, next) => {
  try {
    const { 
      originSiteId, destinationSiteId, channelId, vehicleId, driverId,
      dispatchDate, scheduledDepartureTime, estimatedArrivalTime,
      expectedFarmArrivalTime, expectedFarmDepartureTime,
      expectedDepotArrivalTime, expectedDepotDepartureTime,
      backloadSiteId, backloadNotes, linkedLoadId,
      notes, status, backloadPackaging
    } = req.body;

    const updateData = { updated_at: new Date().toISOString() };
    if (originSiteId !== undefined) updateData.origin_site_id = originSiteId;
    if (destinationSiteId !== undefined) updateData.destination_site_id = destinationSiteId;
    if (channelId !== undefined) updateData.channel_id = channelId;
    if (vehicleId !== undefined) updateData.vehicle_id = vehicleId;
    if (driverId !== undefined) updateData.driver_id = driverId;
    if (dispatchDate !== undefined) updateData.dispatch_date = dispatchDate;
    if (scheduledDepartureTime !== undefined) updateData.scheduled_departure_time = scheduledDepartureTime;
    if (estimatedArrivalTime !== undefined) updateData.estimated_arrival_time = estimatedArrivalTime;
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) updateData.status = status;
    // Farm times
    if (expectedFarmArrivalTime !== undefined) updateData.expected_farm_arrival_time = expectedFarmArrivalTime;
    if (expectedFarmDepartureTime !== undefined) updateData.expected_farm_departure_time = expectedFarmDepartureTime;
    // Depot times
    if (expectedDepotArrivalTime !== undefined) updateData.expected_depot_arrival_time = expectedDepotArrivalTime;
    if (expectedDepotDepartureTime !== undefined) updateData.expected_depot_departure_time = expectedDepotDepartureTime;
    // Backload info
    if (backloadSiteId !== undefined) updateData.backload_site_id = backloadSiteId || null;
    if (backloadNotes !== undefined) updateData.backload_notes = backloadNotes;
    if (linkedLoadId !== undefined) updateData.linked_load_id = linkedLoadId || null;

    const { data, error } = await supabase
      .from('loads')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Load not found' } });
      }
      throw error;
    }

    // Update backload packaging if provided
    if (backloadPackaging !== undefined) {
      // Delete existing backload packaging
      await supabase
        .from('backload_packaging')
        .delete()
        .eq('load_id', req.params.id);

      // Insert new backload packaging
      if (backloadPackaging && backloadPackaging.length > 0) {
        const backloadItems = backloadPackaging.map(bp => ({
          load_id: req.params.id,
          packaging_type_id: bp.packagingTypeId,
          quantity_returned: bp.quantityReturned || bp.quantity || 0,
          quantity_damaged: bp.quantityDamaged || 0,
          notes: bp.notes || null
        }));

        const { error: backloadError } = await supabase
          .from('backload_packaging')
          .insert(backloadItems);

        if (backloadError) throw backloadError;
      }
    }

    res.json({ load: data });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/loads/:id/confirm-dispatch
 * Confirm load dispatch
 */
router.post('/:id/confirm-dispatch', authenticate, authorize('admin', 'dispatcher', 'farm_user'), async (req, res, next) => {
  try {
    const { actualDepartureTime } = req.body;
    const departureTime = actualDepartureTime || new Date().toISOString();

    // Get load to check scheduled time
    const { data: load, error: loadError } = await supabase
      .from('loads')
      .select('dispatch_date, scheduled_departure_time')
      .eq('id', req.params.id)
      .single();

    if (loadError) {
      if (loadError.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Load not found' } });
      }
      throw loadError;
    }

    // Calculate departure on-time status if scheduled time exists
    let onTimeStatus = null;
    if (load.scheduled_departure_time) {
      const scheduledDateTime = new Date(`${load.dispatch_date}T${load.scheduled_departure_time}`);
      const actualDateTime = new Date(departureTime);
      const diffMinutes = (actualDateTime - scheduledDateTime) / (1000 * 60);
      
      if (diffMinutes <= -5) onTimeStatus = 'early';
      else if (diffMinutes >= 5) onTimeStatus = 'delayed';
      else onTimeStatus = 'on_time';
    }

    const { data, error } = await supabase
      .from('loads')
      .update({
        status: 'departed',
        actual_departure_time: departureTime,
        on_time_status: onTimeStatus,
        confirmed_dispatch_by: req.user?.id || null,
        confirmed_dispatch_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Load not found' } });
      }
      throw error;
    }

    // Update inventory - deduct from origin site
    const { data: packaging } = await supabase
      .from('load_packaging')
      .select('packaging_type_id, quantity_dispatched')
      .eq('load_id', req.params.id);

    if (packaging && packaging.length > 0) {
      for (const pkg of packaging) {
        // Upsert inventory (deduct quantity)
        await supabase.rpc('update_inventory_on_dispatch', {
          p_load_id: req.params.id,
          p_site_id: data.origin_site_id,
          p_packaging_type_id: pkg.packaging_type_id,
          p_quantity: pkg.quantity_dispatched,
          p_recorded_by: req.user?.id || null
        }).catch(async () => {
          // Fallback if RPC doesn't exist - manual update
          const { data: existing } = await supabase
            .from('site_packaging_inventory')
            .select('*')
            .eq('site_id', data.origin_site_id)
            .eq('packaging_type_id', pkg.packaging_type_id)
            .single();

          if (existing) {
            await supabase
              .from('site_packaging_inventory')
              .update({
                quantity: existing.quantity - pkg.quantity_dispatched,
                handling_count: (existing.handling_count || 0) + 1,
                total_dispatched: (existing.total_dispatched || 0) + pkg.quantity_dispatched,
                updated_at: new Date().toISOString()
              })
              .eq('id', existing.id);
          } else {
            await supabase
              .from('site_packaging_inventory')
              .insert({
                site_id: data.origin_site_id,
                packaging_type_id: pkg.packaging_type_id,
                quantity: -pkg.quantity_dispatched,
                handling_count: 1,
                total_dispatched: pkg.quantity_dispatched
              });
          }

          // Record movement
          await supabase
            .from('packaging_movements')
            .insert({
              movement_type: 'dispatch',
              load_id: req.params.id,
              site_id: data.origin_site_id,
              packaging_type_id: pkg.packaging_type_id,
              quantity: pkg.quantity_dispatched,
              direction: 'out',
              recorded_by: req.user?.id || null
            });
        });
      }
    }

    res.json({ load: data });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/loads/:id/confirm-receipt
 * Confirm load receipt
 */
router.post('/:id/confirm-receipt', authenticate, authorize('admin', 'dispatcher', 'depot_user'), async (req, res, next) => {
  try {
    const { packaging, discrepancyNotes, actualArrivalTime } = req.body;

    // Get load
    const { data: load, error: loadError } = await supabase
      .from('loads')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (loadError) {
      if (loadError.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Load not found' } });
      }
      throw loadError;
    }

    // Update packaging items
    let hasDiscrepancy = false;
    for (const p of packaging) {
      const { error: updateError } = await supabase
        .from('load_packaging')
        .update({
          quantity_received: p.quantityReceived,
          quantity_damaged: p.quantityDamaged || 0,
          quantity_missing: p.quantityMissing || 0,
          notes: p.notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', p.id);

      if (updateError) throw updateError;

      if (p.quantityDamaged > 0 || p.quantityMissing > 0) {
        hasDiscrepancy = true;
      }
    }

    // Calculate on-time status if we have scheduled and actual times
    let onTimeStatus = null;
    if (load.estimated_arrival_time && actualArrivalTime) {
      const scheduledDate = load.expected_arrival_date || load.dispatch_date;
      const scheduledDateTime = new Date(`${scheduledDate}T${load.estimated_arrival_time}`);
      const actualDateTime = new Date(actualArrivalTime);
      const diffMinutes = (actualDateTime - scheduledDateTime) / (1000 * 60);
      
      if (diffMinutes <= -5) onTimeStatus = 'early';
      else if (diffMinutes >= 5) onTimeStatus = 'delayed';
      else onTimeStatus = 'on_time';
    }

    // Update load status
    const { data: updatedLoad, error: updateLoadError } = await supabase
      .from('loads')
      .update({
        status: 'completed',
        actual_arrival_time: actualArrivalTime || new Date().toISOString(),
        on_time_status: onTimeStatus,
        has_discrepancy: hasDiscrepancy,
        discrepancy_notes: discrepancyNotes,
        confirmed_receipt_by: req.user?.id || null,
        confirmed_receipt_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (updateLoadError) throw updateLoadError;

    // Update inventory - add to destination site
    for (const p of packaging) {
      const quantityToAdd = p.quantityReceived || 0;
      if (quantityToAdd > 0) {
        // Get packaging type id from load_packaging
        const { data: pkgData } = await supabase
          .from('load_packaging')
          .select('packaging_type_id')
          .eq('id', p.id)
          .single();

        if (pkgData) {
          const { data: existing } = await supabase
            .from('site_packaging_inventory')
            .select('*')
            .eq('site_id', load.destination_site_id)
            .eq('packaging_type_id', pkgData.packaging_type_id)
            .single();

          if (existing) {
            await supabase
              .from('site_packaging_inventory')
              .update({
                quantity: existing.quantity + quantityToAdd,
                quantity_damaged: (existing.quantity_damaged || 0) + (p.quantityDamaged || 0),
                handling_count: (existing.handling_count || 0) + 1,
                total_received: (existing.total_received || 0) + quantityToAdd,
                updated_at: new Date().toISOString()
              })
              .eq('id', existing.id);
          } else {
            await supabase
              .from('site_packaging_inventory')
              .insert({
                site_id: load.destination_site_id,
                packaging_type_id: pkgData.packaging_type_id,
                quantity: quantityToAdd,
                quantity_damaged: p.quantityDamaged || 0,
                handling_count: 1,
                total_received: quantityToAdd
              });
          }

          // Record movement
          await supabase
            .from('packaging_movements')
            .insert({
              movement_type: 'receipt',
              load_id: req.params.id,
              site_id: load.destination_site_id,
              packaging_type_id: pkgData.packaging_type_id,
              quantity: quantityToAdd,
              quantity_damaged: p.quantityDamaged || 0,
              direction: 'in',
              recorded_by: req.user?.id || null
            });
        }
      }
    }

    // Handle backload packaging returns if applicable
    if (load.backload_site_id) {
      const { data: backloadPkg } = await supabase
        .from('backload_packaging')
        .select('packaging_type_id, quantity_returned')
        .eq('load_id', req.params.id);

      if (backloadPkg && backloadPkg.length > 0) {
        for (const bp of backloadPkg) {
          if (bp.quantity_returned > 0) {
            const { data: existing } = await supabase
              .from('site_packaging_inventory')
              .select('*')
              .eq('site_id', load.backload_site_id)
              .eq('packaging_type_id', bp.packaging_type_id)
              .single();

            if (existing) {
              await supabase
                .from('site_packaging_inventory')
                .update({
                  quantity: existing.quantity + bp.quantity_returned,
                  handling_count: (existing.handling_count || 0) + 1,
                  total_returned: (existing.total_returned || 0) + bp.quantity_returned,
                  updated_at: new Date().toISOString()
                })
                .eq('id', existing.id);
            } else {
              await supabase
                .from('site_packaging_inventory')
                .insert({
                  site_id: load.backload_site_id,
                  packaging_type_id: bp.packaging_type_id,
                  quantity: bp.quantity_returned,
                  handling_count: 1,
                  total_returned: bp.quantity_returned
                });
            }

            // Record movement
            await supabase
              .from('packaging_movements')
              .insert({
                movement_type: 'backload_return',
                load_id: req.params.id,
                site_id: load.backload_site_id,
                packaging_type_id: bp.packaging_type_id,
                quantity: bp.quantity_returned,
                direction: 'in',
                recorded_by: req.user?.id || null
              });
          }
        }
      }
    }

    res.json({ load: updatedLoad, hasDiscrepancy });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/loads/:id/duplicate
 * Duplicate a load
 */
router.post('/:id/duplicate', authenticate, authorize('admin', 'dispatcher', 'farm_user'), async (req, res, next) => {
  try {
    const { dispatchDate } = req.body;

    // Get original load
    const { data: original, error: origError } = await supabase
      .from('loads')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (origError) {
      if (origError.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Load not found' } });
      }
      throw origError;
    }

    // Get original packaging
    const { data: originalPackaging, error: packError } = await supabase
      .from('load_packaging')
      .select('*')
      .eq('load_id', req.params.id);

    if (packError) throw packError;

    // Get origin site code
    const { data: originSite } = await supabase
      .from('sites')
      .select('code')
      .eq('id', original.origin_site_id)
      .single();

    const newDispatchDate = dispatchDate || original.dispatch_date;
    const loadNumber = await generateLoadNumber(originSite.code, newDispatchDate);

    // Create new load
    const { data: newLoad, error: newLoadError } = await supabase
      .from('loads')
      .insert({
        load_number: loadNumber,
        origin_site_id: original.origin_site_id,
        destination_site_id: original.destination_site_id,
        channel_id: original.channel_id,
        vehicle_id: original.vehicle_id,
        driver_id: original.driver_id,
        dispatch_date: newDispatchDate,
        notes: original.notes,
        status: 'scheduled',
        created_by: req.user?.id || null
      })
      .select()
      .single();

    if (newLoadError) throw newLoadError;

    // Copy packaging
    const newPackaging = originalPackaging.map(p => ({
      load_id: newLoad.id,
      packaging_type_id: p.packaging_type_id,
      product_type_id: p.product_type_id,
      product_variety_id: p.product_variety_id,
      product_grade_id: p.product_grade_id,
      quantity_dispatched: p.quantity_dispatched,
      weight_kg: p.weight_kg,
      notes: p.notes
    }));

    const { error: insertPackError } = await supabase
      .from('load_packaging')
      .insert(newPackaging);

    if (insertPackError) throw insertPackError;

    res.status(201).json({ load: newLoad });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/loads/:id/confirm-farm-arrival
 * Confirm farm arrival time for overtime tracking
 * Expected arrival time for BV and CBC farms is 14:00
 */
router.post('/:id/confirm-farm-arrival', authenticate, authorize('admin', 'dispatcher', 'farm_user'), async (req, res, next) => {
  try {
    const { actualFarmArrivalTime } = req.body;
    const arrivalTime = actualFarmArrivalTime || new Date().toISOString();

    // Get load to check expected arrival time
    const { data: load, error: loadError } = await supabase
      .from('loads')
      .select('dispatch_date, expected_farm_arrival_time, status')
      .eq('id', req.params.id)
      .single();

    if (loadError) {
      if (loadError.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Load not found' } });
      }
      throw loadError;
    }

    // Calculate overtime (if actual time exceeds expected 14:00)
    let overtimeMinutes = 0;
    const expectedTime = load.expected_farm_arrival_time || '14:00:00';
    const expectedDateTime = new Date(`${load.dispatch_date}T${expectedTime}`);
    const actualDateTime = new Date(arrivalTime);
    const diffMinutes = Math.round((actualDateTime - expectedDateTime) / (1000 * 60));
    
    // Only count as overtime if late (positive difference)
    if (diffMinutes > 0) {
      overtimeMinutes = diffMinutes;
    }

    const { data, error } = await supabase
      .from('loads')
      .update({
        actual_farm_arrival_time: arrivalTime,
        farm_arrival_overtime_minutes: overtimeMinutes,
        has_overtime: overtimeMinutes > 0,
        confirmed_farm_arrival_by: req.user?.id || null,
        confirmed_farm_arrival_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Load not found' } });
      }
      throw error;
    }

    res.json({ 
      load: data, 
      overtimeMinutes,
      isOvertime: overtimeMinutes > 0 
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/loads/:id/confirm-farm-departure
 * Confirm farm departure time for overtime tracking
 * Expected departure time for BV and CBC farms is 17:00
 */
router.post('/:id/confirm-farm-departure', authenticate, authorize('admin', 'dispatcher', 'farm_user'), async (req, res, next) => {
  try {
    const { actualFarmDepartureTime } = req.body;
    const departureTime = actualFarmDepartureTime || new Date().toISOString();

    // Get load to check expected departure time
    const { data: load, error: loadError } = await supabase
      .from('loads')
      .select('dispatch_date, expected_farm_departure_time, farm_arrival_overtime_minutes, status')
      .eq('id', req.params.id)
      .single();

    if (loadError) {
      if (loadError.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Load not found' } });
      }
      throw loadError;
    }

    // Calculate overtime (if actual time exceeds expected 17:00)
    let overtimeMinutes = 0;
    const expectedTime = load.expected_farm_departure_time || '17:00:00';
    const expectedDateTime = new Date(`${load.dispatch_date}T${expectedTime}`);
    const actualDateTime = new Date(departureTime);
    const diffMinutes = Math.round((actualDateTime - expectedDateTime) / (1000 * 60));
    
    // Only count as overtime if late (positive difference)
    if (diffMinutes > 0) {
      overtimeMinutes = diffMinutes;
    }

    // Check if there's any overtime (arrival or departure)
    const hasOvertime = overtimeMinutes > 0 || (load.farm_arrival_overtime_minutes || 0) > 0;

    const { data, error } = await supabase
      .from('loads')
      .update({
        actual_farm_departure_time: departureTime,
        farm_departure_overtime_minutes: overtimeMinutes,
        has_overtime: hasOvertime,
        confirmed_farm_departure_by: req.user?.id || null,
        confirmed_farm_departure_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Load not found' } });
      }
      throw error;
    }

    res.json({ 
      load: data, 
      overtimeMinutes,
      isOvertime: hasOvertime 
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/loads/:id
 * Delete a load (only if scheduled)
 */
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    // Check if load exists and is scheduled
    const { data: load, error: loadError } = await supabase
      .from('loads')
      .select('status')
      .eq('id', req.params.id)
      .single();

    if (loadError) {
      if (loadError.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Load not found' } });
      }
      throw loadError;
    }

    if (load.status !== 'scheduled') {
      return res.status(400).json({ error: { message: 'Can only delete scheduled loads' } });
    }

    // Delete packaging first
    await supabase.from('load_packaging').delete().eq('load_id', req.params.id);

    // Delete load
    const { error: deleteError } = await supabase
      .from('loads')
      .delete()
      .eq('id', req.params.id);

    if (deleteError) throw deleteError;

    res.json({ message: 'Load deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/loads/vehicles
 * Get all vehicles
 */
router.get('/lookup/vehicles', authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('is_active', true)
      .order('registration');

    if (error) throw error;

    res.json({ vehicles: data });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/loads/drivers
 * Get all drivers
 */
router.get('/lookup/drivers', authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .eq('is_active', true)
      .order('first_name');

    if (error) throw error;

    res.json({ drivers: data });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/loads/channels
 * Get all channels
 */
router.get('/lookup/channels', authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;

    res.json({ channels: data });
  } catch (error) {
    next(error);
  }
});

export default router;
