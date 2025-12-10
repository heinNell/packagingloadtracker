import express from 'express';
import { query } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/dashboard/summary
 * Get main dashboard summary data
 */
router.get('/summary', authenticate, async (req, res, next) => {
  try {
    // Get packaging balance per site
    const siteBalances = await query(`
      SELECT 
        s.id as site_id,
        s.code as site_code,
        s.name as site_name,
        st.name as site_type,
        json_agg(json_build_object(
          'packaging_type_id', pt.id,
          'packaging_type_code', pt.code,
          'packaging_type_name', pt.name,
          'quantity', COALESCE(spi.quantity, 0),
          'quantity_damaged', COALESCE(spi.quantity_damaged, 0),
          'min_threshold', spt.min_threshold,
          'status', CASE 
            WHEN spt.min_threshold IS NOT NULL AND COALESCE(spi.quantity, 0) <= spt.min_threshold THEN 'critical'
            WHEN spt.min_threshold IS NOT NULL AND COALESCE(spi.quantity, 0) <= spt.min_threshold * 1.2 THEN 'warning'
            ELSE 'normal'
          END
        ) ORDER BY pt.name) as packaging
      FROM sites s
      JOIN site_types st ON s.site_type_id = st.id
      CROSS JOIN packaging_types pt
      LEFT JOIN site_packaging_inventory spi ON s.id = spi.site_id AND pt.id = spi.packaging_type_id
      LEFT JOIN site_packaging_thresholds spt ON s.id = spt.site_id AND pt.id = spt.packaging_type_id
      WHERE s.is_active = true AND pt.is_active = true
      GROUP BY s.id, s.code, s.name, st.name
      ORDER BY st.name, s.name
    `);

    // Get packaging in transit
    const inTransit = await query(`
      SELECT 
        pt.id as packaging_type_id,
        pt.code as packaging_type_code,
        pt.name as packaging_type_name,
        SUM(lp.quantity_dispatched) as total_in_transit,
        COUNT(DISTINCT l.id) as load_count
      FROM loads l
      JOIN load_packaging lp ON l.id = lp.load_id
      JOIN packaging_types pt ON lp.packaging_type_id = pt.id
      WHERE l.status IN ('departed', 'in_transit', 'arrived_depot')
      GROUP BY pt.id, pt.code, pt.name
      ORDER BY pt.name
    `);

    // Get today's loads
    const todaysLoads = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE dispatch_date = CURRENT_DATE) as dispatched_today,
        COUNT(*) FILTER (WHERE actual_arrival_time::date = CURRENT_DATE) as received_today,
        COUNT(*) FILTER (WHERE status IN ('departed', 'in_transit')) as currently_in_transit,
        COUNT(*) FILTER (WHERE status = 'scheduled' AND dispatch_date = CURRENT_DATE) as pending_dispatch
      FROM loads
    `);

    // Get recent discrepancies
    const discrepancies = await query(`
      SELECT 
        l.id, l.load_number, l.dispatch_date,
        os.name as origin_site,
        ds.name as destination_site,
        l.discrepancy_notes,
        json_agg(json_build_object(
          'packaging_type', pt.name,
          'dispatched', lp.quantity_dispatched,
          'received', lp.quantity_received,
          'damaged', lp.quantity_damaged,
          'missing', lp.quantity_missing
        )) as items
      FROM loads l
      JOIN sites os ON l.origin_site_id = os.id
      JOIN sites ds ON l.destination_site_id = ds.id
      JOIN load_packaging lp ON l.id = lp.load_id
      JOIN packaging_types pt ON lp.packaging_type_id = pt.id
      WHERE l.has_discrepancy = true
        AND l.confirmed_receipt_at > CURRENT_DATE - INTERVAL '30 days'
      GROUP BY l.id, l.load_number, l.dispatch_date, os.name, ds.name, l.discrepancy_notes
      ORDER BY l.confirmed_receipt_at DESC
      LIMIT 10
    `);

    // Get alerts
    const alerts = await query(`
      SELECT a.*, 
             s.name as site_name,
             l.load_number,
             pt.name as packaging_type_name
      FROM alerts a
      LEFT JOIN sites s ON a.site_id = s.id
      LEFT JOIN loads l ON a.load_id = l.id
      LEFT JOIN packaging_types pt ON a.packaging_type_id = pt.id
      WHERE a.is_acknowledged = false
      ORDER BY 
        CASE a.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
        a.created_at DESC
      LIMIT 20
    `);

    // Get low stock sites
    const lowStock = await query(`
      SELECT 
        s.id as site_id,
        s.code as site_code,
        s.name as site_name,
        pt.name as packaging_type_name,
        COALESCE(spi.quantity, 0) as current_quantity,
        spt.min_threshold
      FROM site_packaging_thresholds spt
      JOIN sites s ON spt.site_id = s.id
      JOIN packaging_types pt ON spt.packaging_type_id = pt.id
      LEFT JOIN site_packaging_inventory spi ON spt.site_id = spi.site_id AND spt.packaging_type_id = spi.packaging_type_id
      WHERE spt.alert_enabled = true
        AND COALESCE(spi.quantity, 0) <= spt.min_threshold
        AND s.is_active = true
      ORDER BY (COALESCE(spi.quantity, 0)::float / NULLIF(spt.min_threshold, 0)) ASC
      LIMIT 10
    `);

    res.json({
      siteBalances: siteBalances.rows,
      inTransit: inTransit.rows,
      todaySummary: todaysLoads.rows[0],
      recentDiscrepancies: discrepancies.rows,
      alerts: alerts.rows,
      lowStock: lowStock.rows
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/loads-summary
 * Get load summary by period
 */
router.get('/loads-summary', authenticate, async (req, res, next) => {
  try {
    const { period = 'week', startDate, endDate } = req.query;
    
    let dateFilter = '';
    const params = [];
    
    if (startDate && endDate) {
      params.push(startDate, endDate);
      dateFilter = `AND dispatch_date BETWEEN $1 AND $2`;
    } else {
      switch (period) {
        case 'today':
          dateFilter = `AND dispatch_date = CURRENT_DATE`;
          break;
        case 'week':
          dateFilter = `AND dispatch_date >= CURRENT_DATE - INTERVAL '7 days'`;
          break;
        case 'month':
          dateFilter = `AND dispatch_date >= CURRENT_DATE - INTERVAL '30 days'`;
          break;
        default:
          dateFilter = `AND dispatch_date >= CURRENT_DATE - INTERVAL '7 days'`;
      }
    }

    const result = await query(`
      SELECT 
        dispatch_date,
        COUNT(*) as total_loads,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status IN ('departed', 'in_transit')) as in_transit,
        COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
        COUNT(*) FILTER (WHERE has_discrepancy = true) as with_discrepancies,
        SUM((SELECT SUM(quantity_dispatched) FROM load_packaging WHERE load_id = loads.id)) as total_packaging_dispatched
      FROM loads
      WHERE 1=1 ${dateFilter}
      GROUP BY dispatch_date
      ORDER BY dispatch_date
    `, params);

    res.json({ summary: result.rows });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/packaging-trends
 * Get packaging circulation trends
 */
router.get('/packaging-trends', authenticate, async (req, res, next) => {
  try {
    const { days = 30, packagingTypeId } = req.query;
    
    let packagingFilter = '';
    const params = [parseInt(days)];
    
    if (packagingTypeId) {
      params.push(packagingTypeId);
      packagingFilter = `AND pm.packaging_type_id = $2`;
    }

    const result = await query(`
      SELECT 
        DATE(pm.recorded_at) as date,
        pt.name as packaging_type,
        SUM(CASE WHEN pm.quantity > 0 THEN pm.quantity ELSE 0 END) as incoming,
        SUM(CASE WHEN pm.quantity < 0 THEN ABS(pm.quantity) ELSE 0 END) as outgoing,
        SUM(pm.quantity) as net_change,
        SUM(pm.quantity_damaged) as damaged
      FROM packaging_movements pm
      JOIN packaging_types pt ON pm.packaging_type_id = pt.id
      WHERE pm.recorded_at >= CURRENT_DATE - ($1 || ' days')::INTERVAL
        ${packagingFilter}
      GROUP BY DATE(pm.recorded_at), pt.name
      ORDER BY date, pt.name
    `, params);

    res.json({ trends: result.rows });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/route-volumes
 * Get load volumes by route
 */
router.get('/route-volumes', authenticate, async (req, res, next) => {
  try {
    const { days = 30 } = req.query;

    const result = await query(`
      SELECT 
        os.name as origin,
        ds.name as destination,
        COUNT(*) as load_count,
        SUM((SELECT SUM(quantity_dispatched) FROM load_packaging WHERE load_id = l.id)) as total_packaging,
        AVG(CASE WHEN l.on_time_status = 'on_time' THEN 1 ELSE 0 END) * 100 as on_time_percentage
      FROM loads l
      JOIN sites os ON l.origin_site_id = os.id
      JOIN sites ds ON l.destination_site_id = ds.id
      WHERE l.dispatch_date >= CURRENT_DATE - ($1 || ' days')::INTERVAL
      GROUP BY os.name, ds.name
      ORDER BY load_count DESC
      LIMIT 20
    `, [parseInt(days)]);

    res.json({ routes: result.rows });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/dashboard/alerts/:id/acknowledge
 * Acknowledge an alert
 */
router.post('/alerts/:id/acknowledge', authenticate, async (req, res, next) => {
  try {
    const result = await query(`
      UPDATE alerts SET
        is_acknowledged = true,
        acknowledged_by = $1,
        acknowledged_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [req.user.id, req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Alert not found' } });
    }

    res.json({ alert: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

export default router;
