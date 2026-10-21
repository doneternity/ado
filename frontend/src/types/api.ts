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
  // Stripped from the end of this provider's model IDs ("" for none).
  modelSuffix: string;
  // Which models ADO offers: "all" except modelIds, or "only" modelIds.
  modelMode: "all" | "only";
  modelIds: string[];
  keys: AdminProviderKey[];
};

// Admin → Providers → Models: everything a provider offers, and the choice.
export type ProviderModelChoice = {
  mode: "all" | "only";
  ids: string[];
  models: { id: string; name?: string }[];
  error?: string; // why the provider's list couldn't be read
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
  lastActive: string; // latest sign-in, session or key use
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
  // Database size against the free-plan limit (absent if it couldn't be read).
  dbBytes?: number;
  requestLogBytes?: number;
  dbLimitBytes?: number;
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
