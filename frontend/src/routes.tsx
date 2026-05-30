import type { ReactNode } from "react";
import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, Outlet, ScrollRestoration } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AdminLayout } from "./components/AdminLayout";
import { useMe } from "./api/queries";
import { PageLoader } from "./components/PageLoader";

// marketing pages load eagerly so first paint is instant
import { Login } from "./pages/Login";
import { SignUp } from "./pages/SignUp";
import { JoinRequired } from "./pages/JoinRequired";
import { NotFound } from "./pages/NotFound";
import { Landing } from "./pages/Landing";
import { Models } from "./pages/Models";
import { Pricing } from "./pages/Pricing";
import { Status } from "./pages/Status";
import { Privacy } from "./pages/Privacy";
import { Terms } from "./pages/Terms";

// heavier / auth-gated pages split into their own chunks
const named = <T,>(p: Promise<Record<string, T>>, key: string) => p.then((m) => ({ default: m[key] as T }));
const Dashboard = lazy(() => named(import("./pages/Dashboard"), "Dashboard"));
const Docs = lazy(() => named(import("./pages/Docs"), "Docs"));
const Playground = lazy(() => named(import("./pages/Playground"), "Playground"));
const AdminOverview = lazy(() => named(import("./pages/admin/AdminOverview"), "AdminOverview"));
const AdminProviders = lazy(() => named(import("./pages/admin/AdminProviders"), "AdminProviders"));
const AdminUsers = lazy(() => named(import("./pages/admin/AdminUsers"), "AdminUsers"));
const AdminUsage = lazy(() => named(import("./pages/admin/AdminUsage"), "AdminUsage"));
const AdminQuotas = lazy(() => named(import("./pages/admin/AdminQuotas"), "AdminQuotas"));
const AdminErrors = lazy(() => named(import("./pages/admin/AdminErrors"), "AdminErrors"));
const AdminMaintenance = lazy(() => named(import("./pages/admin/AdminMaintenance"), "AdminMaintenance"));

function Root() {
  return (
    <Layout>
      <ScrollRestoration />
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </Layout>
  );
}

function AdminRoot() {
  return (
    <AdminLayout>
      <ScrollRestoration />
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
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
  if (isLoading) return <PageLoader />;
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
      { path: "/",              element: <Landing /> },
      { path: "/models",        element: <Models /> },
      { path: "/docs",          element: <Docs /> },
      { path: "/pricing",       element: <Pricing /> },
      { path: "/status",        element: <Status /> },
      { path: "/playground",    element: <RequireAuth><Playground /></RequireAuth> },
      { path: "/privacy",       element: <Privacy /> },
      { path: "/terms",         element: <Terms /> },
      { path: "/login",         element: <RedirectIfAuthed><Login /></RedirectIfAuthed> },
      { path: "/sign-up",       element: <RedirectIfAuthed><SignUp /></RedirectIfAuthed> },
      { path: "/join-required", element: <JoinRequired /> },
      { path: "/dashboard",     element: <RequireAuth><Dashboard /></RequireAuth> },
      { path: "*",              element: <NotFound /> },
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
