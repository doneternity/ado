import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SITE = "https://adoai.space";
const DEFAULT_DESCRIPTION =
  "ADO: one OpenAI-compatible API key for every model we serve. Free, no credit card required.";

type Meta = { title: string; description?: string; noindex?: boolean };

// Per-route <title> and description. Keep in sync with public/sitemap.xml.
// Social crawlers don't run JS; their preview comes from index.html.
export const PAGE_META: Record<string, Meta> = {
  "/":              { title: "ADO: one key, every model" },
  "/models":        { title: "Models · ADO", description: "Every model available through ADO, with live status." },
  "/docs":          { title: "Docs · ADO", description: "How to use ADO's OpenAI-compatible API: base URL, keys, streaming, images, limits and errors, with examples." },
  "/pricing":       { title: "Pricing · ADO", description: "ADO is free while in early access. See daily limits and what's coming in Pro." },
  "/status":        { title: "Status · ADO", description: "Live status of the ADO API and the models behind it." },
  "/privacy":       { title: "Privacy Policy · ADO", description: "What data ADO collects, how it's used, and your choices." },
  "/terms":         { title: "Terms of Service · ADO", description: "The terms for using ADO." },
  "/login":         { title: "Sign in · ADO", noindex: true },
  "/sign-up":       { title: "Sign up · ADO", description: "Get a free ADO API key with your Discord account." },
  "/join-required": { title: "Join our Discord · ADO", noindex: true },
  "/dashboard":     { title: "Dashboard · ADO", noindex: true },
  "/playground":    { title: "Playground · ADO", noindex: true },
};
const NOT_FOUND: Meta = { title: "Page not found · ADO", noindex: true };
const ADMIN: Meta = { title: "Admin · ADO", noindex: true };

function setMeta(selector: string, attr: "name" | "rel", key: string, value: string | null) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (value === null) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement(attr === "rel" ? "link" : "meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute(attr === "rel" ? "href" : "content", value);
}

export function PageMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = PAGE_META[pathname] ?? (pathname.startsWith("/admin") ? ADMIN : NOT_FOUND);
    document.title = meta.title;
    setMeta('meta[name="description"]', "name", "description", meta.description ?? DEFAULT_DESCRIPTION);
    setMeta('link[rel="canonical"]', "rel", "canonical", meta.noindex ? null : SITE + pathname);
    setMeta('meta[name="robots"]', "name", "robots", meta.noindex ? "noindex" : null);
  }, [pathname]);

  return null;
}
