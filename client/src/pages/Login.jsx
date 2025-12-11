import { CubeIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    setIsLoading(true);
    try {
      if (showSignUp) {
        // Register new user
        await axios.post(`${API_BASE_URL}/auth/register`, {
          email: data.email,
          password: data.password,
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role || 'readonly'
        });
        toast.success('Account created! Please sign in.');
        setShowSignUp(false);
        reset();
      } else {
        // Login
        await login(data.email, data.password);
        toast.success('Welcome back!');
        navigate('/');
      }
    } catch (error) {
      toast.error(error.response?.data?.error?.message || error.message || (showSignUp ? 'Registration failed' : 'Login failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setShowSignUp(!showSignUp);
    reset();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mb-4">
              {showSignUp ? (
                <UserPlusIcon className="w-10 h-10 text-primary-600" />
              ) : (
                <CubeIcon className="w-10 h-10 text-primary-600" />
              )}
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              {showSignUp ? 'Create Account' : 'PackTrack'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {showSignUp ? 'Sign up for a new account' : 'Packaging Load Tracker'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {showSignUp && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="form-label">
                    First Name
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    className="form-input"
                    placeholder="John"
                    {...register('firstName', {
                      required: showSignUp ? 'First name is required' : false,
                    })}
                  />
                  {errors.firstName && (
                    <p className="mt-1 text-sm text-red-600">{errors.firstName.message}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="lastName" className="form-label">
                    Last Name
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    className="form-input"
                    placeholder="Doe"
                    {...register('lastName', {
                      required: showSignUp ? 'Last name is required' : false,
                    })}
                  />
                  {errors.lastName && (
                    <p className="mt-1 text-sm text-red-600">{errors.lastName.message}</p>
                  )}
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="form-label">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="form-input"
                placeholder="you@example.com"
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email address',
                  },
                })}
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="form-input"
                placeholder="••••••••"
                {...register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 6,
                    message: 'Password must be at least 6 characters',
                  },
                })}
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>

            {showSignUp && (
              <div>
                <label htmlFor="role" className="form-label">
                  Role
                </label>
                <select
                  id="role"
                  className="form-select"
                  {...register('role')}
                >
                  <option value="readonly">Read Only</option>
                  <option value="farm_user">Farm User</option>
                  <option value="depot_user">Depot User</option>
                  <option value="dispatcher">Dispatcher</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn btn-primary py-3 text-base"
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {showSignUp ? 'Creating Account...' : 'Signing in...'}
                </span>
              ) : (
                showSignUp ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>

          {/* Toggle between login and signup */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={toggleMode}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              {showSignUp ? 'Already have an account? Sign In' : "Don't have an account? Create one"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
