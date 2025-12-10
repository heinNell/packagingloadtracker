import axios from 'axios';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} email
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} role
 * @property {string|null} assignedSiteId
 */

/**
 * @typedef {Object} AuthState
 * @property {User|null} user
 * @property {string|null} token
 * @property {boolean} isAuthenticated
 * @property {boolean} isLoading
 * @property {(email: string, password: string) => Promise<void>} login
 * @property {() => Promise<void>} logout
 * @property {() => Promise<void>} checkAuth
 * @property {() => string|null} getToken
 */

/** @type {import('zustand').UseBoundStore<import('zustand').StoreApi<AuthState>>} */
export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,

      getToken: () => get().token,

      login: async (email, password) => {
        const response = await axios.post(`${API_BASE_URL}/auth/login`, {
          email,
          password,
        });

        const { token, user: userData } = response.data;

        const user = {
          id: userData.id,
          email: userData.email,
          firstName: userData.first_name || email.split('@')[0],
          lastName: userData.last_name || '',
          role: userData.role || 'admin',
          assignedSiteId: userData.assigned_site_id || null,
        };

        set({
          user,
          token,
          isAuthenticated: true,
          isLoading: false,
        });
      },

      logout: async () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        });
      },

      checkAuth: async () => {
        const token = get().token;

        if (!token) {
          set({ isLoading: false, isAuthenticated: false });
          return;
        }

        try {
          const response = await axios.get(`${API_BASE_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          const userData = response.data.user || response.data;
          const user = {
            id: userData.id,
            email: userData.email,
            firstName: userData.firstName || userData.first_name || userData.email?.split('@')[0] || '',
            lastName: userData.lastName || userData.last_name || '',
            role: userData.role || 'admin',
            assignedSiteId: userData.assignedSiteId || userData.assigned_site_id || null,
          };

          set({
            user,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          console.error('Auth check failed:', error);
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token, user: state.user }),
    }
  )
);

// Check auth on app load
if (typeof window !== 'undefined') {
  useAuthStore.getState().checkAuth();
}
