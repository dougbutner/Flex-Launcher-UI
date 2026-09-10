import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { WalletProvider } from "@/hooks/useWallet";
import { Layout } from "@/components/Layout";
import { appendWharfDialogElement } from "@/services/wharfSessionKit";
import Home from "./pages/Home.tsx";
import Launch from "./pages/Launch.tsx";
import Leaderboard from "./pages/Leaderboard.tsx";
import Reflections from "./pages/Reflections.tsx";
import Portfolio from "./pages/Portfolio.tsx";
import Token from "./pages/Token.tsx";
import Preview from "./pages/Preview.tsx";
import Admin from "./pages/Admin.tsx";
import Manager from "./pages/Manager.tsx";
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
            <Route path="/" element={<Home />} />
            <Route path="/launch" element={<Launch />} />
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
