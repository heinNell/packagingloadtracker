import jwt from 'jsonwebtoken';
import { supabase } from '../db/supabase.js';

/**
 * Authentication middleware
 * Supports both custom JWT tokens and Supabase Auth tokens
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: { message: 'Authentication required' } });
    }

    const token = authHeader.substring(7);
    
    // Try to verify as custom JWT first
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from database
      const { data: user, error } = await supabase
        .from('users')
        .select('id, email, first_name, last_name, role, assigned_site_id, is_active')
        .eq('id', decoded.userId)
        .single();

      if (error || !user) {
        return res.status(401).json({ error: { message: 'User not found' } });
      }

      if (!user.is_active) {
        return res.status(401).json({ error: { message: 'Account is deactivated' } });
      }

      req.user = user;
      return next();
    } catch (jwtError) {
      // If JWT verification fails, try Supabase Auth
      console.log('JWT verification failed, trying Supabase Auth...');
    }

    // Try Supabase Auth
    const { data: { user: supabaseUser }, error: supabaseError } = await supabase.auth.getUser(token);
    
    if (supabaseError || !supabaseUser) {
      return res.status(401).json({ error: { message: 'Invalid or expired token' } });
    }

    // Get user from our users table by email
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, role, assigned_site_id, is_active')
      .eq('email', supabaseUser.email)
      .single();

    if (dbError || !dbUser) {
      // User exists in Supabase Auth but not in our users table
      // Create a default user record
      req.user = {
        id: supabaseUser.id,
        email: supabaseUser.email,
        first_name: supabaseUser.user_metadata?.first_name || supabaseUser.email.split('@')[0],
        last_name: supabaseUser.user_metadata?.last_name || '',
        role: 'admin', // Default role
        assigned_site_id: null,
        is_active: true
      };
    } else {
      req.user = dbUser;
    }
    
    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ error: { message: 'Authentication failed' } });
  }
};

/**
 * Role-based authorization middleware
 * @param {string[]} allowedRoles - Array of allowed roles
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: { message: 'Authentication required' } });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: { message: 'Insufficient permissions' } });
    }

    next();
  };
};

/**
 * Optional authentication - attaches user if token present
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (!error && user) {
        req.user = {
          id: user.id,
          email: user.email,
          first_name: user.user_metadata?.first_name || user.email.split('@')[0],
          last_name: user.user_metadata?.last_name || '',
          role: user.user_metadata?.role || 'admin',
          assigned_site_id: user.user_metadata?.assigned_site_id || null,
          is_active: true,
        };
      }
    }
    
    next();
  } catch (error) {
    // Ignore authentication errors for optional auth
    next();
  }
};
