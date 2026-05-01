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

export type CurrentKeyResponse = {
  keyPrefix: string;
  dailyLimit: number;
  used: number;
  resetsAt: string;
  createdAt: string;
  lastUsedAt?: string;
};

export type FlashKeyResponse =
  | { key: null }
  | { key: string; keyPrefix: string; dailyLimit: number };

export type ApiErrorBody = {
  error: { code: string; message: string; [k: string]: unknown };
};
