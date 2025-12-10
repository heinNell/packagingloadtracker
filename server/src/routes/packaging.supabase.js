import express from 'express';
import { body, validationResult } from 'express-validator';
import { supabase } from '../db/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/packaging/types
 * Get all packaging types
 */
router.get('/types', authenticate, async (req, res, next) => {
  try {
    const { active } = req.query;
    
    let query = supabase
      .from('packaging_types')
      .select('*')
      .order('name');

    if (active !== undefined) {
      query = query.eq('is_active', active === 'true');
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ packagingTypes: data });
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

    const { data, error } = await supabase
      .from('packaging_types')
      .insert({
        code,
        name,
        description,
        capacity_kg: capacityKg,
        capacity_liters: capacityLiters,
        weight_empty_kg: weightEmptyKg,
        dimensions_cm: dimensionsCm,
        expected_turnaround_days: expectedTurnaroundDays || 14,
        is_returnable: isReturnable !== false
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: { message: 'Packaging type code already exists' } });
      }
      throw error;
    }

    res.status(201).json({ packagingType: data });
  } catch (error) {
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

    const updateData = { updated_at: new Date().toISOString() };
    if (code !== undefined) updateData.code = code;
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (capacityKg !== undefined) updateData.capacity_kg = capacityKg;
    if (capacityLiters !== undefined) updateData.capacity_liters = capacityLiters;
    if (weightEmptyKg !== undefined) updateData.weight_empty_kg = weightEmptyKg;
    if (dimensionsCm !== undefined) updateData.dimensions_cm = dimensionsCm;
    if (expectedTurnaroundDays !== undefined) updateData.expected_turnaround_days = expectedTurnaroundDays;
    if (isReturnable !== undefined) updateData.is_returnable = isReturnable;
    if (isActive !== undefined) updateData.is_active = isActive;

    const { data, error } = await supabase
      .from('packaging_types')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Packaging type not found' } });
      }
      throw error;
    }

    res.json({ packagingType: data });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/packaging/inventory
 * Get packaging inventory across all sites
 */
router.get('/inventory', authenticate, async (req, res, next) => {
  try {
    const { siteId, packagingTypeId } = req.query;

    let query = supabase
      .from('site_packaging_inventory')
      .select(`
        *,
        sites (id, code, name),
        packaging_types (id, code, name, is_returnable)
      `);

    if (siteId) {
      query = query.eq('site_id', siteId);
    }

    if (packagingTypeId) {
      query = query.eq('packaging_type_id', packagingTypeId);
    }

    const { data, error } = await query;

    if (error) throw error;

    const inventory = data.map(item => ({
      ...item,
      site_code: item.sites?.code,
      site_name: item.sites?.name,
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
 * PUT /api/packaging/inventory/:siteId/:packagingTypeId
 * Update inventory for a site/packaging combination
 */
router.put('/inventory/:siteId/:packagingTypeId', authenticate, authorize('admin', 'dispatcher'), async (req, res, next) => {
  try {
    const { siteId, packagingTypeId } = req.params;
    const { quantity, quantityDamaged, notes } = req.body;

    // Check if record exists
    const { data: existing } = await supabase
      .from('site_packaging_inventory')
      .select('id')
      .eq('site_id', siteId)
      .eq('packaging_type_id', packagingTypeId)
      .single();

    let result;
    if (existing) {
      // Update
      const { data, error } = await supabase
        .from('site_packaging_inventory')
        .update({
          quantity,
          quantity_damaged: quantityDamaged,
          notes,
          last_count_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('site_id', siteId)
        .eq('packaging_type_id', packagingTypeId)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Insert
      const { data, error } = await supabase
        .from('site_packaging_inventory')
        .insert({
          site_id: siteId,
          packaging_type_id: packagingTypeId,
          quantity,
          quantity_damaged: quantityDamaged,
          notes,
          last_count_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    res.json({ inventory: result });
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

    let query = supabase
      .from('packaging_movements')
      .select(`
        *,
        sites (id, code, name),
        packaging_types (id, code, name),
        loads (id, load_number),
        users (id, first_name, last_name)
      `)
      .order('recorded_at', { ascending: false })
      .limit(parseInt(limit));

    if (siteId) query = query.eq('site_id', siteId);
    if (packagingTypeId) query = query.eq('packaging_type_id', packagingTypeId);
    if (startDate) query = query.gte('recorded_at', startDate);
    if (endDate) query = query.lte('recorded_at', endDate);

    const { data, error } = await query;

    if (error) throw error;

    const movements = data.map(m => ({
      ...m,
      site_code: m.sites?.code,
      site_name: m.sites?.name,
      packaging_type_code: m.packaging_types?.code,
      packaging_type_name: m.packaging_types?.name,
      load_number: m.loads?.load_number,
      recorded_by_name: m.users ? `${m.users.first_name} ${m.users.last_name}` : null
    }));

    res.json({ movements });
  } catch (error) {
    next(error);
  }
});

export default router;
