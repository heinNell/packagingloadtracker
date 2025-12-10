-- =====================================================
-- PACKAGING LOAD TRACKER - MIGRATION 2: SEED DATA
-- Run this in Supabase SQL Editor AFTER schema migration
-- =====================================================

-- =====================================================
-- SITE TYPES
-- =====================================================
INSERT INTO site_types (id, name, description) VALUES
(uuid_generate_v4(), 'Farm', 'Agricultural production facility'),
(uuid_generate_v4(), 'Depot', 'Distribution and storage facility'),
(uuid_generate_v4(), 'Packhouse', 'Packaging and processing facility'),
(uuid_generate_v4(), 'Cold Store', 'Cold storage facility'),
(uuid_generate_v4(), 'Market', 'Sales and distribution market'),
(uuid_generate_v4(), 'Vendor', 'Third-party vendor location')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- SITES (Farms, Depots, etc.)
-- =====================================================
INSERT INTO sites (code, name, site_type_id, city, region) 
SELECT 'BV', 'Beitbridge Valley Farm', id, 'Beitbridge', 'Matabeleland South' 
FROM site_types WHERE name = 'Farm'
ON CONFLICT (code) DO NOTHING;

INSERT INTO sites (code, name, site_type_id, city, region) 
SELECT 'CBC', 'CBC Farm', id, 'Chipinge', 'Manicaland' 
FROM site_types WHERE name = 'Farm'
ON CONFLICT (code) DO NOTHING;

INSERT INTO sites (code, name, site_type_id, city, region) 
SELECT 'HRE-DEPOT', 'Harare Depot', id, 'Harare', 'Harare' 
FROM site_types WHERE name = 'Depot'
ON CONFLICT (code) DO NOTHING;

INSERT INTO sites (code, name, site_type_id, city, region) 
SELECT 'BYO-DEPOT', 'Bulawayo Depot', id, 'Bulawayo', 'Bulawayo' 
FROM site_types WHERE name = 'Depot'
ON CONFLICT (code) DO NOTHING;

INSERT INTO sites (code, name, site_type_id, city, region) 
SELECT 'MTR-DEPOT', 'Mutare Depot', id, 'Mutare', 'Manicaland' 
FROM site_types WHERE name = 'Depot'
ON CONFLICT (code) DO NOTHING;

INSERT INTO sites (code, name, site_type_id, city, region) 
SELECT 'DAPPER', 'Dapper Cold Store', id, 'Harare', 'Harare' 
FROM site_types WHERE name = 'Cold Store'
ON CONFLICT (code) DO NOTHING;

INSERT INTO sites (code, name, site_type_id, city, region) 
SELECT 'FRESHMARK', 'Freshmark Centurion', id, 'Centurion', 'Gauteng' 
FROM site_types WHERE name = 'Market'
ON CONFLICT (code) DO NOTHING;

INSERT INTO sites (code, name, site_type_id, city, region) 
SELECT 'REZENDE', 'Rezende Depot', id, 'Rezende', 'Manicaland' 
FROM site_types WHERE name = 'Depot'
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- PACKAGING TYPES
-- =====================================================
INSERT INTO packaging_types (code, name, description, capacity_kg, expected_turnaround_days, is_returnable) VALUES
('BIN-500', '500kg Bin', 'Large plastic bin for bulk produce', 500, 14, true),
('BIN-250', '250kg Bin', 'Medium plastic bin for produce', 250, 14, true),
('CRATE-20', '20kg Crate', 'Standard plastic crate', 20, 7, true),
('CRATE-10', '10kg Crate', 'Small plastic crate', 10, 7, true),
('PALLET-STD', 'Standard Pallet', 'Standard wooden pallet', null, 30, true),
('PALLET-EURO', 'Euro Pallet', 'Euro specification pallet', null, 30, true),
('CARTON-10', '10kg Carton', 'Cardboard carton', 10, null, false),
('CARTON-5', '5kg Carton', 'Small cardboard carton', 5, null, false)
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- PRODUCT TYPES
-- =====================================================
INSERT INTO product_types (code, name, category) VALUES
('CITRUS', 'Citrus', 'Citrus'),
('MANGO', 'Mango', 'Tropical'),
('AVOCADO', 'Avocado', 'Tropical'),
('BANANA', 'Banana', 'Tropical'),
('TOMATO', 'Tomato', 'Vegetables'),
('ONION', 'Onion', 'Vegetables'),
('POTATO', 'Potato', 'Vegetables'),
('BLEND', 'Mixed Blend', 'Mixed')
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- PRODUCT GRADES
-- =====================================================
INSERT INTO product_grades (code, name, sort_order) VALUES
('A', 'Grade A - Premium', 1),
('B', 'Grade B - Standard', 2),
('C', 'Grade C - Economy', 3),
('PROCESS', 'Processing Grade', 4)
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- CHANNELS
-- =====================================================
INSERT INTO channels (code, name) VALUES
('RETAIL', 'Retail'),
('VENDOR', 'Vendor'),
('VANSALES', 'Van Sales'),
('DIRECT', 'Direct'),
('MUNICIPAL', 'Municipal'),
('EXPORT', 'Export')
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- VEHICLES
-- =====================================================
INSERT INTO vehicles (registration, name, vehicle_type) VALUES
('23H', 'Truck 23H', 'Truck'),
('26H', 'Truck 26H', 'Truck'),
('22H', 'Truck 22H', 'Truck'),
('31H', 'Truck 31H', 'Truck'),
('6H', 'Truck 6H', 'Truck'),
('28H', 'Truck 28H', 'Truck'),
('24H', 'Truck 24H', 'Truck'),
('UD95', 'Truck UD95', 'Truck'),
('32H', 'Truck 32H', 'Truck'),
('4H', 'Truck 4H', 'Truck')
ON CONFLICT (registration) DO NOTHING;

