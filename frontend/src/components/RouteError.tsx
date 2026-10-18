import { useEffect } from "react";
import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom";
import { isStaleChunkError, reloadOnceForNewVersion } from "./staleChunk";
import { reportError } from "../api/reportError";
import shared from "../pages/StatusPage.module.scss";

// Shown instead of a page (or the whole layout) when rendering throws or a
// route fails to load, so visitors get a way out instead of a blank screen.
export function RouteError() {
  const error = useRouteError();
  const stale = isStaleChunkError(error);

  useEffect(() => {
    console.error(error);
    // After a deploy, an open tab may ask for page code that no longer exists.
    // A reload fetches the new version; reloadOnce stops it looping.
    if (stale) reloadOnceForNewVersion();
    // A 404 page is not a crash; anything else that reaches here is.
    else if (!isRouteErrorResponse(error)) reportError("render", error);
  }, [error, stale]);

  const status = isRouteErrorResponse(error) ? error.status : null;
  const detail = import.meta.env.DEV && error instanceof Error ? error.message : null;

  return (
    <div className={shared.page} role="alert">
      <span className={shared.code}>{status ?? "Oops"}</span>
      <h1 className={shared.title}>{stale ? "A new version is out." : "Something went wrong."}</h1>
      <p className={shared.body}>
        {stale
          ? "ADO was updated while this page was open. Reload to get the latest version."
          : "This page hit an unexpected error. Reloading usually fixes it; if it keeps happening, let us know on Discord."}
      </p>
      {detail && <pre className={shared.body}>{detail}</pre>}
      <div className={shared.actions}>
        <button className={shared.primary} onClick={() => window.location.reload()}>Reload</button>
        <Link to="/" className={shared.secondary} reloadDocument>Go home</Link>
      </div>
    </div>
  );
}
