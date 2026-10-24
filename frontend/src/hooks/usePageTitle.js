/**
 * @module hooks/usePageTitle
 * @description Sets `document.title` on mount and restores the default on unmount.
 *
 * @param {string} title - Page-specific title (e.g. "Dashboard").
 *                         Rendered as "title — AI Powered QA Platform".
 *
 * @example
 * usePageTitle("Dashboard");
 * // document.title → "Dashboard — AI Powered QA Platform"
 */

import { useEffect } from "react";

const APP_NAME = "AI Powered QA Platform";

export default function usePageTitle(title) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} — ${APP_NAME}` : APP_NAME;
    return () => { document.title = prev; };
  }, [title]);
}
