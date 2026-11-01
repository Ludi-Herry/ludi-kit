import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { generatedProjectPages } from "../generated/pages";

const Page = generatedProjectPages[0].component;
const root = document.getElementById("root");

if (!root) throw new Error("Preview root is missing");

createRoot(root).render(
  <StrictMode>
    <Page />
  </StrictMode>
);
