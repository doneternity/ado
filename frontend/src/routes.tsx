import type { ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AdminLayout } from "./components/AdminLayout";
import { Login } from "./pages/Login";
import { Verify } from "./pages/Verify";
import { VerifyPending } from "./pages/VerifyPending";
import { Dashboard } from "./pages/Dashboard";
import { NotFound } from "./pages/NotFound";
import { Landing } from "./pages/Landing";
import { Models } from "./pages/Models";
import { Docs } from "./pages/Docs";
import { Pricing } from "./pages/Pricing";
import { Playground } from "./pages/Playground";
import { Privacy } from "./pages/Privacy";
import { Terms } from "./pages/Terms";
import { AdminOverview } from "./pages/admin/AdminOverview";
import { AdminProviders } from "./pages/admin/AdminProviders";
import { AdminUsers } from "./pages/admin/AdminUsers";
import { AdminUsage } from "./pages/admin/AdminUsage";
import { AdminQuotas } from "./pages/admin/AdminQuotas";
import { AdminErrors } from "./pages/admin/AdminErrors";
import { AdminMaintenance } from "./pages/admin/AdminMaintenance";
import { useMe } from "./api/queries";
import { PageLoader } from "./components/PageLoader";

function Root() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

function AdminRoot() {
  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <PageLoader />;
  if (!me) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return null;
  if (!me) return <Navigate to="/login" replace />;
  if (me.user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <PageLoader />;
  if (me) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: "/",            element: <Landing /> },
      { path: "/models",      element: <Models /> },
      { path: "/docs",        element: <Docs /> },
      { path: "/pricing",     element: <Pricing /> },
      { path: "/playground",  element: <Playground /> },
      { path: "/privacy",     element: <Privacy /> },
      { path: "/terms",       element: <Terms /> },
      { path: "/login",       element: <RedirectIfAuthed><Login /></RedirectIfAuthed> },
      { path: "/verify",      element: <Verify /> },
      { path: "/verify-pending", element: <VerifyPending /> },
      { path: "/dashboard",   element: <RequireAuth><Dashboard /></RequireAuth> },
      { path: "*",            element: <NotFound /> },
    ],
  },
  {
    path: "/admin",
    element: <AdminRoot />,
    children: [
      { index: true,         element: <RequireAdmin><AdminOverview /></RequireAdmin> },
      { path: "providers",   element: <RequireAdmin><AdminProviders /></RequireAdmin> },
      { path: "users",       element: <RequireAdmin><AdminUsers /></RequireAdmin> },
      { path: "usage",       element: <RequireAdmin><AdminUsage /></RequireAdmin> },
      { path: "quotas",      element: <RequireAdmin><AdminQuotas /></RequireAdmin> },
      { path: "errors",      element: <RequireAdmin><AdminErrors /></RequireAdmin> },
      { path: "maintenance", element: <RequireAdmin><AdminMaintenance /></RequireAdmin> },
    ],
  },
]);
