import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { WalletProvider } from "@/hooks/useWallet";
import { Layout } from "@/components/Layout";
import { appendWharfDialogElement } from "@/services/wharfSessionKit";
import Admin from "./pages/Admin.tsx";
import Events from "./pages/Events.tsx";
import Home from "./pages/Home.tsx";
import Insiders from "./pages/Insiders.tsx";
import Launch from "./pages/Launch.tsx";
import Leaderboard from "./pages/Leaderboard.tsx";
import Reflections from "./pages/Reflections.tsx";
import Portfolio from "./pages/Portfolio.tsx";
import Token from "./pages/Token.tsx";
import Preview from "./pages/Preview.tsx";
import Manager from "./pages/Manager.tsx";
import NotFound from "./pages/NotFound.tsx";

export default function App() {
  useEffect(() => {
    appendWharfDialogElement();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    let scrollTimer = 0;
    const onScroll = () => {
      root.classList.add("scrolling");
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => root.classList.remove("scrolling"), 180);
    };
    const onPointerMove = (event: PointerEvent) => {
      const gutter = 14;
      const onWindowBar =
        event.clientX >= window.innerWidth - gutter || event.clientY >= window.innerHeight - gutter;
      let onNested = false;
      let el: Element | null = event.target instanceof Element ? event.target : null;
      while (el && el !== document.body) {
        const style = window.getComputedStyle(el);
        const canY =
          (style.overflowY === "auto" || style.overflowY === "scroll")
          && el.scrollHeight > el.clientHeight + 1;
        const canX =
          (style.overflowX === "auto" || style.overflowX === "scroll")
          && el.scrollWidth > el.clientWidth + 1;
        if (canY || canX) {
          const rect = el.getBoundingClientRect();
          onNested =
            (canY && event.clientX >= rect.right - gutter)
            || (canX && event.clientY >= rect.bottom - gutter);
          break;
        }
        el = el.parentElement;
      }
      root.classList.toggle("scrollbar-element", onWindowBar || onNested);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.clearTimeout(scrollTimer);
      root.classList.remove("scrolling", "scrollbar-element");
    };
  }, []);

  return (
    <WalletProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/launch" element={<Launch />} />
            <Route path="/events" element={<Events />} />
            <Route path="/insiders" element={<Insiders />} />
            <Route path="/insiders/:contract/:symbol" element={<Insiders />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/reflections" element={<Reflections />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/token/:contract/:symbol" element={<Token />} />
            <Route path="/preview" element={<Preview />} />
            <Route path="/manager" element={<Manager />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </WalletProvider>
  );
}
