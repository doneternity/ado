import type { ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Verify } from "./pages/Verify";
import { VerifyPending } from "./pages/VerifyPending";
import { Dashboard } from "./pages/Dashboard";
import { NotFound } from "./pages/NotFound";
import { useMe } from "./api/queries";

function Root() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <div>Loading…</div>;
  if (!me) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <div>Loading…</div>;
  if (me) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: "/", element: <Navigate to="/dashboard" replace /> },
      { path: "/login", element: <RedirectIfAuthed><Login /></RedirectIfAuthed> },
      { path: "/verify", element: <Verify /> },
      { path: "/verify-pending", element: <VerifyPending /> },
      { path: "/dashboard", element: <RequireAuth><Dashboard /></RequireAuth> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
