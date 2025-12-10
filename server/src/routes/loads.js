import express from 'express';
import { body, validationResult } from 'express-validator';
import { query, transaction } from '../db/index.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/loads
 * Get loads with filtering
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { 
      status, originSiteId, destinationSiteId, 
      startDate, endDate, vehicleId, driverId,
      channelId, hasDiscrepancy, limit = 50, offset = 0 
    } = req.query;
    
    let sql = `
      SELECT l.*,
             os.name as origin_site_name, os.code as origin_site_code,
             ds.name as destination_site_name, ds.code as destination_site_code,
             v.name as vehicle_name, v.registration as vehicle_registration,
             d.first_name || ' ' || d.last_name as driver_name,
             ch.name as channel_name,
             (SELECT json_agg(json_build_object(
               'id', lp.id,
               'packaging_type_id', lp.packaging_type_id,
               'packaging_type_name', pt.name,
               'quantity_dispatched', lp.quantity_dispatched,
               'quantity_received', lp.quantity_received,
               'quantity_damaged', lp.quantity_damaged,
               'quantity_missing', lp.quantity_missing
             ))
              FROM load_packaging lp
              JOIN packaging_types pt ON lp.packaging_type_id = pt.id
              WHERE lp.load_id = l.id
             ) as packaging
      FROM loads l
      JOIN sites os ON l.origin_site_id = os.id
      JOIN sites ds ON l.destination_site_id = ds.id
      LEFT JOIN vehicles v ON l.vehicle_id = v.id
      LEFT JOIN drivers d ON l.driver_id = d.id
      LEFT JOIN channels ch ON l.channel_id = ch.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      sql += ` AND l.status = $${params.length}`;
    }

    if (originSiteId) {
      params.push(originSiteId);
      sql += ` AND l.origin_site_id = $${params.length}`;
    }

    if (destinationSiteId) {
      params.push(destinationSiteId);
      sql += ` AND l.destination_site_id = $${params.length}`;
    }

    if (startDate) {
      params.push(startDate);
      sql += ` AND l.dispatch_date >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      sql += ` AND l.dispatch_date <= $${params.length}`;
    }

    if (vehicleId) {
      params.push(vehicleId);
      sql += ` AND l.vehicle_id = $${params.length}`;
    }

    if (driverId) {
      params.push(driverId);
      sql += ` AND l.driver_id = $${params.length}`;
    }

    if (channelId) {
      params.push(channelId);
      sql += ` AND l.channel_id = $${params.length}`;
    }

    if (hasDiscrepancy !== undefined) {
      params.push(hasDiscrepancy === 'true');
      sql += ` AND l.has_discrepancy = $${params.length}`;
    }

    // Count total
    const countResult = await query(`SELECT COUNT(*) FROM (${sql}) as count_query`, params);
    const total = parseInt(countResult.rows[0].count);

    // Add pagination
    params.push(parseInt(limit));
    sql += ` ORDER BY l.dispatch_date DESC, l.created_at DESC LIMIT $${params.length}`;
    params.push(parseInt(offset));
    sql += ` OFFSET $${params.length}`;

    const result = await query(sql, params);

    res.json({ 
      loads: result.rows,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
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
    const result = await query(`
      SELECT l.*,
             os.name as origin_site_name, os.code as origin_site_code,
             ds.name as destination_site_name, ds.code as destination_site_code,
             v.name as vehicle_name, v.registration as vehicle_registration,
             d.first_name || ' ' || d.last_name as driver_name,
             ch.name as channel_name,
             cu.first_name || ' ' || cu.last_name as created_by_name,
             cdu.first_name || ' ' || cdu.last_name as confirmed_dispatch_by_name,
             cru.first_name || ' ' || cru.last_name as confirmed_receipt_by_name
      FROM loads l
      JOIN sites os ON l.origin_site_id = os.id
      JOIN sites ds ON l.destination_site_id = ds.id
      LEFT JOIN vehicles v ON l.vehicle_id = v.id
      LEFT JOIN drivers d ON l.driver_id = d.id
      LEFT JOIN channels ch ON l.channel_id = ch.id
      LEFT JOIN users cu ON l.created_by = cu.id
      LEFT JOIN users cdu ON l.confirmed_dispatch_by = cdu.id
      LEFT JOIN users cru ON l.confirmed_receipt_by = cru.id
      WHERE l.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Load not found' } });
    }

    // Get packaging details
    const packaging = await query(`
      SELECT lp.*, 
             pt.name as packaging_type_name, pt.code as packaging_type_code,
             prt.name as product_type_name,
             prv.name as product_variety_name,
             pg.name as product_grade_name
      FROM load_packaging lp
      JOIN packaging_types pt ON lp.packaging_type_id = pt.id
      LEFT JOIN product_types prt ON lp.product_type_id = prt.id
      LEFT JOIN product_varieties prv ON lp.product_variety_id = prv.id
      LEFT JOIN product_grades pg ON lp.product_grade_id = pg.id
      WHERE lp.load_id = $1
    `, [req.params.id]);

    res.json({ 
      load: result.rows[0],
      packaging: packaging.rows
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Generate load number based on farm code and date
 * @param {string} farmCode 
 * @param {Date} dispatchDate 
 * @returns {Promise<string>}
 */
async function generateLoadNumber(farmCode, dispatchDate) {
  const date = new Date(dispatchDate);
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  const prefix = `${farmCode}${year}${month}${day}`;
  
  // Find the highest number for this prefix
  const result = await query(
    `SELECT load_number FROM loads 
     WHERE load_number LIKE $1 
     ORDER BY load_number DESC LIMIT 1`,
    [`${prefix}%`]
  );

  if (result.rows.length === 0) {
    return prefix;
  }

  // Extract number and increment
  const lastNumber = result.rows[0].load_number;
  const numPart = lastNumber.replace(prefix, '');
  const nextNum = numPart ? parseInt(numPart) + 1 : 1;
  
  return `${prefix}-${nextNum}`;
}

/**
 * POST /api/loads
 * Create a new load
 */
router.post('/', authenticate, authorize('admin', 'dispatcher', 'farm_user'), [
  body('originSiteId').isUUID(),
  body('destinationSiteId').isUUID(),
  body('dispatchDate').isDate()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      originSiteId, destinationSiteId, channelId,
      dispatchDate, expectedArrivalDate, scheduledDepartureTime,
      vehicleId, driverId, notes, packaging 
    } = req.body;

    // Get origin site code for load number
    const siteResult = await query('SELECT code FROM sites WHERE id = $1', [originSiteId]);
    if (siteResult.rows.length === 0) {
      return res.status(400).json({ error: { message: 'Origin site not found' } });
    }

    const loadNumber = await generateLoadNumber(siteResult.rows[0].code, dispatchDate);

    const result = await transaction(async (client) => {
      // Create load
      const loadResult = await client.query(`
        INSERT INTO loads (
          load_number, origin_site_id, destination_site_id, channel_id,
          dispatch_date, expected_arrival_date, scheduled_departure_time,
          vehicle_id, driver_id, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        loadNumber, originSiteId, destinationSiteId, channelId || null,
        dispatchDate, expectedArrivalDate || null, scheduledDepartureTime || null,
        vehicleId || null, driverId || null, notes || null, req.user.id
      ]);

      const load = loadResult.rows[0];

      // Add packaging items
      if (packaging && packaging.length > 0) {
        for (const item of packaging) {
          await client.query(`
            INSERT INTO load_packaging (
              load_id, packaging_type_id, quantity_dispatched,
              product_type_id, product_variety_id, product_grade_id, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            load.id, item.packagingTypeId, item.quantity,
            item.productTypeId || null, item.productVarietyId || null,
            item.productGradeId || null, item.notes || null
          ]);
        }
      }

      return load;
    });

    res.status(201).json({ load: result, loadNumber });
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
      destinationSiteId, channelId,
      dispatchDate, expectedArrivalDate, scheduledDepartureTime,
      estimatedArrivalTime, vehicleId, driverId, notes 
    } = req.body;

    const result = await query(`
      UPDATE loads SET
        destination_site_id = COALESCE($1, destination_site_id),
        channel_id = COALESCE($2, channel_id),
        dispatch_date = COALESCE($3, dispatch_date),
        expected_arrival_date = COALESCE($4, expected_arrival_date),
        scheduled_departure_time = COALESCE($5, scheduled_departure_time),
        estimated_arrival_time = COALESCE($6, estimated_arrival_time),
        vehicle_id = COALESCE($7, vehicle_id),
        driver_id = COALESCE($8, driver_id),
        notes = COALESCE($9, notes),
        updated_by = $10,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $11
      RETURNING *
    `, [
      destinationSiteId, channelId, dispatchDate, expectedArrivalDate,
      scheduledDepartureTime, estimatedArrivalTime, vehicleId, driverId,
      notes, req.user.id, req.params.id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Load not found' } });
    }

    res.json({ load: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/loads/:id/dispatch
 * Confirm load dispatch
 */
router.post('/:id/dispatch', authenticate, authorize('admin', 'dispatcher', 'farm_user'), async (req, res, next) => {
  try {
    const { actualDepartureTime } = req.body;

    const result = await transaction(async (client) => {
      // Update load status
      const loadResult = await client.query(`
        UPDATE loads SET
          status = 'departed',
          actual_departure_time = COALESCE($1, CURRENT_TIMESTAMP),
          confirmed_dispatch_by = $2,
          confirmed_dispatch_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3 AND status IN ('scheduled', 'loading')
        RETURNING *
      `, [actualDepartureTime || null, req.user.id, req.params.id]);

      if (loadResult.rows.length === 0) {
        throw new Error('Load not found or already dispatched');
      }

      const load = loadResult.rows[0];

      // Get packaging items and create movements (outgoing from origin)
      const packaging = await client.query(
        'SELECT * FROM load_packaging WHERE load_id = $1',
        [load.id]
      );

      for (const item of packaging.rows) {
        // Record outgoing movement from origin
        await client.query(`
          INSERT INTO packaging_movements (movement_type, load_id, site_id, packaging_type_id, quantity, recorded_by)
          VALUES ('dispatch', $1, $2, $3, $4, $5)
        `, [load.id, load.origin_site_id, item.packaging_type_id, -item.quantity_dispatched, req.user.id]);

        // Update origin inventory
        await client.query(`
          UPDATE site_packaging_inventory 
          SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
          WHERE site_id = $2 AND packaging_type_id = $3
        `, [item.quantity_dispatched, load.origin_site_id, item.packaging_type_id]);
      }

      return load;
    });

    res.json({ load: result, message: 'Load dispatched successfully' });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: { message: error.message } });
    }
    next(error);
  }
});

/**
 * POST /api/loads/:id/receive
 * Confirm load receipt
 */
router.post('/:id/receive', authenticate, authorize('admin', 'dispatcher', 'depot_user'), async (req, res, next) => {
  try {
    const { actualArrivalTime, packaging: receivedPackaging, discrepancyNotes } = req.body;

    const result = await transaction(async (client) => {
      // Get current load
      const currentLoad = await client.query('SELECT * FROM loads WHERE id = $1', [req.params.id]);
      if (currentLoad.rows.length === 0) {
        throw new Error('Load not found');
      }

      const load = currentLoad.rows[0];
      
      // Check timing for on-time status
      let onTimeStatus = 'on_time';
      const arrivalTime = actualArrivalTime ? new Date(actualArrivalTime) : new Date();
      if (load.expected_arrival_date) {
        const expected = new Date(load.expected_arrival_date);
        expected.setHours(23, 59, 59);
        if (arrivalTime > expected) {
          onTimeStatus = 'delayed';
        } else if (arrivalTime < new Date(load.expected_arrival_date)) {
          onTimeStatus = 'early';
        }
      }

      let hasDiscrepancy = false;

      // Update received quantities
      if (receivedPackaging && receivedPackaging.length > 0) {
        for (const item of receivedPackaging) {
          await client.query(`
            UPDATE load_packaging SET
              quantity_received = $1,
              quantity_damaged = COALESCE($2, 0),
              quantity_missing = COALESCE($3, 0),
              notes = COALESCE($4, notes),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
          `, [item.quantityReceived, item.quantityDamaged, item.quantityMissing, item.notes, item.id]);

          // Check for discrepancy
          const originalItem = await client.query('SELECT quantity_dispatched FROM load_packaging WHERE id = $1', [item.id]);
          if (originalItem.rows.length > 0) {
            const dispatched = originalItem.rows[0].quantity_dispatched;
            if (item.quantityReceived !== dispatched || item.quantityDamaged > 0 || item.quantityMissing > 0) {
              hasDiscrepancy = true;
            }
          }
        }
      } else {
        // If no specific quantities provided, assume all received as dispatched
        await client.query(`
          UPDATE load_packaging SET
            quantity_received = quantity_dispatched,
            updated_at = CURRENT_TIMESTAMP
          WHERE load_id = $1 AND quantity_received IS NULL
        `, [req.params.id]);
      }

      // Update load status
      const loadResult = await client.query(`
        UPDATE loads SET
          status = 'completed',
          actual_arrival_time = COALESCE($1, CURRENT_TIMESTAMP),
          on_time_status = $2,
          has_discrepancy = $3,
          discrepancy_notes = $4,
          confirmed_receipt_by = $5,
          confirmed_receipt_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING *
      `, [actualArrivalTime || null, onTimeStatus, hasDiscrepancy, discrepancyNotes || null, req.user.id, req.params.id]);

      const updatedLoad = loadResult.rows[0];

      // Get packaging items and create movements (incoming to destination)
      const packaging = await client.query(
        'SELECT * FROM load_packaging WHERE load_id = $1',
        [updatedLoad.id]
      );

      for (const item of packaging.rows) {
        const receivedQty = item.quantity_received || item.quantity_dispatched;
        
        // Record incoming movement to destination
        await client.query(`
          INSERT INTO packaging_movements (movement_type, load_id, site_id, packaging_type_id, quantity, quantity_damaged, recorded_by)
          VALUES ('receipt', $1, $2, $3, $4, $5, $6)
        `, [updatedLoad.id, updatedLoad.destination_site_id, item.packaging_type_id, receivedQty, item.quantity_damaged || 0, req.user.id]);

        // Update destination inventory
        await client.query(`
          INSERT INTO site_packaging_inventory (site_id, packaging_type_id, quantity, quantity_damaged)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (site_id, packaging_type_id) DO UPDATE SET
            quantity = site_packaging_inventory.quantity + $3,
            quantity_damaged = site_packaging_inventory.quantity_damaged + $4,
            updated_at = CURRENT_TIMESTAMP
        `, [updatedLoad.destination_site_id, item.packaging_type_id, receivedQty, item.quantity_damaged || 0]);

        // If there are missing items, create an alert
        if (item.quantity_missing > 0) {
          await client.query(`
            INSERT INTO alerts (alert_type, severity, load_id, packaging_type_id, message)
            VALUES ('missing_packaging', 'warning', $1, $2, $3)
          `, [updatedLoad.id, item.packaging_type_id, `${item.quantity_missing} items missing from load ${updatedLoad.load_number}`]);
        }
      }

      return updatedLoad;
    });

    res.json({ load: result, message: 'Load received successfully' });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: { message: error.message } });
    }
    next(error);
  }
});

/**
 * POST /api/loads/:id/duplicate
 * Duplicate a load (for quick entry)
 */
router.post('/:id/duplicate', authenticate, authorize('admin', 'dispatcher', 'farm_user'), async (req, res, next) => {
  try {
    const { dispatchDate, expectedArrivalDate } = req.body;

    const original = await query(`
      SELECT l.*, 
             (SELECT json_agg(json_build_object(
               'packaging_type_id', lp.packaging_type_id,
               'quantity_dispatched', lp.quantity_dispatched,
               'product_type_id', lp.product_type_id,
               'product_variety_id', lp.product_variety_id,
               'product_grade_id', lp.product_grade_id
             )) FROM load_packaging lp WHERE lp.load_id = l.id) as packaging
      FROM loads l WHERE l.id = $1
    `, [req.params.id]);

    if (original.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Load not found' } });
    }

    const origLoad = original.rows[0];
    const siteResult = await query('SELECT code FROM sites WHERE id = $1', [origLoad.origin_site_id]);
    const newDate = dispatchDate || new Date().toISOString().split('T')[0];
    const loadNumber = await generateLoadNumber(siteResult.rows[0].code, newDate);

    const result = await transaction(async (client) => {
      const loadResult = await client.query(`
        INSERT INTO loads (
          load_number, origin_site_id, destination_site_id, channel_id,
          dispatch_date, expected_arrival_date, scheduled_departure_time,
          vehicle_id, driver_id, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        loadNumber, origLoad.origin_site_id, origLoad.destination_site_id, origLoad.channel_id,
        newDate, expectedArrivalDate || null, origLoad.scheduled_departure_time,
        origLoad.vehicle_id, origLoad.driver_id, req.user.id
      ]);

      const newLoad = loadResult.rows[0];

      // Copy packaging items
      if (origLoad.packaging) {
        for (const item of origLoad.packaging) {
          await client.query(`
            INSERT INTO load_packaging (load_id, packaging_type_id, quantity_dispatched, product_type_id, product_variety_id, product_grade_id)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [newLoad.id, item.packaging_type_id, item.quantity_dispatched, item.product_type_id, item.product_variety_id, item.product_grade_id]);
        }
      }

      return newLoad;
    });

    res.status(201).json({ load: result, loadNumber });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/loads/vehicles
 * Get all vehicles
 */
router.get('/meta/vehicles', authenticate, async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM vehicles WHERE is_active = true ORDER BY name');
    res.json({ vehicles: result.rows });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/loads/drivers
 * Get all drivers
 */
router.get('/meta/drivers', authenticate, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT * FROM drivers WHERE is_active = true 
      ORDER BY first_name, last_name
    `);
    res.json({ drivers: result.rows });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/loads/channels
 * Get all channels
 */
router.get('/meta/channels', authenticate, async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM channels WHERE is_active = true ORDER BY name');
    res.json({ channels: result.rows });
  } catch (error) {
    next(error);
  }
});

export default router;
