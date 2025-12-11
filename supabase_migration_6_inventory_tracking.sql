-- =====================================================
-- MIGRATION 6: INVENTORY TRACKING ENHANCEMENTS
-- Adds handling count and backload return tracking
-- =====================================================

-- Add handling count to site_packaging_inventory
ALTER TABLE site_packaging_inventory
ADD COLUMN IF NOT EXISTS handling_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_dispatched INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_received INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_returned INTEGER DEFAULT 0;

-- Add backload_return movement type if not exists
-- (We'll use 'backload_return' for returns via backload)
ALTER TABLE packaging_movements 
DROP CONSTRAINT IF EXISTS packaging_movements_movement_type_check;

ALTER TABLE packaging_movements 
ADD CONSTRAINT packaging_movements_movement_type_check 
CHECK (movement_type IN (
    'dispatch', 'receipt', 'adjustment', 'damage', 'loss', 
    'repair', 'purchase', 'disposal', 'transfer', 'backload_return'
));

-- Add direction to movements for clarity
ALTER TABLE packaging_movements
ADD COLUMN IF NOT EXISTS direction VARCHAR(10) CHECK (direction IN ('in', 'out'));

-- Create function to update inventory on dispatch
CREATE OR REPLACE FUNCTION update_inventory_on_dispatch()
RETURNS TRIGGER AS $$
BEGIN
    -- Deduct from origin site
    INSERT INTO site_packaging_inventory (site_id, packaging_type_id, quantity, handling_count, total_dispatched)
    SELECT 
        l.origin_site_id,
        NEW.packaging_type_id,
        -NEW.quantity_dispatched,
        1,
        NEW.quantity_dispatched
    FROM loads l WHERE l.id = NEW.load_id
    ON CONFLICT (site_id, packaging_type_id) 
    DO UPDATE SET 
        quantity = site_packaging_inventory.quantity - NEW.quantity_dispatched,
        handling_count = site_packaging_inventory.handling_count + 1,
        total_dispatched = site_packaging_inventory.total_dispatched + NEW.quantity_dispatched,
        updated_at = NOW();
    
    -- Record movement
    INSERT INTO packaging_movements (movement_type, load_id, site_id, packaging_type_id, quantity, direction, recorded_at)
    SELECT 
        'dispatch',
        NEW.load_id,
        l.origin_site_id,
        NEW.packaging_type_id,
        NEW.quantity_dispatched,
        'out',
        NOW()
    FROM loads l WHERE l.id = NEW.load_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create function to update inventory on receipt (called when load is completed)
CREATE OR REPLACE FUNCTION update_inventory_on_receipt(
    p_load_id UUID,
    p_packaging_type_id UUID,
    p_quantity_received INTEGER,
    p_destination_site_id UUID,
    p_recorded_by UUID DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    -- Add to destination site
    INSERT INTO site_packaging_inventory (site_id, packaging_type_id, quantity, handling_count, total_received)
    VALUES (p_destination_site_id, p_packaging_type_id, p_quantity_received, 1, p_quantity_received)
    ON CONFLICT (site_id, packaging_type_id) 
    DO UPDATE SET 
        quantity = site_packaging_inventory.quantity + p_quantity_received,
        handling_count = site_packaging_inventory.handling_count + 1,
        total_received = site_packaging_inventory.total_received + p_quantity_received,
        updated_at = NOW();
    
    -- Record movement
    INSERT INTO packaging_movements (movement_type, load_id, site_id, packaging_type_id, quantity, direction, recorded_by, recorded_at)
    VALUES ('receipt', p_load_id, p_destination_site_id, p_packaging_type_id, p_quantity_received, 'in', p_recorded_by, NOW());
END;
$$ LANGUAGE plpgsql;

-- Create function to update inventory on backload return
CREATE OR REPLACE FUNCTION update_inventory_on_backload_return(
    p_load_id UUID,
    p_packaging_type_id UUID,
    p_quantity_returned INTEGER,
    p_backload_site_id UUID,
    p_recorded_by UUID DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    -- Credit back to the backload site (farm returning packaging)
    INSERT INTO site_packaging_inventory (site_id, packaging_type_id, quantity, handling_count, total_returned)
    VALUES (p_backload_site_id, p_packaging_type_id, p_quantity_returned, 1, p_quantity_returned)
    ON CONFLICT (site_id, packaging_type_id) 
    DO UPDATE SET 
        quantity = site_packaging_inventory.quantity + p_quantity_returned,
        handling_count = site_packaging_inventory.handling_count + 1,
        total_returned = site_packaging_inventory.total_returned + p_quantity_returned,
        updated_at = NOW();
    
    -- Record movement
    INSERT INTO packaging_movements (movement_type, load_id, site_id, packaging_type_id, quantity, direction, recorded_by, recorded_at)
    VALUES ('backload_return', p_load_id, p_backload_site_id, p_packaging_type_id, p_quantity_returned, 'in', p_recorded_by, NOW());
END;
$$ LANGUAGE plpgsql;

-- Create view for site inventory summary
CREATE OR REPLACE VIEW site_inventory_summary AS
SELECT 
    s.id as site_id,
    s.code as site_code,
    s.name as site_name,
    st.name as site_type,
    pt.id as packaging_type_id,
    pt.code as packaging_type_code,
    pt.name as packaging_type_name,
    COALESCE(spi.quantity, 0) as quantity_on_hand,
    COALESCE(spi.quantity_damaged, 0) as quantity_damaged,
    COALESCE(spi.handling_count, 0) as handling_count,
    COALESCE(spi.total_dispatched, 0) as total_dispatched,
    COALESCE(spi.total_received, 0) as total_received,
    COALESCE(spi.total_returned, 0) as total_returned,
    spi.updated_at as last_updated
FROM sites s
LEFT JOIN site_types st ON s.site_type_id = st.id
CROSS JOIN packaging_types pt
LEFT JOIN site_packaging_inventory spi ON s.id = spi.site_id AND pt.id = spi.packaging_type_id
WHERE s.is_active = true AND pt.is_active = true;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_packaging_movements_load ON packaging_movements(load_id);
CREATE INDEX IF NOT EXISTS idx_packaging_movements_site ON packaging_movements(site_id);
CREATE INDEX IF NOT EXISTS idx_packaging_movements_type ON packaging_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_packaging_movements_recorded_at ON packaging_movements(recorded_at);

-- Comments
COMMENT ON COLUMN site_packaging_inventory.handling_count IS 'Number of times this packaging type has been moved at this site';
COMMENT ON COLUMN site_packaging_inventory.total_dispatched IS 'Total quantity ever dispatched from this site';
COMMENT ON COLUMN site_packaging_inventory.total_received IS 'Total quantity ever received at this site';
COMMENT ON COLUMN site_packaging_inventory.total_returned IS 'Total quantity ever returned via backload to this site';
