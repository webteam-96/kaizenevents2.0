import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for stored user on mount
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (storedUser && token) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      const { access_token, user: userData } = response.data;

      localStorage.setItem('token', access_token);
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);

      return { success: true };
    } catch (error) {
      // Surface the backend's progressive-lockout counter so users see how many
      // tries they have left before the account or IP is temporarily blocked.
      const detail    = error.response?.data?.detail || 'Login failed';
      const remaining = error.response?.data?.remaining_attempts;
      const message = typeof remaining === 'number'
        ? `${detail} ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        : detail;
      return { success: false, error: message };
    }
  };

  const register = async (email, password, name, role = 'org_admin') => {
    try {
      await api.post('/auth/register', { email, password, name, role });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || 'Registration failed'
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    window.location.href = '/login';
  };

  const isSuperAdmin = () => {
    return user?.role === 'super_admin';
  };

  const isOrgAdmin = () => {
    return user?.role === 'org_admin';
  };

  const canWrite = () => {
    // Only super admins can create/edit/delete
    return user?.role === 'super_admin';
  };

  const canAccessCampaign = (campaignId) => {
    // Super admins can access all campaigns
    if (user?.role === 'super_admin') return true;
    // Org admins can only access campaigns they're assigned to
    return user?.campaign_access?.includes(campaignId);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      login, 
      register, 
      logout, 
      isSuperAdmin,
      isOrgAdmin,
      canWrite,
      canAccessCampaign
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
