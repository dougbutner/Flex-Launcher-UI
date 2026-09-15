import { useCallback, useEffect, useRef, useState } from "react";

function atTop() {
  return window.scrollY < 12;
}

function atBottom() {
  return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 48;
}

export function useTetraChrome() {
  const [topOpen, setTopOpen] = useState(true);
  const [footerOpen, setFooterOpen] = useState(false);
  const pinnedFooter = useRef(false);
  const lastY = useRef(typeof window === "undefined" ? 0 : window.scrollY);

  const sync = useCallback(() => {
    const y = window.scrollY;
    const dy = y - lastY.current;
    lastY.current = y;

    if (atTop()) {
      setTopOpen(true);
    } else if (dy > 8) {
      setTopOpen(false);
    }

    if (atBottom()) {
      setFooterOpen(true);
    } else if (!pinnedFooter.current) {
      setFooterOpen(false);
    }
  }, []);

  useEffect(() => {
    lastY.current = window.scrollY;
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    sync();
    return () => {
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [sync]);

  const expandTop = () => {
    setTopOpen(true);
  };

  const toggleFooter = () => {
    if (footerOpen && !atBottom()) {
      pinnedFooter.current = false;
      setFooterOpen(false);
      return;
    }
    pinnedFooter.current = true;
    setFooterOpen(true);
  };

  return { topOpen, footerOpen, expandTop, toggleFooter, sync };
}
