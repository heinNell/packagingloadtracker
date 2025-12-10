import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

dotenv.config();

// Import Supabase routes
import authRoutes from './routes/auth.supabase.js';
import configRoutes from './routes/config.supabase.js';
import dashboardRoutes from './routes/dashboard.supabase.js';
import loadsRoutes from './routes/loads.supabase.js';
import packagingRoutes from './routes/packaging.supabase.js';
import plannerRoutes from './routes/planner.supabase.js';
import reportsRoutes from './routes/reports.supabase.js';
import sitesRoutes from './routes/sites.supabase.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/loads', loadsRoutes);
app.use('/api/sites', sitesRoutes);
app.use('/api/config', configRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/packaging', packagingRoutes);
app.use('/api/planner', plannerRoutes);
app.use('/api/reports', reportsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`\n�� Server running on http://localhost:${PORT}`);
  console.log(`\n📊 Available API Endpoints:`);
  console.log(`\n   Authentication:`);
  console.log(`   POST   /api/auth/login`);
  console.log(`   POST   /api/auth/register`);
  console.log(`   GET    /api/auth/me`);
  console.log(`\n   Loads:`);
  console.log(`   GET    /api/loads`);
  console.log(`   POST   /api/loads`);
  console.log(`   GET    /api/loads/:id`);
  console.log(`   PUT    /api/loads/:id`);
  console.log(`   DELETE /api/loads/:id`);
  console.log(`\n   Sites:`);
  console.log(`   GET    /api/sites`);
  console.log(`   GET    /api/sites/:id`);
  console.log(`\n   Form Data:`);
  console.log(`   GET    /api/form-data`);
  console.log(`\n   Dashboard:`);
  console.log(`   GET    /api/dashboard/summary`);
  console.log(`   GET    /api/dashboard/load-stats`);
  console.log(`   GET    /api/dashboard/packaging-in-transit`);
  console.log(`   GET    /api/dashboard/inventory-summary`);
  console.log(`   GET    /api/dashboard/recent-activity`);
  console.log(`\n   Packaging:`);
  console.log(`   GET    /api/packaging/types`);
  console.log(`   GET    /api/packaging/inventory`);
  console.log(`   GET    /api/packaging/inventory/site/:siteId`);
  console.log(`   GET    /api/packaging/movements`);
  console.log(`   POST   /api/packaging/inventory/adjust`);
  console.log(`\n   Settings:`);
  console.log(`   GET    /api/settings`);
  console.log(`   GET    /api/settings/users`);
  console.log(`   GET    /api/settings/vehicles`);
  console.log(`   GET    /api/settings/drivers`);
  console.log(`\n✅ Server ready!\n`);
});
