import express from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db/index.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/packaging/types
 * Get all packaging types
 */
router.get('/types', authenticate, async (req, res, next) => {
  try {
    const { active } = req.query;
    
    let sql = 'SELECT * FROM packaging_types WHERE 1=1';
    const params = [];

    if (active !== undefined) {
      params.push(active === 'true');
      sql += ` AND is_active = $${params.length}`;
    }

    sql += ' ORDER BY name';

    const result = await query(sql, params);
    res.json({ packagingTypes: result.rows });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/packaging/types
 * Create a new packaging type
 */
router.post('/types', authenticate, authorize('admin'), [
  body('code').notEmpty().trim(),
  body('name').notEmpty().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { code, name, description, capacityKg, capacityLiters, weightEmptyKg, dimensionsCm, expectedTurnaroundDays, isReturnable } = req.body;

    const result = await query(
      `INSERT INTO packaging_types (code, name, description, capacity_kg, capacity_liters, weight_empty_kg, dimensions_cm, expected_turnaround_days, is_returnable)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [code, name, description, capacityKg, capacityLiters, weightEmptyKg, dimensionsCm, expectedTurnaroundDays || 14, isReturnable !== false]
    );

    res.status(201).json({ packagingType: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: { message: 'Packaging type code already exists' } });
    }
    next(error);
  }
});

/**
 * PUT /api/packaging/types/:id
 * Update a packaging type
 */
router.put('/types/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { code, name, description, capacityKg, capacityLiters, weightEmptyKg, dimensionsCm, expectedTurnaroundDays, isReturnable, isActive } = req.body;

    const result = await query(
      `UPDATE packaging_types SET
         code = COALESCE($1, code),
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         capacity_kg = COALESCE($4, capacity_kg),
         capacity_liters = COALESCE($5, capacity_liters),
         weight_empty_kg = COALESCE($6, weight_empty_kg),
         dimensions_cm = COALESCE($7, dimensions_cm),
         expected_turnaround_days = COALESCE($8, expected_turnaround_days),
         is_returnable = COALESCE($9, is_returnable),
         is_active = COALESCE($10, is_active),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $11
       RETURNING *`,
      [code, name, description, capacityKg, capacityLiters, weightEmptyKg, dimensionsCm, expectedTurnaroundDays, isReturnable, isActive, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Packaging type not found' } });
    }

    res.json({ packagingType: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/packaging/in-transit
 * Get all packaging currently in transit
 */
router.get('/in-transit', authenticate, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT 
        lp.packaging_type_id,
        pt.name as packaging_type_name,
        pt.code as packaging_type_code,
        SUM(lp.quantity_dispatched) as total_quantity,
        COUNT(DISTINCT l.id) as load_count,
        json_agg(json_build_object(
          'load_id', l.id,
          'load_number', l.load_number,
          'origin', os.name,
          'destination', ds.name,
          'quantity', lp.quantity_dispatched,
          'dispatch_date', l.dispatch_date
        )) as loads
      FROM loads l
      JOIN load_packaging lp ON l.id = lp.load_id
      JOIN packaging_types pt ON lp.packaging_type_id = pt.id
      JOIN sites os ON l.origin_site_id = os.id
      JOIN sites ds ON l.destination_site_id = ds.id
      WHERE l.status IN ('departed', 'in_transit', 'arrived_depot')
      GROUP BY lp.packaging_type_id, pt.name, pt.code
      ORDER BY pt.name
    `);

    res.json({ inTransit: result.rows });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/packaging/movements
 * Get packaging movement history
 */
router.get('/movements', authenticate, async (req, res, next) => {
  try {
    const { siteId, packagingTypeId, startDate, endDate, limit = 100 } = req.query;
    
    let sql = `
      SELECT pm.*, 
             s.name as site_name, s.code as site_code,
             pt.name as packaging_type_name, pt.code as packaging_type_code,
             l.load_number,
             u.first_name || ' ' || u.last_name as recorded_by_name
      FROM packaging_movements pm
      JOIN sites s ON pm.site_id = s.id
      JOIN packaging_types pt ON pm.packaging_type_id = pt.id
      LEFT JOIN loads l ON pm.load_id = l.id
      LEFT JOIN users u ON pm.recorded_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (siteId) {
      params.push(siteId);
      sql += ` AND pm.site_id = $${params.length}`;
    }

    if (packagingTypeId) {
      params.push(packagingTypeId);
      sql += ` AND pm.packaging_type_id = $${params.length}`;
    }

    if (startDate) {
      params.push(startDate);
      sql += ` AND pm.recorded_at >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      sql += ` AND pm.recorded_at <= $${params.length}`;
    }

    params.push(parseInt(limit));
    sql += ` ORDER BY pm.recorded_at DESC LIMIT $${params.length}`;

    const result = await query(sql, params);
    res.json({ movements: result.rows });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/packaging/products
 * Get product types
 */
router.get('/products', authenticate, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT pt.*, 
             json_agg(json_build_object('id', pv.id, 'code', pv.code, 'name', pv.name) ORDER BY pv.name) 
               FILTER (WHERE pv.id IS NOT NULL) as varieties
      FROM product_types pt
      LEFT JOIN product_varieties pv ON pt.id = pv.product_type_id AND pv.is_active = true
      WHERE pt.is_active = true
      GROUP BY pt.id
      ORDER BY pt.name
    `);
    res.json({ products: result.rows });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/packaging/grades
 * Get product grades
 */
router.get('/grades', authenticate, async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM product_grades WHERE is_active = true ORDER BY sort_order');
    res.json({ grades: result.rows });
  } catch (error) {
    next(error);
  }
});

export default router;
