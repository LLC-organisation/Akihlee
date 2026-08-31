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

/**
 * Reads the "role" claim straight out of the JWT payload rather than
 * storing it separately — the token is the single source of truth, so
 * there's no risk of a stale copy surviving a role change or logout.
 * Decoding a JWT payload is just base64url + JSON, no library needed.
 */
export const getCurrentUserRole = (): 'USER' | 'ADMIN' | null => {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(base64));
    return decoded.role === 'ADMIN' ? 'ADMIN' : 'USER';
  } catch {
    return null;
  }
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
  source: 'UPLOAD' | 'EMAIL' | 'WHATSAPP' | 'SQUARE';
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
  inboundEmailAddress: string;
  squareConnected: boolean;
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

export type ChatTurn = { role: 'user' | 'assistant'; text: string };

export type AiCfoConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type AiCfoConversationDetail = AiCfoConversationSummary & {
  messages: { role: 'user' | 'assistant'; text: string; createdAt: string }[];
};

export const aiCfoApi = {
  // Stateless — used by the quick-chat widget on Dashboard/Analytics.
  // History lives only in the caller's own state, nothing persisted.
  chat: async (message: string, history: ChatTurn[] = []): Promise<string> => {
    const response = await apiClient.post<{ reply: string }>('/ai-cfo/chat', { message, history });
    return response.data.reply;
  },

  // Persisted — used by the full /ai-cfo page.
  listConversations: async (): Promise<AiCfoConversationSummary[]> => {
    const response = await apiClient.get<AiCfoConversationSummary[]>('/ai-cfo/conversations');
    return response.data;
  },

  getConversation: async (id: string): Promise<AiCfoConversationDetail> => {
    const response = await apiClient.get<AiCfoConversationDetail>(`/ai-cfo/conversations/${id}`);
    return response.data;
  },

  sendMessage: async (
    conversationId: string | null,
    message: string
  ): Promise<{ conversationId: string; title: string; reply: string }> => {
    const response = await apiClient.post<{ conversationId: string; title: string; reply: string }>(
      '/ai-cfo/conversations/messages',
      { conversationId, message }
    );
    return response.data;
  },
};

// SKU/category/taxability can't be read off a receipt by OCR — those are
// left null by the worker and are exactly the fields review is for.
// itemName is populated for INVOICE line items only (a short product/service
// name distinct from the fuller description) — left null for receipts.
export type LineItem = {
  itemName?: string | null;
  description: string;
  sku?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  totalPrice: number;
  categoryTag?: string | null;
  isTaxable?: boolean | null;
  categoryConfidence?: number | null;
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
  documentType: 'RECEIPT' | 'INVOICE' | 'BANK_STATEMENT';
  confidence: number;
  // "vision" (Claude on Bedrock) or "regex" (Tesseract fallback) — null for
  // rows extracted before this field existed.
  extractionMethod: 'vision' | 'regex' | null;
  createdAt: string;
};

export type BankTransaction = {
  id: string;
  extractedDataId: string;
  tenantId: string;
  transactionDate: string;
  description: string | null;
  payeeOrPayer: string | null;
  amount: number;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  category: string | null;
  // Set to 1.0 whenever a person creates/edits the row; otherwise whatever
  // the extraction engine reported (or null for TRANSFER rows, which are
  // never categorized at all, or rows predating this field).
  categoryConfidence: number | null;
  createdAt: string;
};

export type BankTransactionRequest = {
  transactionDate: string; // ISO yyyy-MM-dd
  description: string | null;
  payeeOrPayer: string | null;
  amount: number;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  category: string | null;
};

export type Page<T> = {
  content: T[];
  totalPages: number;
  totalElements: number;
  number: number; // current page, 0-indexed
  size: number;
};

export type UpdateExtractedDataRequest = {
  merchantName: string | null;
  transactionDate: string | null; // ISO yyyy-MM-dd
  totalAmount: number | null;
  currency: string | null;
  taxAmount: number | null;
  // Omit (undefined) to leave line items untouched — only send this when
  // actually editing them, since the backend treats null/absent as "don't
  // overwrite" (see ExtractedDataController.update).
  lineItems?: LineItem[] | null;
};

