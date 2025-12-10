import express from 'express';
import { supabase } from '../db/supabase.js';
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

    // Get site info
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('*')
      .eq('id', siteId)
      .single();

    if (siteError) {
      if (siteError.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Site not found' } });
      }
      throw siteError;
    }

    // Get loads where site is origin
    let sentQuery = supabase
      .from('loads')
      .select(`
        id, dispatch_date,
        load_packaging (
          quantity_dispatched,
          packaging_types (name)
        )
      `)
      .eq('origin_site_id', siteId);

    if (startDate && endDate) {
      sentQuery = sentQuery.gte('dispatch_date', startDate).lte('dispatch_date', endDate);
    }

    const { data: sentLoads, error: sentError } = await sentQuery;
    if (sentError) throw sentError;

    // Aggregate sent packaging
    const sentMap = new Map();
    sentLoads.forEach(load => {
      load.load_packaging?.forEach(lp => {
        const name = lp.packaging_types?.name || 'Unknown';
        if (!sentMap.has(name)) {
          sentMap.set(name, { packaging_type: name, total_sent: 0, load_count: 0 });
        }
        sentMap.get(name).total_sent += lp.quantity_dispatched || 0;
        sentMap.get(name).load_count++;
      });
    });

    // Get loads where site is destination
    let receivedQuery = supabase
      .from('loads')
      .select(`
        id, dispatch_date,
        load_packaging (
          quantity_dispatched, quantity_received, quantity_damaged,
          packaging_types (name)
        )
      `)
      .eq('destination_site_id', siteId)
      .eq('status', 'completed');

    if (startDate && endDate) {
      receivedQuery = receivedQuery.gte('dispatch_date', startDate).lte('dispatch_date', endDate);
    }

    const { data: receivedLoads, error: receivedError } = await receivedQuery;
    if (receivedError) throw receivedError;

    // Aggregate received packaging
    const receivedMap = new Map();
    receivedLoads.forEach(load => {
      load.load_packaging?.forEach(lp => {
        const name = lp.packaging_types?.name || 'Unknown';
        if (!receivedMap.has(name)) {
          receivedMap.set(name, { packaging_type: name, total_received: 0, total_damaged: 0, load_count: 0 });
        }
        receivedMap.get(name).total_received += lp.quantity_received || lp.quantity_dispatched || 0;
        receivedMap.get(name).total_damaged += lp.quantity_damaged || 0;
        receivedMap.get(name).load_count++;
      });
    });

    // Get current inventory
    const { data: inventory, error: invError } = await supabase
      .from('site_packaging_inventory')
      .select(`
        quantity, quantity_damaged,
        packaging_types (name)
      `)
      .eq('site_id', siteId);

    if (invError) throw invError;

    const inventoryList = inventory.map(i => ({
      packaging_type: i.packaging_types?.name,
      on_hand: i.quantity || 0,
      damaged: i.quantity_damaged || 0
    }));

    res.json({
      site,
      sentOut: Array.from(sentMap.values()),
      received: Array.from(receivedMap.values()),
      outstanding: [], // Complex query - simplified for now
      inventory: inventoryList,
      dateRange: { startDate, endDate }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/depot-statement/:siteId
 * Get depot statement
 */
router.get('/depot-statement/:siteId', authenticate, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const { siteId } = req.params;

    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('*')
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
        quantity, quantity_damaged,
        packaging_types (id, code, name)
      `)
      .eq('site_id', siteId);

    if (invError) throw invError;

    // Get incoming loads
    let incomingQuery = supabase
      .from('loads')
      .select(`
        id, load_number, dispatch_date, status,
        origin_site:sites!loads_origin_site_id_fkey (code, name),
        load_packaging (
          quantity_dispatched, quantity_received, quantity_damaged,
          packaging_types (name)
        )
      `)
      .eq('destination_site_id', siteId)
      .order('dispatch_date', { ascending: false })
      .limit(50);

    if (startDate && endDate) {
      incomingQuery = incomingQuery.gte('dispatch_date', startDate).lte('dispatch_date', endDate);
    }

    const { data: incomingLoads, error: inError } = await incomingQuery;
    if (inError) throw inError;

    res.json({
      site,
      inventory: inventory.map(i => ({
        packaging_type: i.packaging_types?.name,
        packaging_type_code: i.packaging_types?.code,
        on_hand: i.quantity || 0,
        damaged: i.quantity_damaged || 0
      })),
      incomingLoads: incomingLoads.map(l => ({
        ...l,
        origin_site_name: l.origin_site?.name,
        origin_site_code: l.origin_site?.code
      })),
      dateRange: { startDate, endDate }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/discrepancies
 * Get discrepancy report
 */
router.get('/discrepancies', authenticate, async (req, res, next) => {
  try {
    const { startDate, endDate, siteId, limit = 50 } = req.query;

    let query = supabase
      .from('loads')
      .select(`
        id, load_number, dispatch_date, discrepancy_notes, confirmed_receipt_at,
        origin_site:sites!loads_origin_site_id_fkey (code, name),
        destination_site:sites!loads_destination_site_id_fkey (code, name),
        load_packaging (
          quantity_dispatched, quantity_received, quantity_damaged, quantity_missing,
          packaging_types (name)
        )
      `)
      .eq('has_discrepancy', true)
      .order('confirmed_receipt_at', { ascending: false })
      .limit(parseInt(limit));

    if (startDate && endDate) {
      query = query.gte('dispatch_date', startDate).lte('dispatch_date', endDate);
    }

    if (siteId) {
      query = query.or(`origin_site_id.eq.${siteId},destination_site_id.eq.${siteId}`);
    }

    const { data: loads, error } = await query;
    if (error) throw error;

    const discrepancies = loads.map(l => ({
      id: l.id,
      load_number: l.load_number,
      dispatch_date: l.dispatch_date,
      origin_site: l.origin_site?.name,
      destination_site: l.destination_site?.name,
      discrepancy_notes: l.discrepancy_notes,
      confirmed_receipt_at: l.confirmed_receipt_at,
      items: l.load_packaging?.map(lp => ({
        packaging_type: lp.packaging_types?.name,
        dispatched: lp.quantity_dispatched,
        received: lp.quantity_received,
        damaged: lp.quantity_damaged,
        missing: lp.quantity_missing
      }))
    }));

    res.json({ discrepancies });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/packaging-summary
 * Get overall packaging summary across all sites
 */
router.get('/packaging-summary', authenticate, async (req, res, next) => {
  try {
    // Get all inventory
    const { data: inventory, error: invError } = await supabase
      .from('site_packaging_inventory')
      .select(`
        quantity, quantity_damaged,
        sites (id, code, name),
        packaging_types (id, code, name)
      `);

    if (invError) throw invError;

    // Get in-transit
    const { data: loadsInTransit, error: loadError } = await supabase
      .from('loads')
      .select(`
        load_packaging (
          quantity_dispatched,
          packaging_types (id, code, name)
        )
      `)
      .in('status', ['departed', 'in_transit']);

    if (loadError) throw loadError;

    // Aggregate by packaging type
    const summaryMap = new Map();

    inventory.forEach(inv => {
      const code = inv.packaging_types?.code;
      if (!code) return;
      
      if (!summaryMap.has(code)) {
        summaryMap.set(code, {
          packaging_type_code: code,
          packaging_type_name: inv.packaging_types?.name,
          total_on_hand: 0,
          total_damaged: 0,
          in_transit: 0,
          by_site: []
        });
      }
      
      const item = summaryMap.get(code);
      item.total_on_hand += inv.quantity || 0;
      item.total_damaged += inv.quantity_damaged || 0;
      item.by_site.push({
        site_code: inv.sites?.code,
        site_name: inv.sites?.name,
        quantity: inv.quantity || 0
      });
    });

    loadsInTransit.forEach(load => {
      load.load_packaging?.forEach(lp => {
        const code = lp.packaging_types?.code;
        if (!code || !summaryMap.has(code)) return;
        summaryMap.get(code).in_transit += lp.quantity_dispatched || 0;
      });
    });

    res.json({ summary: Array.from(summaryMap.values()) });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/export/:type
 * Export data as CSV
 */
router.get('/export/:type', authenticate, async (req, res, next) => {
  try {
    const { type } = req.params;
    const { startDate, endDate, siteId } = req.query;

    let data = [];
    let filename = '';

    if (type === 'loads') {
      let query = supabase
        .from('loads')
        .select(`
          load_number, dispatch_date, status,
          origin_site:sites!loads_origin_site_id_fkey (code, name),
          destination_site:sites!loads_destination_site_id_fkey (code, name),
          vehicles (registration),
          drivers (first_name, last_name),
          channels (name)
        `)
        .order('dispatch_date', { ascending: false });

      if (startDate) query = query.gte('dispatch_date', startDate);
      if (endDate) query = query.lte('dispatch_date', endDate);
      if (siteId) query = query.or(`origin_site_id.eq.${siteId},destination_site_id.eq.${siteId}`);

      const { data: loads, error } = await query;
      if (error) throw error;

      data = loads.map(l => ({
        load_number: l.load_number,
        dispatch_date: l.dispatch_date,
        status: l.status,
        origin: l.origin_site?.code,
        destination: l.destination_site?.code,
        vehicle: l.vehicles?.registration,
        driver: l.drivers ? `${l.drivers.first_name} ${l.drivers.last_name}` : '',
        channel: l.channels?.name
      }));
      filename = 'loads_export.csv';
    } else if (type === 'inventory') {
      const { data: inventory, error } = await supabase
        .from('site_packaging_inventory')
        .select(`
          quantity, quantity_damaged, last_count_at,
          sites (code, name),
          packaging_types (code, name)
        `);

      if (error) throw error;

      data = inventory.map(i => ({
        site_code: i.sites?.code,
        site_name: i.sites?.name,
        packaging_type: i.packaging_types?.code,
        quantity: i.quantity,
        damaged: i.quantity_damaged,
        last_count: i.last_count_at
      }));
      filename = 'inventory_export.csv';
    } else {
      return res.status(400).json({ error: { message: 'Invalid export type' } });
    }

    // Convert to CSV
    if (data.length === 0) {
      return res.status(404).json({ error: { message: 'No data to export' } });
    }

    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

export default router;
