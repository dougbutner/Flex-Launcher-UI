import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { preloadProtonWebSdk } from "@/services/protonWebSdk";

preloadProtonWebSdk();

createRoot(document.getElementById("root")!).render(<App />);
