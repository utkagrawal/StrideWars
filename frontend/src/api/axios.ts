import axios from 'axios';

// Basic instance for normal API calls
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// We keep a reference to the token in memory
let accessToken = '';

export const setAccessToken = (token: string) => {
  accessToken = token;
};

// Request interceptor: Attach access token if available
api.interceptors.request.use(
  (config) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Silent refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // Do not intercept 401s for login or refresh endpoints
    if (originalRequest.url?.includes('/auth/login') || originalRequest.url?.includes('/auth/refresh')) {
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'] || 'a few';
        window.dispatchEvent(new CustomEvent('api-error', { 
          detail: { message: `Too many requests. Please try again in ${retryAfter} seconds.` } 
        }));
      }
      return Promise.reject(error);
    }

    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'] || 'a few';
      window.dispatchEvent(new CustomEvent('api-error', { 
        detail: { message: `Too many requests. Please try again in ${retryAfter} seconds.` } 
      }));
      return Promise.reject(error);
    }

    // If the error is 401 and we haven't already retried this request
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Attempt to hit the refresh endpoint. The httpOnly cookie is sent automatically because of withCredentials
        const { data } = await axios.post(
          `${API_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        // Update the access token in memory
        setAccessToken(data.accessToken);

        // Update the original request's auth header
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;

        // Retry the original request
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed (e.g. cookie expired).
        // Let the application handle the log out
        window.dispatchEvent(new CustomEvent('api-unauthorized'));
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
