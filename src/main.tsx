import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";

// Für die Einzeldatei-Variante (scripts/build-artifact.mjs) ohne Service Worker.
if (!import.meta.env.VITE_NO_SW) registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