-- =====================================================
-- DRIVERS
-- =====================================================
INSERT INTO drivers (first_name, last_name, phone) VALUES
('Phillimon', 'Kwarire', null),
('Qochiwe', '', null),
('Peter', 'Farai', null),
('Enock', '', null),
('Decide', '', null),
('Taurayi', '', null),
('Mlambo', '', null),
('Wellington', '', null),
('Bepete', 'J', null),
('Muchibo', '', null),
('Jackson', 'TBA', null)
ON CONFLICT DO NOTHING;

-- =====================================================
-- ADMIN USER (password: 0824656647@Hj)
-- bcrypt hash generated for this password
-- =====================================================
INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active) VALUES
('8542476d-f35f-4832-b6c7-65bedebfdfe4', 'heinrich@matanuska.co.za', 
 '$2a$10$stws.ta0HOiK1aYw7Wu81OPxM8pIPuJJgRh/dSHYEabB.yXiNn67q',
 'Heinrich', 'Nell', 'admin', true)
ON CONFLICT (email) DO UPDATE SET 
  password_hash = EXCLUDED.password_hash,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active;

-- =====================================================
-- INITIAL INVENTORY (sample data)
-- =====================================================
INSERT INTO site_packaging_inventory (site_id, packaging_type_id, quantity)
SELECT s.id, pt.id, 
  CASE 
    WHEN pt.code = 'BIN-500' THEN 150
    WHEN pt.code = 'BIN-250' THEN 200
    WHEN pt.code = 'CRATE-20' THEN 500
    WHEN pt.code = 'CRATE-10' THEN 300
    WHEN pt.code = 'PALLET-STD' THEN 100
    ELSE 50
  END as quantity
FROM sites s
CROSS JOIN packaging_types pt
WHERE pt.is_returnable = true
  AND s.code IN ('BV', 'CBC', 'HRE-DEPOT', 'BYO-DEPOT')
ON CONFLICT (site_id, packaging_type_id) DO NOTHING;

-- =====================================================
-- SAMPLE LOADS
-- =====================================================
INSERT INTO loads (
  load_number, origin_site_id, destination_site_id, channel_id,
  dispatch_date, status, vehicle_id, driver_id
)
SELECT 
  'BV' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || '01',
  (SELECT id FROM sites WHERE code = 'BV'),
  (SELECT id FROM sites WHERE code = 'HRE-DEPOT'),
  (SELECT id FROM channels WHERE code = 'RETAIL'),
  CURRENT_DATE,
  'scheduled',
  (SELECT id FROM vehicles WHERE registration = '23H'),
  (SELECT id FROM drivers WHERE first_name = 'Phillimon')
WHERE NOT EXISTS (
  SELECT 1 FROM loads WHERE load_number = 'BV' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || '01'
);

INSERT INTO loads (
  load_number, origin_site_id, destination_site_id, channel_id,
  dispatch_date, status, vehicle_id, driver_id
)
SELECT 
  'CBC' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || '01',
  (SELECT id FROM sites WHERE code = 'CBC'),
  (SELECT id FROM sites WHERE code = 'MTR-DEPOT'),
  (SELECT id FROM channels WHERE code = 'VENDOR'),
  CURRENT_DATE,
  'in_transit',
  (SELECT id FROM vehicles WHERE registration = '26H'),
  (SELECT id FROM drivers WHERE first_name = 'Peter')
WHERE NOT EXISTS (
  SELECT 1 FROM loads WHERE load_number = 'CBC' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || '01'
);

-- Add packaging to loads
INSERT INTO load_packaging (load_id, packaging_type_id, quantity_dispatched)
SELECT l.id, pt.id, 
  CASE 
    WHEN pt.code = 'BIN-500' THEN 20
    WHEN pt.code = 'CRATE-20' THEN 50
    ELSE 10
  END
FROM loads l
CROSS JOIN packaging_types pt
WHERE l.load_number LIKE '%' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || '%'
  AND pt.code IN ('BIN-500', 'CRATE-20')
ON CONFLICT DO NOTHING;

-- =====================================================
-- SEED COMPLETE
-- =====================================================
SELECT 'Seed data loaded successfully!' as status;

-- Verify data
SELECT 'Site Types:' as table_name, COUNT(*) as count FROM site_types
UNION ALL
SELECT 'Sites', COUNT(*) FROM sites
UNION ALL
SELECT 'Packaging Types', COUNT(*) FROM packaging_types
UNION ALL
SELECT 'Vehicles', COUNT(*) FROM vehicles
UNION ALL
SELECT 'Drivers', COUNT(*) FROM drivers
UNION ALL
SELECT 'Users', COUNT(*) FROM users
UNION ALL
SELECT 'Channels', COUNT(*) FROM channels
UNION ALL
SELECT 'Loads', COUNT(*) FROM loads
UNION ALL
SELECT 'Inventory Records', COUNT(*) FROM site_packaging_inventory;
