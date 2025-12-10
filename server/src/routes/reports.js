import express from 'express';
import { query } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/reports/farm-statement/:siteId
 * Get farm statement (packaging sent, returned, outstanding)
 */
router.get('/farm-statement/:siteId', authenticate, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const { siteId } = req.params;
    
    let dateFilter = '';
    const params = [siteId];
    
    if (startDate && endDate) {
      params.push(startDate, endDate);
      dateFilter = `AND l.dispatch_date BETWEEN $2 AND $3`;
    }

    // Get site info
    const siteInfo = await query('SELECT * FROM sites WHERE id = $1', [siteId]);
    if (siteInfo.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }

    // Packaging sent out (as origin)
    const sentOut = await query(`
      SELECT 
        pt.name as packaging_type,
        SUM(lp.quantity_dispatched) as total_sent,
        COUNT(DISTINCT l.id) as load_count
      FROM loads l
      JOIN load_packaging lp ON l.id = lp.load_id
      JOIN packaging_types pt ON lp.packaging_type_id = pt.id
      WHERE l.origin_site_id = $1 ${dateFilter}
      GROUP BY pt.name
      ORDER BY pt.name
    `, params);

    // Packaging received (as destination)
    const received = await query(`
      SELECT 
        pt.name as packaging_type,
        SUM(COALESCE(lp.quantity_received, lp.quantity_dispatched)) as total_received,
        SUM(lp.quantity_damaged) as total_damaged,
        COUNT(DISTINCT l.id) as load_count
      FROM loads l
      JOIN load_packaging lp ON l.id = lp.load_id
      JOIN packaging_types pt ON lp.packaging_type_id = pt.id
      WHERE l.destination_site_id = $1 
        AND l.status = 'completed' ${dateFilter}
      GROUP BY pt.name
      ORDER BY pt.name
    `, params);

    // Outstanding at other sites (sent but not returned)
    const outstanding = await query(`
      SELECT 
        ds.name as location,
        pt.name as packaging_type,
        SUM(lp.quantity_dispatched) as quantity,
        MIN(l.dispatch_date) as oldest_dispatch
      FROM loads l
      JOIN load_packaging lp ON l.id = lp.load_id
      JOIN packaging_types pt ON lp.packaging_type_id = pt.id
      JOIN sites ds ON l.destination_site_id = ds.id
      WHERE l.origin_site_id = $1
        AND l.status = 'completed'
        AND pt.is_returnable = true
        -- Exclude if there's a return load
        AND NOT EXISTS (
          SELECT 1 FROM loads rl
          JOIN load_packaging rlp ON rl.id = rlp.load_id
          WHERE rl.origin_site_id = l.destination_site_id
            AND rl.destination_site_id = l.origin_site_id
            AND rlp.packaging_type_id = lp.packaging_type_id
            AND rl.dispatch_date > l.dispatch_date
        )
      GROUP BY ds.name, pt.name
      ORDER BY oldest_dispatch
    `, [siteId]);

    // Current inventory
    const inventory = await query(`
      SELECT 
        pt.name as packaging_type,
        COALESCE(spi.quantity, 0) as on_hand,
        COALESCE(spi.quantity_damaged, 0) as damaged
      FROM packaging_types pt
      LEFT JOIN site_packaging_inventory spi ON pt.id = spi.packaging_type_id AND spi.site_id = $1
      WHERE pt.is_active = true
      ORDER BY pt.name
    `, [siteId]);

    // Movement history
    const movements = await query(`
      SELECT 
        pm.recorded_at,
        pm.movement_type,
        pt.name as packaging_type,
        pm.quantity,
        pm.notes,
        l.load_number
      FROM packaging_movements pm
      JOIN packaging_types pt ON pm.packaging_type_id = pt.id
      LEFT JOIN loads l ON pm.load_id = l.id
      WHERE pm.site_id = $1 ${dateFilter.replace('l.dispatch_date', 'pm.recorded_at')}
      ORDER BY pm.recorded_at DESC
      LIMIT 100
    `, params);

    res.json({
      site: siteInfo.rows[0],
      sentOut: sentOut.rows,
      received: received.rows,
      outstanding: outstanding.rows,
      currentInventory: inventory.rows,
      recentMovements: movements.rows
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/depot-statement/:siteId
 * Get depot statement (incoming, outgoing, balance over time)
 */
router.get('/depot-statement/:siteId', authenticate, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const { siteId } = req.params;
    
    let dateFilter = '';
    const params = [siteId];
    
    if (startDate && endDate) {
      params.push(startDate, endDate);
      dateFilter = `AND l.dispatch_date BETWEEN $2 AND $3`;
    }

    // Site info
    const siteInfo = await query('SELECT * FROM sites WHERE id = $1', [siteId]);
    if (siteInfo.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }

    // Incoming loads
    const incoming = await query(`
      SELECT 
        os.name as from_site,
        COUNT(*) as load_count,
        SUM((SELECT SUM(quantity_dispatched) FROM load_packaging WHERE load_id = l.id)) as total_packaging
      FROM loads l
      JOIN sites os ON l.origin_site_id = os.id
      WHERE l.destination_site_id = $1 ${dateFilter}
      GROUP BY os.name
      ORDER BY load_count DESC
    `, params);

    // Outgoing loads
    const outgoing = await query(`
      SELECT 
        ds.name as to_site,
        COUNT(*) as load_count,
        SUM((SELECT SUM(quantity_dispatched) FROM load_packaging WHERE load_id = l.id)) as total_packaging
      FROM loads l
      JOIN sites ds ON l.destination_site_id = ds.id
      WHERE l.origin_site_id = $1 ${dateFilter}
      GROUP BY ds.name
      ORDER BY load_count DESC
    `, params);

    // Balance over time
    const balanceOverTime = await query(`
      SELECT 
        DATE(pm.recorded_at) as date,
        pt.name as packaging_type,
        SUM(pm.quantity) as net_change
      FROM packaging_movements pm
      JOIN packaging_types pt ON pm.packaging_type_id = pt.id
      WHERE pm.site_id = $1 ${dateFilter.replace('l.dispatch_date', 'pm.recorded_at')}
      GROUP BY DATE(pm.recorded_at), pt.name
      ORDER BY date
    `, params);

    // Current inventory
    const inventory = await query(`
      SELECT 
        pt.name as packaging_type,
        COALESCE(spi.quantity, 0) as on_hand,
        COALESCE(spi.quantity_damaged, 0) as damaged
      FROM packaging_types pt
      LEFT JOIN site_packaging_inventory spi ON pt.id = spi.packaging_type_id AND spi.site_id = $1
      WHERE pt.is_active = true
      ORDER BY pt.name
    `, [siteId]);

    res.json({
      site: siteInfo.rows[0],
      incoming: incoming.rows,
      outgoing: outgoing.rows,
      balanceOverTime: balanceOverTime.rows,
      currentInventory: inventory.rows
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/exceptions
 * Get exception reports (lost, short deliveries, aging stock)
 */
router.get('/exceptions', authenticate, async (req, res, next) => {
  try {
    const { type } = req.query;

    const response = {};

    // Lost/unaccounted packaging
    if (!type || type === 'lost') {
      const lost = await query(`
        SELECT 
          l.load_number,
          l.dispatch_date,
          os.name as origin,
          ds.name as destination,
          pt.name as packaging_type,
          lp.quantity_dispatched,
          lp.quantity_received,
          lp.quantity_missing,
          (lp.quantity_dispatched - COALESCE(lp.quantity_received, 0)) as unaccounted
        FROM loads l
        JOIN load_packaging lp ON l.id = lp.load_id
        JOIN packaging_types pt ON lp.packaging_type_id = pt.id
        JOIN sites os ON l.origin_site_id = os.id
        JOIN sites ds ON l.destination_site_id = ds.id
        WHERE l.status = 'completed'
          AND (lp.quantity_dispatched != COALESCE(lp.quantity_received, 0)
               OR lp.quantity_missing > 0)
        ORDER BY l.dispatch_date DESC
        LIMIT 50
      `);
      response.lostPackaging = lost.rows;
    }

    // Frequent short deliveries (sites with multiple discrepancies)
    if (!type || type === 'short') {
      const shortDeliveries = await query(`
        SELECT 
          ds.name as site,
          COUNT(*) as discrepancy_count,
          SUM(lp.quantity_missing) as total_missing,
          SUM(lp.quantity_damaged) as total_damaged
        FROM loads l
        JOIN load_packaging lp ON l.id = lp.load_id
        JOIN sites ds ON l.destination_site_id = ds.id
        WHERE l.has_discrepancy = true
          AND l.dispatch_date >= CURRENT_DATE - INTERVAL '90 days'
        GROUP BY ds.name
        HAVING COUNT(*) >= 3
        ORDER BY discrepancy_count DESC
      `);
      response.frequentShortDeliveries = shortDeliveries.rows;
    }

    // Aging stock (packaging at locations for too long)
    if (!type || type === 'aging') {
      const aging = await query(`
        SELECT 
          s.name as site,
          pt.name as packaging_type,
          pt.expected_turnaround_days,
          MIN(l.dispatch_date) as oldest_arrival,
          CURRENT_DATE - MIN(l.dispatch_date) as days_at_site,
          SUM(lp.quantity_dispatched) as estimated_quantity
        FROM loads l
        JOIN load_packaging lp ON l.id = lp.load_id
        JOIN packaging_types pt ON lp.packaging_type_id = pt.id
        JOIN sites s ON l.destination_site_id = s.id
        WHERE l.status = 'completed'
          AND pt.is_returnable = true
          AND (CURRENT_DATE - l.dispatch_date) > pt.expected_turnaround_days
        GROUP BY s.name, pt.name, pt.expected_turnaround_days
        ORDER BY days_at_site DESC
        LIMIT 30
      `);
      response.agingStock = aging.rows;
    }

    // Overdue returns
    if (!type || type === 'overdue') {
      const overdue = await query(`
        SELECT 
          l.load_number,
          l.dispatch_date,
          os.name as origin,
          ds.name as current_location,
          pt.name as packaging_type,
          lp.quantity_dispatched,
          pt.expected_turnaround_days,
          CURRENT_DATE - l.dispatch_date as days_outstanding
        FROM loads l
        JOIN load_packaging lp ON l.id = lp.load_id
        JOIN packaging_types pt ON lp.packaging_type_id = pt.id
        JOIN sites os ON l.origin_site_id = os.id
        JOIN sites ds ON l.destination_site_id = ds.id
        WHERE l.status = 'completed'
          AND pt.is_returnable = true
          AND (CURRENT_DATE - l.dispatch_date) > pt.expected_turnaround_days
        ORDER BY days_outstanding DESC
        LIMIT 30
      `);
      response.overdueReturns = overdue.rows;
    }

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/export/loads
 * Export loads data as CSV-ready JSON
 */
router.get('/export/loads', authenticate, async (req, res, next) => {
  try {
    const { startDate, endDate, format = 'json' } = req.query;
    
    let dateFilter = '';
    const params = [];
    
    if (startDate && endDate) {
      params.push(startDate, endDate);
      dateFilter = `WHERE l.dispatch_date BETWEEN $1 AND $2`;
    }

    const result = await query(`
      SELECT 
        l.load_number,
        l.dispatch_date,
        l.expected_arrival_date,
        os.code as origin_code,
        os.name as origin_name,
        ds.code as destination_code,
        ds.name as destination_name,
        ch.name as channel,
        v.name as vehicle,
        d.first_name || ' ' || d.last_name as driver,
        l.status,
        l.on_time_status,
        l.actual_departure_time,
        l.actual_arrival_time,
        l.has_discrepancy,
        l.notes,
        pt.code as packaging_code,
        pt.name as packaging_name,
        lp.quantity_dispatched,
        lp.quantity_received,
        lp.quantity_damaged,
        lp.quantity_missing
      FROM loads l
      JOIN sites os ON l.origin_site_id = os.id
      JOIN sites ds ON l.destination_site_id = ds.id
      LEFT JOIN channels ch ON l.channel_id = ch.id
      LEFT JOIN vehicles v ON l.vehicle_id = v.id
      LEFT JOIN drivers d ON l.driver_id = d.id
      LEFT JOIN load_packaging lp ON l.id = lp.load_id
      LEFT JOIN packaging_types pt ON lp.packaging_type_id = pt.id
      ${dateFilter}
      ORDER BY l.dispatch_date DESC, l.load_number
    `, params);

    if (format === 'csv') {
      // Convert to CSV
      const headers = Object.keys(result.rows[0] || {}).join(',');
      const rows = result.rows.map(row => 
        Object.values(row).map(v => 
          v === null ? '' : `"${String(v).replace(/"/g, '""')}"`
        ).join(',')
      );
      const csv = [headers, ...rows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=loads-export.csv');
      res.send(csv);
    } else {
      res.json({ data: result.rows, count: result.rows.length });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/export/inventory
 * Export current inventory as CSV-ready JSON
 */
router.get('/export/inventory', authenticate, async (req, res, next) => {
  try {
    const { format = 'json' } = req.query;

    const result = await query(`
      SELECT 
        s.code as site_code,
        s.name as site_name,
        st.name as site_type,
        pt.code as packaging_code,
        pt.name as packaging_name,
        COALESCE(spi.quantity, 0) as quantity_on_hand,
        COALESCE(spi.quantity_damaged, 0) as quantity_damaged,
        spt.min_threshold,
        spt.max_threshold,
        spi.last_counted_at
      FROM sites s
      JOIN site_types st ON s.site_type_id = st.id
      CROSS JOIN packaging_types pt
      LEFT JOIN site_packaging_inventory spi ON s.id = spi.site_id AND pt.id = spi.packaging_type_id
      LEFT JOIN site_packaging_thresholds spt ON s.id = spt.site_id AND pt.id = spt.packaging_type_id
      WHERE s.is_active = true AND pt.is_active = true
      ORDER BY s.name, pt.name
    `);

    if (format === 'csv') {
      const headers = Object.keys(result.rows[0] || {}).join(',');
      const rows = result.rows.map(row => 
        Object.values(row).map(v => 
          v === null ? '' : `"${String(v).replace(/"/g, '""')}"`
        ).join(',')
      );
      const csv = [headers, ...rows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=inventory-export.csv');
      res.send(csv);
    } else {
      res.json({ data: result.rows, count: result.rows.length });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/export/movements
 * Export packaging movements as CSV-ready JSON
 */
router.get('/export/movements', authenticate, async (req, res, next) => {
  try {
    const { startDate, endDate, format = 'json' } = req.query;
    
    let dateFilter = '';
    const params = [];
    
    if (startDate && endDate) {
      params.push(startDate, endDate);
      dateFilter = `WHERE pm.recorded_at BETWEEN $1 AND $2`;
    }

    const result = await query(`
      SELECT 
        pm.recorded_at,
        pm.movement_type,
        s.code as site_code,
        s.name as site_name,
        pt.code as packaging_code,
        pt.name as packaging_name,
        pm.quantity,
        pm.quantity_damaged,
        l.load_number,
        pm.reference_number,
        pm.notes,
        u.first_name || ' ' || u.last_name as recorded_by
      FROM packaging_movements pm
      JOIN sites s ON pm.site_id = s.id
      JOIN packaging_types pt ON pm.packaging_type_id = pt.id
      LEFT JOIN loads l ON pm.load_id = l.id
      LEFT JOIN users u ON pm.recorded_by = u.id
      ${dateFilter}
      ORDER BY pm.recorded_at DESC
    `, params);

    if (format === 'csv') {
      const headers = Object.keys(result.rows[0] || {}).join(',');
      const rows = result.rows.map(row => 
        Object.values(row).map(v => 
          v === null ? '' : `"${String(v).replace(/"/g, '""')}"`
        ).join(',')
      );
      const csv = [headers, ...rows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=movements-export.csv');
      res.send(csv);
    } else {
      res.json({ data: result.rows, count: result.rows.length });
    }
  } catch (error) {
    next(error);
  }
});

export default router;
