import { create } from "zustand";
import { persist } from "zustand/middleware";

type UiState = {
  tosAccepted: boolean;
  privacyAccepted: boolean;
  setTosAccepted: (v: boolean) => void;
  setPrivacyAccepted: (v: boolean) => void;
  toast: { message: string; key: number } | null;
  showToast: (message: string) => void;
  hideToast: () => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      tosAccepted: false,
      privacyAccepted: false,
      setTosAccepted: (v) => set({ tosAccepted: v }),
      setPrivacyAccepted: (v) => set({ privacyAccepted: v }),
      toast: null,
      showToast: (message) => set({ toast: { message, key: Date.now() } }),
      hideToast: () => set({ toast: null }),
    }),
    {
      name: "ado-ui",
      partialize: (s) => ({
        tosAccepted: s.tosAccepted,
        privacyAccepted: s.privacyAccepted,
      }),
    },
  ),
);
