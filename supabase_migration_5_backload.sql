-- =====================================================
-- MIGRATION 5: BACKLOAD FUNCTIONALITY
-- Adds backload tracking for return trips from farms
-- =====================================================

-- Add backload fields to loads table
ALTER TABLE loads 
ADD COLUMN
IF NOT EXISTS backload_site_id UUID REFERENCES sites
(id),
ADD COLUMN
IF NOT EXISTS backload_notes TEXT,
ADD COLUMN
IF NOT EXISTS linked_load_id UUID REFERENCES loads
(id),
ADD COLUMN
IF NOT EXISTS is_backload BOOLEAN DEFAULT false;

-- Create backload packaging table (packaging being returned)
CREATE TABLE
IF NOT EXISTS backload_packaging
(
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4
    (),
        load_id UUID NOT NULL REFERENCES loads
        (id) ON
        DELETE CASCADE,
            packaging_type_id UUID
            NOT NULL REFERENCES packaging_types
            (id),
                quantity_returned INTEGER NOT NULL DEFAULT 0,
                    quantity_damaged INTEGER DEFAULT 0,
                        notes TEXT,
                            created_at TIMESTAMP
                            WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                                updated_at TIMESTAMP
                                WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                                );

                                -- Create index for efficient backload queries
                                CREATE INDEX
                                IF NOT EXISTS idx_loads_backload_site ON loads
                                (backload_site_id);
                                CREATE INDEX
                                IF NOT EXISTS idx_loads_linked_load ON loads
                                (linked_load_id);
                                CREATE INDEX
                                IF NOT EXISTS idx_backload_packaging_load ON backload_packaging
                                (load_id);

                                -- Add comment for documentation
                                COMMENT ON COLUMN loads.backload_site_id IS 'The farm site where packaging is being returned from';
                                COMMENT ON COLUMN loads.linked_load_id IS 'Links to the next load that will pick up this backload';
                                COMMENT ON COLUMN loads.is_backload IS 'Indicates if this load is primarily a backload/return trip';
                                COMMENT ON TABLE backload_packaging IS 'Packaging items being returned on the backload';
                                