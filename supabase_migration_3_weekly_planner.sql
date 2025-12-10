-- =====================================================
-- PACKAGING LOAD TRACKER - MIGRATION 3: WEEKLY PLANNER
-- Run this in Supabase SQL Editor AFTER previous migrations
-- =====================================================

-- =====================================================
-- WEEKLY PLANNER / DISPATCH SCHEDULE TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS dispatch_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Core dispatch info
    dispatch_date DATE NOT NULL,
    dispatch_time TIME,
    expected_arrival_date DATE NOT NULL,
    expected_arrival_time TIME,
    
    -- Origin and Destination
    origin_site_id UUID NOT NULL REFERENCES sites(id),
    destination_site_id UUID NOT NULL REFERENCES sites(id),
    
    -- Channel
    channel_id UUID REFERENCES channels(id),
    
    -- Packaging requirements
    crates_count INTEGER DEFAULT 0,
    bins_count INTEGER DEFAULT 0,
    boxes_count INTEGER DEFAULT 0,
    pallets_count INTEGER DEFAULT 0,
    
    -- Key planning dates
    packaging_eta_farm DATE,           -- When packaging should arrive at farm
    packaging_supplied_date DATE,       -- When packaging was actually supplied
    ripening_start_date DATE,           -- When ripening begins
    sales_despatch_date DATE,           -- Despatch day for sales
    packaging_collection_date DATE,     -- Collection from depots
    packaging_delivery_farm_date DATE,  -- Delivery back to farms
    
    -- Transport allocation
    vehicle_id UUID REFERENCES vehicles(id),
    driver_id UUID REFERENCES drivers(id),
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'planned' CHECK (status IN (
        'planned', 'confirmed', 'packaging_sent', 'loading', 
        'in_transit', 'delivered', 'completed', 'cancelled'
    )),
    
    -- Link to actual load when created
    load_id UUID REFERENCES loads(id),
    
    -- Recurring schedule support
    is_recurring BOOLEAN DEFAULT false,
    recurrence_pattern VARCHAR(50), -- 'weekly', 'biweekly', 'monthly'
    recurrence_day_of_week INTEGER, -- 0=Sunday, 1=Monday, etc.
    parent_schedule_id UUID REFERENCES dispatch_schedules(id),
    
    -- Notes and metadata
    notes TEXT,
    customer_name VARCHAR(255),      -- For direct/municipal deliveries
    product_type VARCHAR(100),       -- e.g., 'Mango', 'Citrus'
    
    -- Audit fields
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_dispatch_schedules_dispatch_date ON dispatch_schedules(dispatch_date);
CREATE INDEX IF NOT EXISTS idx_dispatch_schedules_origin ON dispatch_schedules(origin_site_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_schedules_destination ON dispatch_schedules(destination_site_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_schedules_status ON dispatch_schedules(status);
CREATE INDEX IF NOT EXISTS idx_dispatch_schedules_week ON dispatch_schedules(DATE_TRUNC('week', dispatch_date));

-- =====================================================
-- VIEW: Weekly Planner Summary
-- =====================================================

CREATE OR REPLACE VIEW v_weekly_planner AS
SELECT 
    ds.id,
    ds.dispatch_date,
    ds.dispatch_time,
    ds.expected_arrival_date,
    ds.expected_arrival_time,
    EXTRACT(DOW FROM ds.dispatch_date) as day_of_week,
    TO_CHAR(ds.dispatch_date, 'Day') as day_name,
    
    -- Origin and Destination
    os.code as origin_code,
    os.name as origin_name,
    ds_site.code as destination_code,
    ds_site.name as destination_name,
    
    -- Channel
    ch.code as channel_code,
    ch.name as channel_name,
    
    -- Packaging counts
    ds.crates_count,
    ds.bins_count,
    ds.boxes_count,
    ds.pallets_count,
    
    -- Key dates
    ds.packaging_eta_farm,
    ds.packaging_supplied_date,
    ds.ripening_start_date,
    ds.sales_despatch_date,
    ds.packaging_collection_date,
    ds.packaging_delivery_farm_date,
    
    -- Transport
    v.registration as vehicle_registration,
    v.name as vehicle_name,
    d.first_name || ' ' || d.last_name as driver_name,
    
    -- Status and metadata
    ds.status,
    ds.customer_name,
    ds.product_type,
    ds.notes,
    ds.load_id,
    ds.is_recurring,
    ds.recurrence_pattern
    
FROM dispatch_schedules ds
JOIN sites os ON ds.origin_site_id = os.id
JOIN sites ds_site ON ds.destination_site_id = ds_site.id
LEFT JOIN channels ch ON ds.channel_id = ch.id
LEFT JOIN vehicles v ON ds.vehicle_id = v.id
LEFT JOIN drivers d ON ds.driver_id = d.id
ORDER BY ds.dispatch_date, ds.dispatch_time;

-- =====================================================
-- VIEW: Packaging Demand by Week
-- =====================================================

CREATE OR REPLACE VIEW v_packaging_demand_weekly AS
SELECT 
    DATE_TRUNC('week', dispatch_date)::DATE as week_start,
    origin_site_id,
    os.code as origin_code,
    os.name as origin_name,
    SUM(crates_count) as total_crates_needed,
    SUM(bins_count) as total_bins_needed,
    SUM(boxes_count) as total_boxes_needed,
    SUM(pallets_count) as total_pallets_needed,
    COUNT(*) as dispatch_count
FROM dispatch_schedules ds
JOIN sites os ON ds.origin_site_id = os.id
WHERE ds.status NOT IN ('cancelled', 'completed')
GROUP BY DATE_TRUNC('week', dispatch_date), origin_site_id, os.code, os.name
ORDER BY week_start, os.code;

-- =====================================================
-- SEED: Sample Weekly Schedule Data
-- =====================================================

-- Insert sample schedule for current week
INSERT INTO dispatch_schedules (
    dispatch_date, dispatch_time, expected_arrival_date,
    origin_site_id, destination_site_id, channel_id,
    crates_count, bins_count,
    packaging_eta_farm, ripening_start_date, sales_despatch_date,
    packaging_collection_date, packaging_delivery_farm_date,
    status, product_type
)
SELECT 
    CURRENT_DATE + (n.n % 7),
    CASE WHEN n.n % 2 = 0 THEN '06:00'::TIME ELSE '18:00'::TIME END,
    CURRENT_DATE + (n.n % 7) + 1,
    (SELECT id FROM sites WHERE code = CASE WHEN n.n % 2 = 0 THEN 'BV' ELSE 'CBC' END),
    (SELECT id FROM sites WHERE code = CASE 
        WHEN n.n % 3 = 0 THEN 'HRE-DEPOT' 
        WHEN n.n % 3 = 1 THEN 'BYO-DEPOT'
        ELSE 'MTR-DEPOT' END),
    (SELECT id FROM channels WHERE code = CASE 
        WHEN n.n % 4 = 0 THEN 'RETAIL'
        WHEN n.n % 4 = 1 THEN 'VENDOR'
        WHEN n.n % 4 = 2 THEN 'VANSALES'
        ELSE 'DIRECT' END),
    CASE WHEN n.n % 2 = 0 THEN 1350 ELSE 0 END,
    CASE WHEN n.n % 2 = 1 THEN 78 ELSE 0 END,
    CURRENT_DATE + (n.n % 7) - 2,
    CURRENT_DATE + (n.n % 7) + 1,
    CURRENT_DATE + (n.n % 7) + 5,
    CURRENT_DATE + (n.n % 7) + 8,
    CURRENT_DATE + (n.n % 7) + 9,
    'planned',
    'Mango'
FROM generate_series(0, 6) AS n(n)
WHERE NOT EXISTS (
    SELECT 1 FROM dispatch_schedules 
    WHERE dispatch_date = CURRENT_DATE + (n.n % 7)
);

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

SELECT 'Weekly Planner schema created successfully!' as status;

-- Verify data
SELECT COUNT(*) as schedule_count FROM dispatch_schedules;
