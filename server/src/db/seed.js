import bcrypt from 'bcryptjs';
import pool, { transaction } from './index.js';

async function seed() {
  console.log('Starting database seeding...');

  try {
    await transaction(async (client) => {
      // Insert site types
      console.log('Seeding site types...');
      const siteTypes = await client.query(`
        INSERT INTO site_types (id, name, description) VALUES
        (uuid_generate_v4(), 'Farm', 'Agricultural production facility'),
        (uuid_generate_v4(), 'Depot', 'Distribution and storage facility'),
        (uuid_generate_v4(), 'Packhouse', 'Packaging and processing facility'),
        (uuid_generate_v4(), 'Cold Store', 'Cold storage facility'),
        (uuid_generate_v4(), 'Market', 'Sales and distribution market'),
        (uuid_generate_v4(), 'Vendor', 'Third-party vendor location')
        ON CONFLICT (name) DO NOTHING
        RETURNING id, name;
      `);
      
      const siteTypeMap = {};
      siteTypes.rows.forEach(row => { siteTypeMap[row.name] = row.id; });
      
      // If we didn't insert (already existed), fetch them
      if (Object.keys(siteTypeMap).length === 0) {
        const existing = await client.query('SELECT id, name FROM site_types');
        existing.rows.forEach(row => { siteTypeMap[row.name] = row.id; });
      }

      // Insert sites (farms and depots from the loadtable)
      console.log('Seeding sites...');
      await client.query(`
        INSERT INTO sites (code, name, site_type_id, city, region) VALUES
        ('BV', 'Beitbridge Valley Farm', $1, 'Beitbridge', 'Matabeleland South'),
        ('CBC', 'CBC Farm', $1, 'Chipinge', 'Manicaland'),
        ('HRE-DEPOT', 'Harare Depot', $2, 'Harare', 'Harare'),
        ('BYO-DEPOT', 'Bulawayo Depot', $2, 'Bulawayo', 'Bulawayo'),
        ('MTR-DEPOT', 'Mutare Depot', $2, 'Mutare', 'Manicaland'),
        ('DAPPER', 'Dapper Cold Store', $3, 'Harare', 'Harare'),
        ('FRESHMARK', 'Freshmark Centurion', $4, 'Centurion', 'Gauteng'),
        ('REZENDE', 'Rezende Depot', $2, 'Rezende', 'Manicaland')
        ON CONFLICT (code) DO NOTHING;
      `, [siteTypeMap['Farm'], siteTypeMap['Depot'], siteTypeMap['Cold Store'], siteTypeMap['Market']]);

      // Insert packaging types
      console.log('Seeding packaging types...');
      await client.query(`
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
      `);

      // Insert product types
      console.log('Seeding product types...');
      await client.query(`
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
      `);

      // Insert product grades
      console.log('Seeding product grades...');
      await client.query(`
        INSERT INTO product_grades (code, name, sort_order) VALUES
        ('A', 'Grade A - Premium', 1),
        ('B', 'Grade B - Standard', 2),
        ('C', 'Grade C - Economy', 3),
        ('PROCESS', 'Processing Grade', 4)
        ON CONFLICT (code) DO NOTHING;
      `);

      // Insert channels
      console.log('Seeding channels...');
      await client.query(`
        INSERT INTO channels (code, name) VALUES
        ('RETAIL', 'Retail'),
        ('VENDOR', 'Vendor'),
        ('VANSALES', 'Van Sales'),
        ('DIRECT', 'Direct'),
        ('MUNICIPAL', 'Municipal'),
        ('EXPORT', 'Export')
        ON CONFLICT (code) DO NOTHING;
      `);

      // Insert vehicles
      console.log('Seeding vehicles...');
      await client.query(`
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
      `);

      // Insert drivers
      console.log('Seeding drivers...');
      await client.query(`
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
      `);

      // Create admin user
      console.log('Seeding admin user...');
      const passwordHash = await bcrypt.hash('admin123', 10);
      await client.query(`
        INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES
        ('admin@packagingtracker.com', $1, 'System', 'Administrator', 'admin')
        ON CONFLICT (email) DO NOTHING;
      `, [passwordHash]);

      // Add some initial inventory
      console.log('Seeding initial inventory...');
      const sites = await client.query('SELECT id FROM sites LIMIT 4');
      const packagingTypes = await client.query('SELECT id FROM packaging_types WHERE is_returnable = true LIMIT 4');
      
      for (const site of sites.rows) {
        for (const pt of packagingTypes.rows) {
          await client.query(`
            INSERT INTO site_packaging_inventory (site_id, packaging_type_id, quantity)
            VALUES ($1, $2, $3)
            ON CONFLICT (site_id, packaging_type_id) DO NOTHING;
          `, [site.id, pt.id, Math.floor(Math.random() * 200) + 50]);
        }
      }

      console.log('Database seeding completed successfully!');
    });
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
