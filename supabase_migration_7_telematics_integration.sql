-- =====================================================
-- MIGRATION 7: TELEMATICS INTEGRATION
-- Links vehicles to Telematics Guru asset IDs for live tracking
-- =====================================================

-- Add telematics_asset_id to vehicles table
ALTER TABLE vehicles
ADD COLUMN
IF NOT EXISTS telematics_asset_id INTEGER,
ADD COLUMN
IF NOT EXISTS telematics_asset_code VARCHAR
(50);

-- Create index for quick lookups
CREATE INDEX
IF NOT EXISTS idx_vehicles_telematics_asset_id ON vehicles
(telematics_asset_id);

-- Create view for active loads with vehicle and telematics info
CREATE OR REPLACE VIEW active_loads_tracking AS
SELECT
    l.id as load_id,
    l.load_number,
    l.dispatch_date,
    l.status,
    l.expected_farm_arrival_time,
    l.actual_farm_arrival_time,
    l.expected_depot_arrival_time,
    l.actual_depot_arrival_time,
    os.id as origin_site_id,
    os.name as origin_site_name,
    os.code as origin_site_code,
    ds.id as destination_site_id,
    ds.name as destination_site_name,
    ds.code as destination_site_code,
    v.id as vehicle_id,
    v.registration as vehicle_registration,
    v.name as vehicle_name,
    v.telematics_asset_id,
    v.telematics_asset_code,
    d.id as driver_id,
    d.first_name || ' ' || d.last_name as driver_name,
    d.phone as driver_phone
FROM loads l
    LEFT JOIN sites os ON l.origin_site_id = os.id
    LEFT JOIN sites ds ON l.destination_site_id = ds.id
    LEFT JOIN vehicles v ON l.vehicle_id = v.id
    LEFT JOIN drivers d ON l.driver_id = d.id
WHERE l.status IN ('scheduled', 'loading', 'departed', 'in_transit', 'arrived_depot')
    AND l.dispatch_date >= CURRENT_DATE - INTERVAL
'1 day'
  AND l.dispatch_date <= CURRENT_DATE + INTERVAL '1 day';

-- Comments
COMMENT ON COLUMN vehicles.telematics_asset_id IS 'Asset ID from Telematics Guru for live tracking';
COMMENT ON COLUMN vehicles.telematics_asset_code IS 'Asset code/name from Telematics Guru';
COMMENT ON VIEW active_loads_tracking IS 'View of active loads with vehicle telematics info for live tracking overlay';
