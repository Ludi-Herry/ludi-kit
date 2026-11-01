import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TianshuApp } from "../../../app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TianshuApp />
  </StrictMode>
);
