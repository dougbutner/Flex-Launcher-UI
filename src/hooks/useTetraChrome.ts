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
  const pinnedTop = useRef(false);
  const pinnedFooter = useRef(false);

  const sync = useCallback(() => {
    if (atTop()) {
      pinnedTop.current = false;
      setTopOpen(true);
    } else if (!pinnedTop.current) {
      setTopOpen(false);
    }

    if (atBottom()) {
      setFooterOpen(true);
    } else if (!pinnedFooter.current) {
      setFooterOpen(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    sync();
    return () => {
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [sync]);

  const expandTop = () => {
    pinnedTop.current = true;
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
