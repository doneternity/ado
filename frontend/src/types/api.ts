export type User = {
  id: string;
  email: string;
  emailVerified: boolean;
  role: "user" | "admin";
  displayName?: string;
  photoUrl?: string;
};

export type MeResponse = {
  user: User;
  csrfToken: string;
};

export type KeyJustIssued = {
  key: string;
  keyPrefix: string;
  dailyLimit: number;
};

export type AuthResponse = {
  user: User;
  csrfToken: string;
  keyJustIssued?: KeyJustIssued;
};

export type SignupResponse = {
  user: User;
  verificationRequired: true;
};

export type CurrentKeyResponse = {
  keyPrefix: string;
  dailyLimit: number;
  used: number;
  resetsAt: string;
  createdAt: string;
  lastUsedAt?: string;
  rpmLimit?: number;
  rpmUsed?: number;
  reasoningMode?: boolean;
  plan?: { id: string; name: string };
};

export type FlashKeyResponse =
  | { key: null }
  | { key: string; keyPrefix: string; dailyLimit: number };

export type ApiErrorBody = {
  error: { code: string; message: string; [k: string]: unknown };
};

// Admin types
export type AdminProviderKey = {
  id: string;
  label: string;
  suffix: string; // last 4 characters; the full key never leaves the backend
  isActive: boolean;
};

export type AdminProvider = {
  id: string;
  name: string;
  baseUrl: string;
  isActive: boolean;
  priority: number;
  keys: AdminProviderKey[];
};

export type AdminUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: "user" | "admin";
  banned: boolean;
  createdAt: string;
  dailyQuotaOverride: number | null;
  planId: string;
  requestsToday: number;
};

// null limits mean "use the global setting".
export type AdminPlan = {
  id: string;
  name: string;
  dailyQuota: number | null;
  rpm: number | null;
  userCount: number;
  createdAt: string;
};

export type AdminStats = {
  totalUsers: number;
  activeProviders: number;
  daily: { day: string; total: number }[];
  topUsers: { email: string; total: number }[];
};

export type AdminQuotas = {
  globalLimit: string;
  globalRpmLimit: string;
  slotsLimit: number;
  slotsUsed: number;
  overrides: { userId: string; email: string; limit: number }[];
};

export type AdminErrorLog = {
  id: number;
  level: "error" | "warn";
  message: string;
  context: Record<string, unknown> | null;
  createdAt: string;
};

export type AdminErrorsResponse = {
  logs: AdminErrorLog[];
  total: number;
  page: number;
};

export type MaintenanceStatus = { enabled: boolean };
