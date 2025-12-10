import bcrypt from 'bcryptjs';
import express from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db/index.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// =====================================================
// USER MANAGEMENT
// =====================================================

/**
 * GET /api/config/users
 * Get all users (admin only)
 */
router.get('/users', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const result = await query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.phone,
             u.assigned_site_id, s.name as assigned_site_name, u.is_active,
             u.created_at, u.updated_at
      FROM users u
      LEFT JOIN sites s ON u.assigned_site_id = s.id
      ORDER BY u.first_name, u.last_name
    `);
    res.json({ users: result.rows });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/config/users
 * Create a new user (admin only)
 */
router.post('/users', authenticate, authorize('admin'), [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('firstName').notEmpty().trim(),
  body('lastName').notEmpty().trim(),
  body('role').isIn(['admin', 'dispatcher', 'farm_user', 'depot_user', 'readonly'])
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, firstName, lastName, role, phone, assignedSiteId } = req.body;

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: { message: 'Email already registered' } });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, phone, assigned_site_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, email, first_name, last_name, role, phone, assigned_site_id, is_active
    `, [email, passwordHash, firstName, lastName, role, phone || null, assignedSiteId || null]);

    res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/config/users/:id
 * Update a user (admin only)
 */
router.put('/users/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { email, firstName, lastName, role, phone, assignedSiteId, isActive, password } = req.body;

    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    const result = await query(`
      UPDATE users SET
        email = COALESCE($1, email),
        first_name = COALESCE($2, first_name),
        last_name = COALESCE($3, last_name),
        role = COALESCE($4, role),
        phone = COALESCE($5, phone),
        assigned_site_id = COALESCE($6, assigned_site_id),
        is_active = COALESCE($7, is_active),
        password_hash = COALESCE($8, password_hash),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING id, email, first_name, last_name, role, phone, assigned_site_id, is_active
    `, [email, firstName, lastName, role, phone, assignedSiteId, isActive, passwordHash, req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// VEHICLE MANAGEMENT
// =====================================================

/**
 * GET /api/config/vehicles
 */
router.get('/vehicles', authenticate, async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM vehicles ORDER BY name');
    res.json({ vehicles: result.rows });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/config/vehicles
 */
router.post('/vehicles', authenticate, authorize('admin'), [
  body('registration').notEmpty().trim(),
  body('name').notEmpty().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { registration, name, vehicleType, capacityKg } = req.body;

    const result = await query(`
      INSERT INTO vehicles (registration, name, vehicle_type, capacity_kg)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [registration, name, vehicleType || null, capacityKg || null]);

    res.status(201).json({ vehicle: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: { message: 'Vehicle registration already exists' } });
    }
    next(error);
  }
});

/**
 * PUT /api/config/vehicles/:id
 */
router.put('/vehicles/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { registration, name, vehicleType, capacityKg, isActive } = req.body;

    const result = await query(`
      UPDATE vehicles SET
        registration = COALESCE($1, registration),
        name = COALESCE($2, name),
        vehicle_type = COALESCE($3, vehicle_type),
        capacity_kg = COALESCE($4, capacity_kg),
        is_active = COALESCE($5, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `, [registration, name, vehicleType, capacityKg, isActive, req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Vehicle not found' } });
    }

    res.json({ vehicle: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// DRIVER MANAGEMENT
// =====================================================

/**
 * GET /api/config/drivers
 */
router.get('/drivers', authenticate, async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM drivers ORDER BY first_name, last_name');
    res.json({ drivers: result.rows });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/config/drivers
 */
router.post('/drivers', authenticate, authorize('admin'), [
  body('firstName').notEmpty().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { employeeId, firstName, lastName, phone, licenseNumber } = req.body;

    const result = await query(`
      INSERT INTO drivers (employee_id, first_name, last_name, phone, license_number)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [employeeId || null, firstName, lastName || '', phone || null, licenseNumber || null]);

    res.status(201).json({ driver: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/config/drivers/:id
 */
router.put('/drivers/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { employeeId, firstName, lastName, phone, licenseNumber, isActive } = req.body;

    const result = await query(`
      UPDATE drivers SET
        employee_id = COALESCE($1, employee_id),
        first_name = COALESCE($2, first_name),
        last_name = COALESCE($3, last_name),
        phone = COALESCE($4, phone),
        license_number = COALESCE($5, license_number),
        is_active = COALESCE($6, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `, [employeeId, firstName, lastName, phone, licenseNumber, isActive, req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Driver not found' } });
    }

    res.json({ driver: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// THRESHOLD MANAGEMENT
// =====================================================

/**
 * GET /api/config/thresholds
 * Get all packaging thresholds
 */
router.get('/thresholds', authenticate, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT spt.*, s.name as site_name, s.code as site_code, pt.name as packaging_type_name
      FROM site_packaging_thresholds spt
      JOIN sites s ON spt.site_id = s.id
      JOIN packaging_types pt ON spt.packaging_type_id = pt.id
      ORDER BY s.name, pt.name
    `);
    res.json({ thresholds: result.rows });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/config/thresholds
 * Create or update a threshold
 */
router.post('/thresholds', authenticate, authorize('admin'), [
  body('siteId').isUUID(),
  body('packagingTypeId').isUUID(),
  body('minThreshold').isInt({ min: 0 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { siteId, packagingTypeId, minThreshold, maxThreshold, alertEnabled } = req.body;

    const result = await query(`
      INSERT INTO site_packaging_thresholds (site_id, packaging_type_id, min_threshold, max_threshold, alert_enabled)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (site_id, packaging_type_id) DO UPDATE SET
        min_threshold = EXCLUDED.min_threshold,
        max_threshold = EXCLUDED.max_threshold,
        alert_enabled = EXCLUDED.alert_enabled,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [siteId, packagingTypeId, minThreshold, maxThreshold || null, alertEnabled !== false]);

    res.json({ threshold: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/config/thresholds/:id
 */
router.delete('/thresholds/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const result = await query('DELETE FROM site_packaging_thresholds WHERE id = $1 RETURNING id', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Threshold not found' } });
    }

    res.json({ message: 'Threshold deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// CHANNEL MANAGEMENT
// =====================================================

/**
 * GET /api/config/channels
 */
router.get('/channels', authenticate, async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM channels ORDER BY name');
    res.json({ channels: result.rows });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/config/channels
 */
router.post('/channels', authenticate, authorize('admin'), [
  body('code').notEmpty().trim(),
  body('name').notEmpty().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { code, name } = req.body;

    const result = await query(`
      INSERT INTO channels (code, name)
      VALUES ($1, $2)
      RETURNING *
    `, [code, name]);

    res.status(201).json({ channel: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: { message: 'Channel code already exists' } });
    }
    next(error);
  }
});

export default router;
