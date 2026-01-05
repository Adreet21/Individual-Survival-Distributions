/**
 * ScrollToTop
 * Scrolls to top of page on route change (navigation between pages).
 * This component should be placed inside the Router.
 */

import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Scroll to top instantly on page change
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
