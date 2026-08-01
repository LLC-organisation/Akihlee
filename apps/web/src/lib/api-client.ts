/**
 * API client for Akihlee backend
 */

import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';
const TOKEN_STORAGE_KEY = 'akihlee_token';

export const getAuthToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
};

export const setAuthToken = (token: string): void => {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
};

export const clearAuthToken = (): void => {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
};

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - attach the JWT issued at login/register, if we have one
apiClient.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
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
      clearAuthToken();
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
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
  status: 'UPLOADED' | 'PROCESSING' | 'EXTRACTED' | 'REVIEW_REQUIRED' | 'APPROVED' | 'REJECTED';
  createdAt: string;
};

export type AuthResponse = {
  token: string;
  tenantId: string;
  email: string;
  businessName: string;
};

export const authApi = {
  register: async (businessName: string, email: string, password: string): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/register', {
      businessName,
      email,
      password,
    });
    return response.data;
  },

  login: async (email: string, password: string): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/login', { email, password });
    return response.data;
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    await apiClient.put('/auth/change-password', { currentPassword, newPassword });
  },
};

export type Tenant = {
  id: string;
  businessName: string;
  whatsappPhoneNumber: string | null;
};

export const tenantApi = {
  get: async (): Promise<Tenant> => {
    const response = await apiClient.get<Tenant>('/tenant');
    return response.data;
  },

  updateBusinessName: async (businessName: string): Promise<Tenant> => {
    const response = await apiClient.put<Tenant>('/tenant', { businessName });
    return response.data;
  },

  connectWhatsApp: async (phoneNumber: string): Promise<Tenant> => {
    const response = await apiClient.put<Tenant>('/tenant/whatsapp-number', { phoneNumber });
    return response.data;
  },

  disconnectWhatsApp: async (): Promise<Tenant> => {
    const response = await apiClient.delete<Tenant>('/tenant/whatsapp-number');
    return response.data;
  },
};

export const aiCfoApi = {
  chat: async (message: string): Promise<string> => {
    const response = await apiClient.post<{ reply: string }>('/ai-cfo/chat', { message });
    return response.data.reply;
  },
};

export type ExtractedData = {
  id: string;
  documentId: string;
  tenantId: string;
  filename: string;
  merchantName: string | null;
  transactionDate: string | null;
  totalAmount: number | null;
  currency: string | null;
  taxAmount: number | null;
  lineItemsJson: string | null;
  confidence: number;
  createdAt: string;
};

export type Page<T> = {
  content: T[];
  totalPages: number;
  totalElements: number;
  number: number; // current page, 0-indexed
  size: number;
};

export const extractedDataApi = {
  /**
   * Paginated, tenant-scoped view of everything the OCR pipeline has
   * extracted so far.
   */
  list: async (page: number, size: number): Promise<Page<ExtractedData>> => {
    const response = await apiClient.get<Page<ExtractedData>>('/extracted-data', {
      params: { page, size },
    });
    return response.data;
  },
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
