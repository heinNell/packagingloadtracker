-- =====================================================
-- PACKAGING LOAD TRACKER - MIGRATION 1: SCHEMA
-- Run this in Supabase SQL Editor
-- =====================================================

-- Enable UUID extension (usually already enabled in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- DROP EXISTING OBJECTS (if re-running)
-- =====================================================
DROP VIEW IF EXISTS v_overdue_packaging CASCADE;
DROP VIEW IF EXISTS v_load_discrepancies CASCADE;
DROP VIEW IF EXISTS v_site_packaging_summary CASCADE;
DROP VIEW IF EXISTS v_packaging_in_transit CASCADE;

-- =====================================================
-- CORE ENTITIES
-- =====================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'dispatcher', 'farm_user', 'depot_user', 'readonly')),
    phone VARCHAR(50),
    assigned_site_id UUID,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Site types enum (farms, depots, cold stores, packhouses, markets)
CREATE TABLE IF NOT EXISTS site_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);

-- Sites (farms, depots, cold stores, packhouses, markets)
CREATE TABLE IF NOT EXISTS sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    site_type_id UUID NOT NULL REFERENCES site_types(id),
    address TEXT,
    city VARCHAR(100),
    region VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Zimbabwe',
    contact_name VARCHAR(255),
    contact_phone VARCHAR(50),
    contact_email VARCHAR(255),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key for user assigned site (may fail if already exists)
DO $$ BEGIN
    ALTER TABLE users ADD CONSTRAINT fk_users_site FOREIGN KEY (assigned_site_id) REFERENCES sites(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Packaging types (bins, crates, pallets, etc.)
CREATE TABLE IF NOT EXISTS packaging_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    capacity_kg DECIMAL(10, 2),
    capacity_liters DECIMAL(10, 2),
    weight_empty_kg DECIMAL(10, 2),
    dimensions_cm VARCHAR(100),
    expected_turnaround_days INTEGER DEFAULT 14,
    is_returnable BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Product types
CREATE TABLE IF NOT EXISTS product_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Product varieties
CREATE TABLE IF NOT EXISTS product_varieties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_type_id UUID NOT NULL REFERENCES product_types(id),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (product_type_id, code)
);

-- Product grades
CREATE TABLE IF NOT EXISTS product_grades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true
);

-- Vehicles
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registration VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100),
    vehicle_type VARCHAR(100),
    capacity_kg DECIMAL(10, 2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Drivers
CREATE TABLE IF NOT EXISTS drivers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id VARCHAR(50),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(50),
    license_number VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- LOAD TRACKING
-- =====================================================

-- Channels
CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true
);

-- Loads (main tracking entity)
CREATE TABLE IF NOT EXISTS loads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    load_number VARCHAR(50) UNIQUE NOT NULL,
    origin_site_id UUID NOT NULL REFERENCES sites(id),
    destination_site_id UUID NOT NULL REFERENCES sites(id),
    channel_id UUID REFERENCES channels(id),
    dispatch_date DATE NOT NULL,
    expected_arrival_date DATE,
    scheduled_departure_time TIME,
    actual_departure_time TIMESTAMP WITH TIME ZONE,
    estimated_arrival_time TIME,
    actual_arrival_time TIMESTAMP WITH TIME ZONE,
    vehicle_id UUID REFERENCES vehicles(id),
    driver_id UUID REFERENCES drivers(id),
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled' CHECK (status IN (
        'scheduled', 'loading', 'departed', 'in_transit', 
        'arrived_depot', 'unloading', 'completed', 'cancelled'
    )),
    on_time_status VARCHAR(50) CHECK (on_time_status IN ('on_time', 'delayed', 'early')),
    arrived_depot_time TIMESTAMP WITH TIME ZONE,
    departed_depot_time TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    has_discrepancy BOOLEAN DEFAULT false,
    discrepancy_notes TEXT,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    confirmed_dispatch_by UUID REFERENCES users(id),
    confirmed_dispatch_at TIMESTAMP WITH TIME ZONE,
    confirmed_receipt_by UUID REFERENCES users(id),
    confirmed_receipt_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Load packaging items
CREATE TABLE IF NOT EXISTS load_packaging (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    load_id UUID NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
    packaging_type_id UUID NOT NULL REFERENCES packaging_types(id),
    quantity_dispatched INTEGER NOT NULL DEFAULT 0,
    quantity_received INTEGER,
    quantity_damaged INTEGER DEFAULT 0,
    quantity_missing INTEGER DEFAULT 0,
    product_type_id UUID REFERENCES product_types(id),
    product_variety_id UUID REFERENCES product_varieties(id),
    product_grade_id UUID REFERENCES product_grades(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- INVENTORY & BALANCES
-- =====================================================

-- Current packaging inventory at each site
CREATE TABLE IF NOT EXISTS site_packaging_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id),
    packaging_type_id UUID NOT NULL REFERENCES packaging_types(id),
    quantity INTEGER NOT NULL DEFAULT 0,
    quantity_damaged INTEGER DEFAULT 0,
    last_counted_at TIMESTAMP WITH TIME ZONE,
    last_counted_by UUID REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (site_id, packaging_type_id)
);

-- Packaging movement history
CREATE TABLE IF NOT EXISTS packaging_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN (
        'dispatch', 'receipt', 'adjustment', 'damage', 'loss', 
        'repair', 'purchase', 'disposal', 'transfer'
    )),
    load_id UUID REFERENCES loads(id),
    site_id UUID NOT NULL REFERENCES sites(id),
    packaging_type_id UUID NOT NULL REFERENCES packaging_types(id),
    quantity INTEGER NOT NULL,
    quantity_damaged INTEGER DEFAULT 0,
    reference_number VARCHAR(100),
    notes TEXT,
    recorded_by UUID REFERENCES users(id),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- ALERTS & THRESHOLDS
