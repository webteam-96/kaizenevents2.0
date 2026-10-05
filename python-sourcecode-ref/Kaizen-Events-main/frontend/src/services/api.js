import axios from 'axios';
import { toast } from 'sonner';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${API_BASE_URL}/api`;

const api = axios.create({
  baseURL: API,
});

// Guard so a burst of 401s (e.g. several in-flight requests when a token expires)
// only triggers one toast + redirect.
let sessionExpiredHandled = false;

// Add token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Instamojo Archive: server-side session check.
  // After /verify-password the frontend stores { token, expires_at } in localStorage
  // under "instamojoArchiveSession". The backend's CheckArchiveAccessAsync requires
  // this token in the X-Instamojo-Session header on every archive call (except
  // /verify-password itself, which is what issues the token).
  const url = (config.url || '').toString();
  if (url.includes('/instamojo-archive/') && !url.includes('/instamojo-archive/verify-password')) {
    try {
      const raw = localStorage.getItem('instamojoArchiveSession');
      if (raw) {
        const s = JSON.parse(raw);
        if (s?.token && Math.floor(Date.now() / 1000) < (s.expires_at || 0)) {
          config.headers['X-Instamojo-Session'] = s.token;
        }
      }
    } catch {/* ignore */}
  }

  return config;
});

// Handle 401 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Don't redirect when the 401 came from the login attempt itself — let the
      // calling page (Login.js) handle the error so the toast renders.
      const url = (error.config?.url || '').toString();
      const isLoginCall = url.includes('/auth/login');
      if (!isLoginCall && !sessionExpiredHandled) {
        sessionExpiredHandled = true;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        try { toast.error('Your session expired. Please sign in again.'); } catch {/* noop */}
        // Preserve where the user was so they can be returned after re-login.
        const onLogin = window.location.pathname === '/login';
        const next = onLogin
          ? ''
          : `?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        // Small delay so the toast is actually seen before the hard redirect.
        setTimeout(() => { window.location.href = `/login${next}`; }, 900);
      }
    }
    // If the Instamojo For Accounts session expired server-side, clear the
    // localStorage copy and bounce back to the gate. The detail string matches
    // the controller. (Older builds said "Instamojo Archive session expired" —
    // regex matches either spelling to keep old in-flight responses working.)
    if (error.response?.status === 403
        && /Instamojo (For Accounts|Archive) session expired/i.test(error.response?.data?.detail || '')) {
      localStorage.removeItem('instamojoArchiveSession');
      if (typeof window !== 'undefined' && !window.location.pathname.endsWith('/instamojo')) {
        window.location.href = '/instamojo';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
