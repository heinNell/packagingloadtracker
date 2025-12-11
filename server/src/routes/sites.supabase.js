import express from 'express';
import { body, validationResult } from 'express-validator';
import { supabase } from '../db/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/sites
 * Get all sites with optional filtering
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { type, active, search } = req.query;
    
    let query = supabase
      .from('sites')
      .select(`
        *,
        site_types!inner (name)
      `)
      .order('name');

    if (type) {
      query = query.eq('site_types.name', type);
    }

    if (active !== undefined) {
      query = query.eq('is_active', active === 'true');
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Transform data to match expected format
    const sites = data.map(site => ({
      ...site,
      site_type_name: site.site_types?.name,
      load_count: 0 // Will be calculated separately if needed
    }));

    res.json({ sites });
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
    const { data, error } = await supabase
      .from('site_types')
      .select('*')
      .order('name');

    if (error) throw error;

    res.json({ siteTypes: data });
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
    const { data, error } = await supabase
      .from('sites')
      .select(`
        *,
        site_types (name)
      `)
      .eq('id', req.params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Site not found' } });
      }
      throw error;
    }

    const site = {
      ...data,
      site_type_name: data.site_types?.name
    };

    res.json({ site });
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

    const { data, error } = await supabase
      .from('sites')
      .insert({
        code,
        name,
        site_type_id: siteTypeId,
        address,
        city,
        region,
        country: country || 'Zimbabwe',
        contact_name: contactName,
        contact_phone: contactPhone,
        contact_email: contactEmail,
        latitude,
        longitude
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: { message: 'Site code already exists' } });
      }
      throw error;
    }

    res.status(201).json({ site: data });
  } catch (error) {
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

    const updateData = {};
    if (code !== undefined) updateData.code = code;
    if (name !== undefined) updateData.name = name;
    if (siteTypeId !== undefined) updateData.site_type_id = siteTypeId;
    if (address !== undefined) updateData.address = address;
    if (city !== undefined) updateData.city = city;
    if (region !== undefined) updateData.region = region;
    if (country !== undefined) updateData.country = country;
    if (contactName !== undefined) updateData.contact_name = contactName;
    if (contactPhone !== undefined) updateData.contact_phone = contactPhone;
    if (contactEmail !== undefined) updateData.contact_email = contactEmail;
    if (latitude !== undefined) updateData.latitude = latitude;
    if (longitude !== undefined) updateData.longitude = longitude;
    if (isActive !== undefined) updateData.is_active = isActive;
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('sites')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Site not found' } });
      }
      throw error;
    }

    res.json({ site: data });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/sites/:id
 * Delete a site (soft delete by setting is_active = false)
 */
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('sites')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Site not found' } });
      }
      throw error;
    }

    res.json({ message: 'Site deleted', site: data });
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
    const { data, error } = await supabase
      .from('site_packaging_inventory')
      .select(`
        *,
        packaging_types (id, code, name, is_returnable)
      `)
      .eq('site_id', req.params.id);

    if (error) throw error;

    const inventory = data.map(item => ({
      ...item,
      packaging_type_code: item.packaging_types?.code,
      packaging_type_name: item.packaging_types?.name,
      is_returnable: item.packaging_types?.is_returnable
    }));

    res.json({ inventory });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/sites/:id/inventory/adjust
 * Adjust inventory for a site (manual count, purchase, etc.)
 */
router.post('/:id/inventory/adjust', authenticate, authorize('admin', 'dispatcher'), [
  body('packagingTypeId').isUUID(),
  body('quantity').isInt(),
  body('adjustmentType').isIn(['adjustment', 'purchase', 'disposal', 'damage', 'repair', 'loss']),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { packagingTypeId, quantity, adjustmentType, notes } = req.body;
    const siteId = req.params.id;

    // Get current inventory
    const { data: existing } = await supabase
      .from('site_packaging_inventory')
      .select('*')
      .eq('site_id', siteId)
      .eq('packaging_type_id', packagingTypeId)
      .single();

    if (existing) {
      await supabase
        .from('site_packaging_inventory')
        .update({
          quantity: existing.quantity + quantity,
          handling_count: (existing.handling_count || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('site_packaging_inventory')
        .insert({
          site_id: siteId,
          packaging_type_id: packagingTypeId,
          quantity: quantity,
          handling_count: 1
        });
    }

    // Record movement
    await supabase
      .from('packaging_movements')
      .insert({
        movement_type: adjustmentType,
        site_id: siteId,
        packaging_type_id: packagingTypeId,
        quantity: Math.abs(quantity),
        direction: quantity >= 0 ? 'in' : 'out',
        notes: notes,
        recorded_by: req.user?.id || null
      });

    res.json({ message: 'Inventory adjusted successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sites/:id/movements
 * Get packaging movements for a site
 */
router.get('/:id/movements', authenticate, async (req, res, next) => {
  try {
    const { limit = 50, offset = 0, packagingTypeId } = req.query;

    let query = supabase
      .from('packaging_movements')
      .select(`
        *,
        packaging_types (id, code, name),
        loads (id, load_number),
        users:recorded_by (first_name, last_name)
      `, { count: 'exact' })
      .eq('site_id', req.params.id)
      .order('recorded_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (packagingTypeId) {
      query = query.eq('packaging_type_id', packagingTypeId);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    const movements = data.map(m => ({
      ...m,
      packaging_type_code: m.packaging_types?.code,
      packaging_type_name: m.packaging_types?.name,
      load_number: m.loads?.load_number,
      recorded_by_name: m.users ? `${m.users.first_name} ${m.users.last_name}` : null
    }));

    res.json({ 
      movements,
      pagination: { total: count || 0, limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