-- =====================================================

-- Site packaging thresholds
CREATE TABLE IF NOT EXISTS site_packaging_thresholds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id),
    packaging_type_id UUID NOT NULL REFERENCES packaging_types(id),
    min_threshold INTEGER NOT NULL DEFAULT 0,
    max_threshold INTEGER,
    alert_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (site_id, packaging_type_id)
);

-- Active alerts
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_type VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    site_id UUID REFERENCES sites(id),
    load_id UUID REFERENCES loads(id),
    packaging_type_id UUID REFERENCES packaging_types(id),
    message TEXT NOT NULL,
    is_acknowledged BOOLEAN DEFAULT false,
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_loads_dispatch_date ON loads(dispatch_date);
CREATE INDEX IF NOT EXISTS idx_loads_status ON loads(status);
CREATE INDEX IF NOT EXISTS idx_loads_origin ON loads(origin_site_id);
CREATE INDEX IF NOT EXISTS idx_loads_destination ON loads(destination_site_id);
CREATE INDEX IF NOT EXISTS idx_loads_load_number ON loads(load_number);
CREATE INDEX IF NOT EXISTS idx_load_packaging_load ON load_packaging(load_id);
CREATE INDEX IF NOT EXISTS idx_packaging_movements_site ON packaging_movements(site_id);
CREATE INDEX IF NOT EXISTS idx_packaging_movements_date ON packaging_movements(recorded_at);
CREATE INDEX IF NOT EXISTS idx_site_inventory ON site_packaging_inventory(site_id, packaging_type_id);

-- =====================================================
-- VIEWS
-- =====================================================

-- View: Current packaging in transit
CREATE OR REPLACE VIEW v_packaging_in_transit AS
SELECT 
    lp.packaging_type_id,
    pt.name as packaging_type_name,
    SUM(lp.quantity_dispatched) as total_in_transit,
    COUNT(DISTINCT l.id) as load_count
FROM loads l
JOIN load_packaging lp ON l.id = lp.load_id
JOIN packaging_types pt ON lp.packaging_type_id = pt.id
WHERE l.status IN ('departed', 'in_transit', 'arrived_depot')
GROUP BY lp.packaging_type_id, pt.name;

-- View: Site packaging summary
CREATE OR REPLACE VIEW v_site_packaging_summary AS
SELECT 
    s.id as site_id,
    s.code as site_code,
    s.name as site_name,
    st.name as site_type,
    pt.id as packaging_type_id,
    pt.code as packaging_code,
    pt.name as packaging_name,
    COALESCE(spi.quantity, 0) as quantity_on_hand,
    COALESCE(spi.quantity_damaged, 0) as quantity_damaged,
    COALESCE(spt.min_threshold, 0) as min_threshold,
    CASE 
        WHEN spt.min_threshold IS NOT NULL AND COALESCE(spi.quantity, 0) <= spt.min_threshold THEN 'critical'
        WHEN spt.min_threshold IS NOT NULL AND COALESCE(spi.quantity, 0) <= spt.min_threshold * 1.2 THEN 'warning'
        ELSE 'normal'
    END as stock_status
FROM sites s
CROSS JOIN packaging_types pt
JOIN site_types st ON s.site_type_id = st.id
LEFT JOIN site_packaging_inventory spi ON s.id = spi.site_id AND pt.id = spi.packaging_type_id
LEFT JOIN site_packaging_thresholds spt ON s.id = spt.site_id AND pt.id = spt.packaging_type_id
WHERE s.is_active = true AND pt.is_active = true;

-- View: Load discrepancies
CREATE OR REPLACE VIEW v_load_discrepancies AS
SELECT 
    l.id as load_id,
    l.load_number,
    l.dispatch_date,
    l.expected_arrival_date,
    os.name as origin_site,
    ds.name as destination_site,
    pt.name as packaging_type,
    lp.quantity_dispatched,
    lp.quantity_received,
    lp.quantity_damaged,
    lp.quantity_missing,
    (lp.quantity_dispatched - COALESCE(lp.quantity_received, 0)) as discrepancy_count
FROM loads l
JOIN load_packaging lp ON l.id = lp.load_id
JOIN packaging_types pt ON lp.packaging_type_id = pt.id
JOIN sites os ON l.origin_site_id = os.id
JOIN sites ds ON l.destination_site_id = ds.id
WHERE l.status = 'completed'
  AND (lp.quantity_dispatched != COALESCE(lp.quantity_received, 0)
       OR lp.quantity_damaged > 0
       OR lp.quantity_missing > 0);

-- View: Overdue packaging returns
CREATE OR REPLACE VIEW v_overdue_packaging AS
SELECT 
    l.id as load_id,
    l.load_number,
    l.dispatch_date,
    ds.id as current_site_id,
    ds.name as current_site_name,
    pt.id as packaging_type_id,
    pt.name as packaging_type_name,
    pt.expected_turnaround_days,
    lp.quantity_dispatched,
    CURRENT_DATE - l.dispatch_date as days_outstanding
FROM loads l
JOIN load_packaging lp ON l.id = lp.load_id
JOIN packaging_types pt ON lp.packaging_type_id = pt.id
JOIN sites ds ON l.destination_site_id = ds.id
WHERE l.status = 'completed'
  AND pt.is_returnable = true
  AND (CURRENT_DATE - l.dispatch_date) > pt.expected_turnaround_days;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
SELECT 'Schema migration completed successfully!' as status;
