import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { WalletProvider } from "@/hooks/useWallet";
import { Layout } from "@/components/Layout";
import { appendWharfDialogElement } from "@/services/wharfSessionKit";
import Launch from "./pages/Launch.tsx";
import Leaderboard from "./pages/Leaderboard.tsx";
import Reflections from "./pages/Reflections.tsx";
import Portfolio from "./pages/Portfolio.tsx";
import NotFound from "./pages/NotFound.tsx";

export default function App() {
  useEffect(() => {
    appendWharfDialogElement();
  }, []);

  return (
    <WalletProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Launch />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/reflections" element={<Reflections />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </WalletProvider>
  );
}