export const extractedDataApi = {
  /**
   * Paginated, tenant-scoped view of everything the OCR pipeline has
   * extracted so far — newest upload first. createdAt is when this row was
   * written (i.e. when extraction finished), the closest proxy to upload
   * time available without a join back to Document.
   */
  list: async (page: number, size: number): Promise<Page<ExtractedData>> => {
    const response = await apiClient.get<Page<ExtractedData>>('/extracted-data', {
      params: { page, size, sort: 'createdAt,desc' },
    });
    return response.data;
  },

  /**
   * Corrects a field OCR got wrong (merchant, date, amounts, currency).
   */
  update: async (id: string, request: UpdateExtractedDataRequest): Promise<ExtractedData> => {
    const response = await apiClient.put<ExtractedData>(`/extracted-data/${id}`, request);
    return response.data;
  },

  /**
   * Single-document view, for the per-document review page — 404s if OCR
   * hasn't produced a row yet.
   */
  getByDocument: async (documentId: string): Promise<ExtractedData> => {
    const response = await apiClient.get<ExtractedData>(`/documents/${documentId}/extracted-data`);
    return response.data;
  },
};

export const bankTransactionsApi = {
  list: async (extractedDataId: string): Promise<BankTransaction[]> => {
    const response = await apiClient.get<BankTransaction[]>(
      `/extracted-data/${extractedDataId}/bank-transactions`
    );
    return response.data;
  },

  create: async (extractedDataId: string, request: BankTransactionRequest): Promise<BankTransaction> => {
    const response = await apiClient.post<BankTransaction>(
      `/extracted-data/${extractedDataId}/bank-transactions`,
      request
    );
    return response.data;
  },

  update: async (id: string, request: BankTransactionRequest): Promise<BankTransaction> => {
    const response = await apiClient.put<BankTransaction>(`/bank-transactions/${id}`, request);
    return response.data;
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/bank-transactions/${id}`);
  },
};

// A tenant's "always categorize X as Y" memory — applied server-side at
// extraction-ingestion time (core-api's ExtractedDataController), not
// something the frontend ever needs to apply itself.
export type VendorRule = {
  id: string;
  tenantId: string;
  vendorPattern: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  category: string;
  createdAt: string;
};

export type VendorRuleRequest = {
  vendorPattern: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  category: string;
};

export const vendorRulesApi = {
  list: async (): Promise<VendorRule[]> => {
    const response = await apiClient.get<VendorRule[]>('/vendor-rules');
    return response.data;
  },

  create: async (request: VendorRuleRequest): Promise<VendorRule> => {
    const response = await apiClient.post<VendorRule>('/vendor-rules', request);
    return response.data;
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/vendor-rules/${id}`);
  },
};

export type AuditLogEntry = {
  id: string;
  tenantId: string | null;
  tenantBusinessName: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  detail: string | null;
  createdAt: string;
};

export type AuditLogFilters = {
  actorEmail?: string;
  tenantId?: string;
  action?: string;
  from?: string; // ISO datetime
  to?: string; // ISO datetime
  q?: string;
  page?: number;
  size?: number;
};

export type AdminTenantSummary = {
  id: string;
  businessName: string;
};

export const adminAuditLogApi = {
  /**
   * Admin-only (see SecurityConfig's /api/v1/admin/** gate) — a non-admin
   * JWT gets a 403 straight from Spring Security before this ever runs.
   */
  search: async (filters: AuditLogFilters): Promise<Page<AuditLogEntry>> => {
    const response = await apiClient.get<Page<AuditLogEntry>>('/admin/audit-log', {
      params: filters,
    });
    return response.data;
  },
};

export const adminTenantsApi = {
  /**
   * Admin-only tenant lookup, for picking a tenant by name/id rather than
   * needing the UUID memorized (e.g. the audit log's tenant filter).
   */
  search: async (search: string, page = 0, size = 20): Promise<Page<AdminTenantSummary>> => {
    const response = await apiClient.get<Page<AdminTenantSummary>>('/admin/tenants', {
      params: { search: search || undefined, page, size },
    });
    return response.data;
  },
};

export type UserRole = 'USER' | 'ADMIN';

export type UserAccountStatus = 'ACTIVE' | 'IDLE' | 'AT_RISK' | 'SUSPENDED';

// There's no "name" field anywhere in this schema — User only has email —
// so the directory/profile derive a display label from the email itself
// rather than a real name.
export type UserDirectoryEntry = {
  id: string;
  tenantId: string;
  tenantBusinessName: string;
  email: string;
  role: UserRole;
  status: UserAccountStatus;
  registeredAt: string;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
  totalSessions: number;
  // null means "no ping data yet" (not zero) — see UserActivityService.
  avgSessionDurationMinutes: number | null;
  documentsUploaded: number;
  documentsApproved: number;
  documentsRejected: number;
  documentsProcessedTotal: number;
};

