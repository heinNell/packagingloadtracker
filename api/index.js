import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

// Import Supabase routes
import authRoutes from '../server/src/routes/auth.supabase.js';
import configRoutes from '../server/src/routes/config.supabase.js';
import dashboardRoutes from '../server/src/routes/dashboard.supabase.js';
import loadsRoutes from '../server/src/routes/loads.supabase.js';
import packagingRoutes from '../server/src/routes/packaging.supabase.js';
import plannerRoutes from '../server/src/routes/planner.supabase.js';
import reportsRoutes from '../server/src/routes/reports.supabase.js';
import sitesRoutes from '../server/src/routes/sites.supabase.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
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

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: { message: 'API route not found' } });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: { message: err.message || 'Internal server error' }
  });
});

export default app;
