-- Migration: Add farm arrival/departure time tracking for overtime calculation
-- Expected times for BV and CBC farms: Arrival 14:00, Departure 17:00

-- Add columns for expected and actual farm times
ALTER TABLE loads 
ADD COLUMN IF NOT EXISTS expected_farm_arrival_time TIME DEFAULT '14:00',
ADD COLUMN IF NOT EXISTS expected_farm_departure_time TIME DEFAULT '17:00',
ADD COLUMN IF NOT EXISTS actual_farm_arrival_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS actual_farm_departure_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS confirmed_farm_arrival_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS confirmed_farm_arrival_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS confirmed_farm_departure_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS confirmed_farm_departure_at TIMESTAMP WITH TIME ZONE;

-- Add overtime tracking columns
ALTER TABLE loads
ADD COLUMN IF NOT EXISTS farm_arrival_overtime_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS farm_departure_overtime_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS has_overtime BOOLEAN DEFAULT false;

-- Create index for overtime reporting
CREATE INDEX IF NOT EXISTS idx_loads_has_overtime ON loads(has_overtime) WHERE has_overtime = true;

-- Add comments for documentation
COMMENT ON COLUMN loads.expected_farm_arrival_time IS 'Default expected arrival time at farm (14:00 for BV and CBC)';
COMMENT ON COLUMN loads.expected_farm_departure_time IS 'Default expected departure time from farm (17:00 for BV and CBC)';
COMMENT ON COLUMN loads.actual_farm_arrival_time IS 'Actual time truck arrived at farm';
COMMENT ON COLUMN loads.actual_farm_departure_time IS 'Actual time truck departed from farm (loaded)';
COMMENT ON COLUMN loads.farm_arrival_overtime_minutes IS 'Minutes exceeded for arrival (negative if early)';
COMMENT ON COLUMN loads.farm_departure_overtime_minutes IS 'Minutes exceeded for departure (negative if early)';
COMMENT ON COLUMN loads.has_overtime IS 'Flag for loads that exceeded expected times';
