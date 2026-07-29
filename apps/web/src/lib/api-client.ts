/**
 * API client for Akihlee backend
 */

import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // For cookie-based auth
});

// Request interceptor - add auth token if available
apiClient.interceptors.request.use(
  (config) => {
    // TODO: Add JWT token from localStorage/cookies
    // const token = getAuthToken();
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors globally
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized - redirect to login
      // window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// API types and methods
export type Document = {
  id: string;
  tenantId: string;
  filename: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  status: 'UPLOADED' | 'PROCESSING' | 'EXTRACTED' | 'REVIEW_REQUIRED' | 'APPROVED';
  createdAt: string;
};

export const documentsApi = {
  /**
   * Upload a document (receipt, invoice, etc.)
   */
  upload: async (file: File): Promise<Document> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post<Document>('/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return response.data;
  },

  /**
   * List all documents for current tenant
   */
  list: async (): Promise<Document[]> => {
    const response = await apiClient.get<Document[]>('/documents');
    return response.data;
  },

  /**
   * Get a specific document
   */
  get: async (id: string): Promise<Document> => {
    const response = await apiClient.get<Document>(`/documents/${id}`);
    return response.data;
  },
};
