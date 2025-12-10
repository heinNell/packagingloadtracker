import express from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db/index.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/sites
 * Get all sites with optional filtering
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { type, active, search } = req.query;
    
    let sql = `
      SELECT s.*, st.name as site_type_name,
             (SELECT COUNT(*) FROM loads WHERE origin_site_id = s.id OR destination_site_id = s.id) as load_count
      FROM sites s
      JOIN site_types st ON s.site_type_id = st.id
      WHERE 1=1
    `;
    const params = [];

    if (type) {
      params.push(type);
      sql += ` AND st.name = $${params.length}`;
    }

    if (active !== undefined) {
      params.push(active === 'true');
      sql += ` AND s.is_active = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (s.name ILIKE $${params.length} OR s.code ILIKE $${params.length})`;
    }

    sql += ' ORDER BY s.name';

    const result = await query(sql, params);
    res.json({ sites: result.rows });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sites/types
 * Get all site types
 */
router.get('/types', authenticate, async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM site_types ORDER BY name');
    res.json({ siteTypes: result.rows });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sites/:id
 * Get single site by ID
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT s.*, st.name as site_type_name
       FROM sites s
       JOIN site_types st ON s.site_type_id = st.id
       WHERE s.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }

    res.json({ site: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/sites
 * Create a new site
 */
router.post('/', authenticate, authorize('admin'), [
  body('code').notEmpty().trim(),
  body('name').notEmpty().trim(),
  body('siteTypeId').isUUID()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { code, name, siteTypeId, address, city, region, country, contactName, contactPhone, contactEmail, latitude, longitude } = req.body;

    const result = await query(
      `INSERT INTO sites (code, name, site_type_id, address, city, region, country, contact_name, contact_phone, contact_email, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [code, name, siteTypeId, address, city, region, country || 'Zimbabwe', contactName, contactPhone, contactEmail, latitude, longitude]
    );

    res.status(201).json({ site: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: { message: 'Site code already exists' } });
    }
    next(error);
  }
});

/**
 * PUT /api/sites/:id
 * Update a site
 */
router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { code, name, siteTypeId, address, city, region, country, contactName, contactPhone, contactEmail, latitude, longitude, isActive } = req.body;

    const result = await query(
      `UPDATE sites SET
         code = COALESCE($1, code),
         name = COALESCE($2, name),
         site_type_id = COALESCE($3, site_type_id),
         address = COALESCE($4, address),
         city = COALESCE($5, city),
         region = COALESCE($6, region),
         country = COALESCE($7, country),
         contact_name = COALESCE($8, contact_name),
         contact_phone = COALESCE($9, contact_phone),
         contact_email = COALESCE($10, contact_email),
         latitude = COALESCE($11, latitude),
         longitude = COALESCE($12, longitude),
         is_active = COALESCE($13, is_active),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $14
       RETURNING *`,
      [code, name, siteTypeId, address, city, region, country, contactName, contactPhone, contactEmail, latitude, longitude, isActive, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }

    res.json({ site: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sites/:id/inventory
 * Get packaging inventory for a site
 */
router.get('/:id/inventory', authenticate, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT spi.*, pt.name as packaging_type_name, pt.code as packaging_type_code,
              spt.min_threshold, spt.max_threshold
       FROM site_packaging_inventory spi
       JOIN packaging_types pt ON spi.packaging_type_id = pt.id
       LEFT JOIN site_packaging_thresholds spt ON spi.site_id = spt.site_id AND spi.packaging_type_id = spt.packaging_type_id
       WHERE spi.site_id = $1
       ORDER BY pt.name`,
      [req.params.id]
    );

    res.json({ inventory: result.rows });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/sites/:id/inventory/:packagingTypeId
 * Update inventory for a site (manual adjustment)
 */
router.put('/:id/inventory/:packagingTypeId', authenticate, authorize('admin', 'dispatcher', 'farm_user', 'depot_user'), async (req, res, next) => {
  try {
    const { quantity, quantityDamaged, notes } = req.body;
    const { id: siteId, packagingTypeId } = req.params;

    // Get current inventory
    const current = await query(
      'SELECT quantity FROM site_packaging_inventory WHERE site_id = $1 AND packaging_type_id = $2',
      [siteId, packagingTypeId]
    );

    const currentQty = current.rows.length > 0 ? current.rows[0].quantity : 0;
    const adjustment = quantity - currentQty;

    // Update or insert inventory
    await query(
      `INSERT INTO site_packaging_inventory (site_id, packaging_type_id, quantity, quantity_damaged, last_counted_at, last_counted_by)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)
       ON CONFLICT (site_id, packaging_type_id) DO UPDATE SET
         quantity = $3,
         quantity_damaged = COALESCE($4, site_packaging_inventory.quantity_damaged),
         last_counted_at = CURRENT_TIMESTAMP,
         last_counted_by = $5,
         updated_at = CURRENT_TIMESTAMP`,
      [siteId, packagingTypeId, quantity, quantityDamaged, req.user.id]
    );

    // Record movement for audit
    if (adjustment !== 0) {
      await query(
        `INSERT INTO packaging_movements (movement_type, site_id, packaging_type_id, quantity, notes, recorded_by)
         VALUES ('adjustment', $1, $2, $3, $4, $5)`,
        [siteId, packagingTypeId, adjustment, notes || 'Manual inventory adjustment', req.user.id]
      );
    }

    res.json({ message: 'Inventory updated successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
