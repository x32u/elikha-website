// Elikha API Service
const API_BASE_URL = 'http://localhost:5000/api';

class ApiService {
  constructor() {
    this.token = sessionStorage.getItem('authToken');
  }

  setToken(token) {
    this.token = token;
    sessionStorage.setItem('authToken', token);
  }

  clearToken() {
    this.token = null;
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('userInfo');
  }

  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
      ...options,
      headers: this.getHeaders(),
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // Auth endpoints
  async login(email, password, role = null) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, role }),
    });
    
    this.setToken(data.token);
    sessionStorage.setItem('userInfo', JSON.stringify(data.user));
    
    return data;
  }

  async register(userData) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
    
    this.setToken(data.token);
    sessionStorage.setItem('userInfo', JSON.stringify(data.user));
    
    return data;
  }

  async getCurrentUser() {
    return this.request('/auth/me');
  }

  logout() {
    this.clearToken();
  }

  // Classes endpoints
  async getClasses() {
    return this.request('/classes');
  }

  async getClass(id) {
    return this.request(`/classes/${id}`);
  }

  async createClass(classData) {
    return this.request('/classes', {
      method: 'POST',
      body: JSON.stringify(classData),
    });
  }

  async getClassStudents(classId) {
    return this.request(`/classes/${classId}/students`);
  }

  // Activities endpoints
  async getActivities() {
    return this.request('/activities');
  }

  async getActivity(id) {
    return this.request(`/activities/${id}`);
  }

  async createActivity(activityData) {
    return this.request('/activities', {
      method: 'POST',
      body: JSON.stringify(activityData),
    });
  }

  async startActivity(id) {
    return this.request(`/activities/${id}/start`, {
      method: 'POST',
    });
  }

  async updateActivityProgress(id, progressData) {
    return this.request(`/activities/${id}/progress`, {
      method: 'PUT',
      body: JSON.stringify(progressData),
    });
  }

  async submitActivity(id) {
    return this.request(`/activities/${id}/submit`, {
      method: 'POST',
    });
  }
}

const api = new ApiService();
export default api;
