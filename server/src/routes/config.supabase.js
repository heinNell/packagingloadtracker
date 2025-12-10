import bcrypt from 'bcryptjs';
import express from 'express';
import { body, validationResult } from 'express-validator';
import { supabase } from '../db/supabase.js';
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
    const { data, error } = await supabase
      .from('users')
      .select(`
        id, email, first_name, last_name, role, phone,
        assigned_site_id, is_active, created_at, updated_at,
        sites (name)
      `)
      .order('first_name')
      .order('last_name');

    if (error) throw error;

    const users = data.map(u => ({
      ...u,
      assigned_site_name: u.sites?.name
    }));

    res.json({ users });
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

    // Check if email exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      return res.status(400).json({ error: { message: 'Email already registered' } });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: passwordHash,
        first_name: firstName,
        last_name: lastName,
        role,
        phone: phone || null,
        assigned_site_id: assignedSiteId || null
      })
      .select('id, email, first_name, last_name, role, phone, assigned_site_id, is_active')
      .single();

    if (error) throw error;

    res.status(201).json({ user: data });
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

    const updateData = { updated_at: new Date().toISOString() };
    
    if (email !== undefined) updateData.email = email;
    if (firstName !== undefined) updateData.first_name = firstName;
    if (lastName !== undefined) updateData.last_name = lastName;
    if (role !== undefined) updateData.role = role;
    if (phone !== undefined) updateData.phone = phone;
    if (assignedSiteId !== undefined) updateData.assigned_site_id = assignedSiteId;
    if (isActive !== undefined) updateData.is_active = isActive;
    
    if (password) {
      updateData.password_hash = await bcrypt.hash(password, 10);
    }

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', req.params.id)
      .select('id, email, first_name, last_name, role, phone, assigned_site_id, is_active')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'User not found' } });
      }
      throw error;
    }

    res.json({ user: data });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/config/users/:id
 * Delete a user (soft delete)
 */
router.delete('/users/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'User not found' } });
      }
      throw error;
    }

    res.json({ message: 'User deleted' });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// VEHICLE MANAGEMENT
// =====================================================

router.get('/vehicles', authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .order('registration');

    if (error) throw error;

    res.json({ vehicles: data });
  } catch (error) {
    next(error);
  }
});

router.post('/vehicles', authenticate, authorize('admin'), [
  body('registration').notEmpty().trim(),
  body('name').notEmpty().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { registration, name, vehicleType, capacityKg, notes } = req.body;

    const { data, error } = await supabase
      .from('vehicles')
      .insert({
        registration,
        name,
        vehicle_type: vehicleType || 'Truck',
        capacity_kg: capacityKg,
        notes
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: { message: 'Vehicle registration already exists' } });
      }
      throw error;
    }

    res.status(201).json({ vehicle: data });
  } catch (error) {
    next(error);
  }
});

router.put('/vehicles/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { registration, name, vehicleType, capacityKg, notes, isActive } = req.body;

    const updateData = { updated_at: new Date().toISOString() };
    if (registration !== undefined) updateData.registration = registration;
    if (name !== undefined) updateData.name = name;
    if (vehicleType !== undefined) updateData.vehicle_type = vehicleType;
    if (capacityKg !== undefined) updateData.capacity_kg = capacityKg;
    if (notes !== undefined) updateData.notes = notes;
    if (isActive !== undefined) updateData.is_active = isActive;

    const { data, error } = await supabase
      .from('vehicles')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Vehicle not found' } });
      }
      throw error;
    }

    res.json({ vehicle: data });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// DRIVER MANAGEMENT
// =====================================================

router.get('/drivers', authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .order('first_name');

    if (error) throw error;

    res.json({ drivers: data });
  } catch (error) {
    next(error);
  }
});

router.post('/drivers', authenticate, authorize('admin'), [
  body('firstName').notEmpty().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { firstName, lastName, phone, licenseNumber, notes } = req.body;

    const { data, error } = await supabase
      .from('drivers')
      .insert({
        first_name: firstName,
        last_name: lastName || '',
        phone,
        license_number: licenseNumber,
        notes
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ driver: data });
  } catch (error) {
    next(error);
  }
});

router.put('/drivers/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { firstName, lastName, phone, licenseNumber, notes, isActive } = req.body;

    const updateData = { updated_at: new Date().toISOString() };
    if (firstName !== undefined) updateData.first_name = firstName;
    if (lastName !== undefined) updateData.last_name = lastName;
    if (phone !== undefined) updateData.phone = phone;
    if (licenseNumber !== undefined) updateData.license_number = licenseNumber;
    if (notes !== undefined) updateData.notes = notes;
    if (isActive !== undefined) updateData.is_active = isActive;

    const { data, error } = await supabase
      .from('drivers')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Driver not found' } });
      }
      throw error;
    }

    res.json({ driver: data });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// CHANNEL MANAGEMENT
// =====================================================

router.get('/channels', authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .order('name');

    if (error) throw error;

    res.json({ channels: data });
  } catch (error) {
    next(error);
  }
});

router.post('/channels', authenticate, authorize('admin'), [
  body('code').notEmpty().trim(),
  body('name').notEmpty().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { code, name, description } = req.body;

    const { data, error } = await supabase
      .from('channels')
      .insert({ code, name, description })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: { message: 'Channel code already exists' } });
      }
      throw error;
    }

    res.status(201).json({ channel: data });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// PRODUCT MANAGEMENT
// =====================================================

router.get('/products/types', authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('product_types')
      .select('*')
      .order('name');

    if (error) throw error;

    res.json({ productTypes: data });
  } catch (error) {
    next(error);
  }
});

router.get('/products/grades', authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('product_grades')
      .select('*')
      .order('sort_order');

    if (error) throw error;

    res.json({ productGrades: data });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// ALL SETTINGS (combined for settings page)
// =====================================================

router.get('/all', authenticate, async (req, res, next) => {
  try {
    const [
      { data: users },
      { data: vehicles },
      { data: drivers },
      { data: channels },
      { data: productTypes },
      { data: productGrades },
      { data: packagingTypes },
      { data: siteTypes }
    ] = await Promise.all([
      supabase.from('users').select('id, email, first_name, last_name, role, is_active').order('first_name'),
      supabase.from('vehicles').select('*').order('registration'),
      supabase.from('drivers').select('*').order('first_name'),
      supabase.from('channels').select('*').order('name'),
      supabase.from('product_types').select('*').order('name'),
      supabase.from('product_grades').select('*').order('sort_order'),
      supabase.from('packaging_types').select('*').order('name'),
      supabase.from('site_types').select('*').order('name')
    ]);

    res.json({
      users: users || [],
      vehicles: vehicles || [],
      drivers: drivers || [],
      channels: channels || [],
      productTypes: productTypes || [],
      productGrades: productGrades || [],
      packagingTypes: packagingTypes || [],
      siteTypes: siteTypes || []
    });
  } catch (error) {
    next(error);
  }
});

export default router;
