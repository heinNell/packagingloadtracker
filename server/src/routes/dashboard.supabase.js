import express from 'express';
import { supabase } from '../db/supabase.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/dashboard/summary
 * Get main dashboard summary data
 */
router.get('/summary', authenticate, async (req, res, next) => {
  try {
    // Get all sites with their types
    const { data: sites, error: sitesError } = await supabase
      .from('sites')
      .select(`
        id, code, name,
        site_types (name)
      `)
      .eq('is_active', true)
      .order('name');

    if (sitesError) throw sitesError;

    // Get all packaging types
    const { data: packagingTypes, error: ptError } = await supabase
      .from('packaging_types')
      .select('id, code, name')
      .eq('is_active', true);

    if (ptError) throw ptError;

    // Get inventory for all sites
    const { data: inventory, error: invError } = await supabase
      .from('site_packaging_inventory')
      .select('site_id, packaging_type_id, quantity, quantity_damaged');

    if (invError) throw invError;

    // Get thresholds
    const { data: thresholds, error: threshError } = await supabase
      .from('site_packaging_thresholds')
      .select('site_id, packaging_type_id, min_threshold');

    if (threshError) throw threshError;

    // Build site balances
    const siteBalances = sites.map(site => {
      const packaging = packagingTypes.map(pt => {
        const inv = inventory.find(i => i.site_id === site.id && i.packaging_type_id === pt.id);
        const thresh = thresholds.find(t => t.site_id === site.id && t.packaging_type_id === pt.id);
        const quantity = inv?.quantity || 0;
        const minThreshold = thresh?.min_threshold;
        
        let status = 'normal';
        if (minThreshold && quantity <= minThreshold) status = 'critical';
        else if (minThreshold && quantity <= minThreshold * 1.2) status = 'warning';

        return {
          packaging_type_id: pt.id,
          packaging_type_code: pt.code,
          packaging_type_name: pt.name,
          quantity,
          quantity_damaged: inv?.quantity_damaged || 0,
          min_threshold: minThreshold,
          status
        };
      });

      return {
        site_id: site.id,
        site_code: site.code,
        site_name: site.name,
        site_type: site.site_types?.name,
        packaging
      };
    });

    // Get loads in transit
    const { data: loadsInTransit, error: loadError } = await supabase
      .from('loads')
      .select(`
        id,
        load_packaging (
          packaging_type_id,
          quantity_dispatched,
          packaging_types (id, code, name)
        )
      `)
      .in('status', ['departed', 'in_transit', 'arrived_depot']);

    if (loadError) throw loadError;

    // Aggregate in-transit packaging
    const inTransitMap = new Map();
    loadsInTransit.forEach(load => {
      load.load_packaging?.forEach(lp => {
        const key = lp.packaging_type_id;
        if (!inTransitMap.has(key)) {
          inTransitMap.set(key, {
            packaging_type_id: lp.packaging_types?.id,
            packaging_type_code: lp.packaging_types?.code,
            packaging_type_name: lp.packaging_types?.name,
            total_in_transit: 0,
            load_count: 0
          });
        }
        const item = inTransitMap.get(key);
        item.total_in_transit += lp.quantity_dispatched || 0;
        item.load_count++;
      });
    });
    const inTransit = Array.from(inTransitMap.values());

    // Get today's load stats
    const today = new Date().toISOString().split('T')[0];
    const { data: todayLoads, error: todayError } = await supabase
      .from('loads')
      .select('status, dispatch_date, actual_arrival_time');

    if (todayError) throw todayError;

    const todaysLoads = {
      dispatched_today: todayLoads.filter(l => l.dispatch_date === today).length,
      received_today: todayLoads.filter(l => l.actual_arrival_time?.startsWith(today)).length,
      currently_in_transit: todayLoads.filter(l => ['departed', 'in_transit'].includes(l.status)).length,
      pending_dispatch: todayLoads.filter(l => l.status === 'scheduled' && l.dispatch_date === today).length
    };

    // Get recent discrepancies
    const { data: discrepancyLoads, error: discError } = await supabase
      .from('loads')
      .select(`
        id, load_number, dispatch_date, discrepancy_notes,
        origin_site:sites!loads_origin_site_id_fkey (name),
        destination_site:sites!loads_destination_site_id_fkey (name),
        load_packaging (
          quantity_dispatched, quantity_received, quantity_damaged, quantity_missing,
          packaging_types (name)
        )
      `)
      .eq('has_discrepancy', true)
      .order('confirmed_receipt_at', { ascending: false })
      .limit(10);

    if (discError) throw discError;

    const discrepancies = discrepancyLoads.map(l => ({
      id: l.id,
      load_number: l.load_number,
      dispatch_date: l.dispatch_date,
      origin_site: l.origin_site?.name,
      destination_site: l.destination_site?.name,
      discrepancy_notes: l.discrepancy_notes,
      items: l.load_packaging?.map(lp => ({
        packaging_type: lp.packaging_types?.name,
        dispatched: lp.quantity_dispatched,
        received: lp.quantity_received,
        damaged: lp.quantity_damaged,
        missing: lp.quantity_missing
      }))
    }));

    // Get alerts
    const { data: alerts, error: alertError } = await supabase
      .from('alerts')
      .select(`
        *,
        sites (name),
        loads (load_number),
        packaging_types (name)
      `)
      .eq('is_acknowledged', false)
      .order('created_at', { ascending: false })
      .limit(20);

    if (alertError) throw alertError;

    const formattedAlerts = alerts.map(a => ({
      ...a,
      site_name: a.sites?.name,
      load_number: a.loads?.load_number,
      packaging_type_name: a.packaging_types?.name
    }));

    res.json({
      siteBalances,
      inTransit,
      todaysLoads,
      discrepancies,
      alerts: formattedAlerts
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    next(error);
  }
});

/**
 * GET /api/dashboard/site/:id
 * Get dashboard data for a specific site
 */
router.get('/site/:id', authenticate, async (req, res, next) => {
  try {
    const siteId = req.params.id;

    // Get site info
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select(`*, site_types (name)`)
      .eq('id', siteId)
      .single();

    if (siteError) {
      if (siteError.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Site not found' } });
      }
      throw siteError;
    }

    // Get inventory
    const { data: inventory, error: invError } = await supabase
      .from('site_packaging_inventory')
      .select(`
        *,
        packaging_types (id, code, name, is_returnable)
      `)
      .eq('site_id', siteId);

    if (invError) throw invError;

    // Get recent loads (as origin)
    const { data: outgoingLoads, error: outError } = await supabase
      .from('loads')
      .select(`
        id, load_number, dispatch_date, status,
        destination_site:sites!loads_destination_site_id_fkey (code, name)
      `)
      .eq('origin_site_id', siteId)
      .order('dispatch_date', { ascending: false })
      .limit(10);

    if (outError) throw outError;

    // Get recent loads (as destination)
    const { data: incomingLoads, error: inError } = await supabase
      .from('loads')
      .select(`
        id, load_number, dispatch_date, status,
        origin_site:sites!loads_origin_site_id_fkey (code, name)
      `)
      .eq('destination_site_id', siteId)
      .order('dispatch_date', { ascending: false })
      .limit(10);

    if (inError) throw inError;

    res.json({
      site: { ...site, site_type_name: site.site_types?.name },
      inventory: inventory.map(i => ({
        ...i,
        packaging_type_code: i.packaging_types?.code,
        packaging_type_name: i.packaging_types?.name
      })),
      outgoingLoads,
      incomingLoads
    });
  } catch (error) {
    next(error);
  }
});

export default router;