export type UserDirectoryFilters = {
  search?: string;
  tenantId?: string;
  role?: UserRole;
  sortBy?: 'lastActiveAt' | 'documentsProcessed';
  page?: number;
  size?: number;
};

export type UserSummary = {
  dailyActiveUsers: number;
  monthlyActiveUsers: number;
  avgSessionDurationMinutes: number | null;
  topPowerUsers: { id: string; email: string; tenantBusinessName: string; documentsProcessedTotal: number }[];
  atRiskUsers: number;
  totalUsers: number;
};

export type UserDetail = {
  id: string;
  tenantId: string;
  tenantBusinessName: string;
  email: string;
  role: UserRole;
  status: UserAccountStatus;
  registeredAt: string;
  // No geo-IP lookup wired up (same gap as the audit log's IP column) and
  // no device/hardware fingerprinting anywhere in this app — userAgent is
  // the honest stand-in for "hardware", not a fabricated device profile.
  lastKnownIp: string | null;
  lastKnownUserAgent: string | null;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
  totalSessions: number;
  avgSessionDurationMinutes: number | null;
  documentActivity: { uploaded: number; approved: number; rejected: number; corrected: number };
  weeklyActivityTrend: { weekStart: string; eventCount: number }[];
  ipHistory: { seenAt: string; ipAddress: string; userAgent: string | null; action: string }[];
};

