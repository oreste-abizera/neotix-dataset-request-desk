import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { migrateLegacyHash } from "./app/legacy-hash";
import { Providers } from "./app/providers";
import "./styles/index.css";

migrateLegacyHash();

const root = document.getElementById("root");
if (!root) throw new Error("#root element is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>,
);