export const adminUsersApi = {
  list: async (filters: UserDirectoryFilters): Promise<Page<UserDirectoryEntry>> => {
    const response = await apiClient.get<Page<UserDirectoryEntry>>('/admin/users', { params: filters });
    return response.data;
  },
  summary: async (filters: Omit<UserDirectoryFilters, 'sortBy' | 'page' | 'size'>): Promise<UserSummary> => {
    const response = await apiClient.get<UserSummary>('/admin/users/summary', { params: filters });
    return response.data;
  },
  detail: async (userId: string): Promise<UserDetail> => {
    const response = await apiClient.get<UserDetail>(`/admin/users/${userId}`);
    return response.data;
  },
  activity: async (userId: string, page = 0, size = 25): Promise<Page<AuditLogEntry>> => {
    const response = await apiClient.get<Page<AuditLogEntry>>(`/admin/users/${userId}/activity`, {
      params: { page, size },
    });
    return response.data;
  },
  updateStatus: async (userId: string, active: boolean): Promise<UserDetail> => {
    const response = await apiClient.patch<UserDetail>(`/admin/users/${userId}/status`, { active });
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

  approve: async (id: string): Promise<Document> => {
    const response = await apiClient.post<Document>(`/documents/${id}/approve`);
    return response.data;
  },

  reject: async (id: string, reason: string | null): Promise<Document> => {
    const response = await apiClient.post<Document>(`/documents/${id}/reject`, { reason });
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/documents/${id}`);
  },

  /**
   * Fetches the original file as a blob URL for use in <img>/<a> tags.
   * A plain <img src="…/content"> can't carry the auth header and the
   * endpoint isn't public, so this goes through apiClient (which attaches
   * the JWT) and hands back an object URL instead — caller is responsible
   * for revoking it (URL.revokeObjectURL) when done with it.
   */
  getContentBlobUrl: async (id: string): Promise<string> => {
    const response = await apiClient.get(`/documents/${id}/content`, { responseType: 'blob' });
    return URL.createObjectURL(response.data as Blob);
  },
};

export const integrationsApi = {
  syncSquare: async (): Promise<{ imported: number }> => {
    const response = await apiClient.post<{ imported: number }>('/integrations/square/sync');
    return response.data;
  },

  /**
   * Returns the URL to send the browser to for Square's consent screen.
   * A separate call from the actual navigation (`window.location.href =
   * url`) since this one needs to be an authenticated fetch carrying the
   * JWT — a plain link click to a protected backend route couldn't.
   */
  getSquareAuthorizeUrl: async (): Promise<string> => {
    const response = await apiClient.post<{ url: string }>('/integrations/square/oauth/authorize-url');
    return response.data.url;
  },

  disconnectSquare: async (): Promise<void> => {
    await apiClient.delete('/integrations/square/oauth');
  },
};

export type CategoryAmount = {
  category: string;
  total: number;
};

// period is "yyyy-MM-dd" or "yyyy-MM" depending on how wide the requested
// date range was — the backend auto-picks day vs. month grouping.
export type TrendPoint = {
  period: string;
  total: number;
};

export type AnalyticsDateRange = {
  from?: string; // ISO yyyy-MM-dd
  to?: string; // ISO yyyy-MM-dd
};

// WEEK buckets key on the Monday of that ISO week; QUARTER buckets key on
// "yyyy-Qn". Omit to let the backend auto-pick DAY (short ranges) or MONTH
// (long ranges) — see AnalyticsService.resolveGranularity.
export type Granularity = 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER';

export type AnalyticsQuery = AnalyticsDateRange & {
  granularity?: Granularity;
};

// month's shape tracks whichever granularity was requested — "yyyy-MM-dd"
// for DAY/WEEK, "yyyy-MM" for MONTH, "yyyy-Qn" for QUARTER (see
// lib/utils/date-ranges.ts#formatPeriodLabel for rendering each case).
export type MonthlyTrendPoint = {
  month: string;
  income: number;
  expense: number;
};

// Combines line items (receipts/invoices, always spend) with bank
// transactions (both INCOME and EXPENSE) into one set of figures — unlike
// the per-source breakdowns above, this can double-count a receipt and the
// bank charge that paid it, since there's no reconciliation link between
// the two in this schema.
export type FinancialOverview = {
  totalIncome: number;
  totalExpenses: number;
  netCashFlow: number;
  categoryBreakdown: CategoryAmount[];
  monthlyTrend: MonthlyTrendPoint[];
};

// A line item has no stable id of its own — lineItemIndex is its position
// within the parent ExtractedData's lineItemsJson array, which is what a
// category override needs to find the same entry again via
// extractedDataApi.update.
export type CategorizedLineItem = {
  extractedDataId: string;
  documentId: string;
  lineItemIndex: number;
  date: string;
  vendor: string | null;
  description: string;
  amount: number;
  category: string;
};

export type CategoryDrilldown = {
  lineItems: CategorizedLineItem[];
  bankTransactions: BankTransaction[];
};

export type AnomalyAlert = {
  category: string;
  currentAmount: number;
  historicalWeeklyAverage: number;
  percentAboveAverage: number;
  message: string;
};

// projectedNet is cumulative from today through this date, not an absolute
// bank balance — see AnalyticsService.projectedCashFlow for why.
export type CashFlowProjection = {
  date: string;
  projectedNet: number;
};

export const analyticsApi = {
  overview: async (range: AnalyticsDateRange): Promise<FinancialOverview> => {
    const response = await apiClient.get<FinancialOverview>('/analytics/overview', { params: range });
    return response.data;
  },

  lineItemCategories: async (range: AnalyticsDateRange): Promise<CategoryAmount[]> => {
    const response = await apiClient.get<CategoryAmount[]>('/analytics/line-item-categories', { params: range });
    return response.data;
  },

  lineItemTrend: async (query: AnalyticsQuery): Promise<TrendPoint[]> => {
    const response = await apiClient.get<TrendPoint[]>('/analytics/line-item-trend', { params: query });
    return response.data;
  },

  bankTransactionCategories: async (range: AnalyticsDateRange): Promise<CategoryAmount[]> => {
    const response = await apiClient.get<CategoryAmount[]>('/analytics/bank-transaction-categories', { params: range });
    return response.data;
  },

  bankTransactionTrend: async (query: AnalyticsQuery): Promise<TrendPoint[]> => {
    const response = await apiClient.get<TrendPoint[]>('/analytics/bank-transaction-trend', { params: query });
    return response.data;
  },

  /**
   * Combined income/expense trend at an explicit granularity — powers the
   * dashboard's volatility widget and the Analytics page's combined view.
   */
  combinedTrend: async (query: AnalyticsQuery): Promise<MonthlyTrendPoint[]> => {
    const response = await apiClient.get<MonthlyTrendPoint[]>('/analytics/combined-trend', { params: query });
    return response.data;
  },

  /** Everything currently filed under one category — backs the "click a category pill to reassign" flow. */
  categoryTransactions: async (category: string, range: AnalyticsDateRange): Promise<CategoryDrilldown> => {
    const response = await apiClient.get<CategoryDrilldown>('/analytics/category-transactions', {
      params: { ...range, category },
    });
    return response.data;
  },

  /** Vendor/category spending spikes on one bank statement vs. the tenant's own trailing weekly average. */
  anomalies: async (extractedDataId: string): Promise<AnomalyAlert[]> => {
    const response = await apiClient.get<AnomalyAlert[]>(`/analytics/anomalies/${extractedDataId}`);
    return response.data;
  },

  /** 30-day linear projection of cumulative net cash flow, extrapolated from the trailing 60 days. */
  cashFlowProjection: async (): Promise<CashFlowProjection[]> => {
    const response = await apiClient.get<CashFlowProjection[]>('/analytics/cash-flow-projection');
    return response.data;
  },
};
