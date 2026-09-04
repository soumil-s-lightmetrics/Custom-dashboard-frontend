import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

// react-grid-layout's own CSS must load before our overrides, or the drag and
// resize handles silently don't render.
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/grid.css";
import "./screens/PersonaScreen.css";
import "./screens/BuilderScreen.css";
import "./components/chat/ChatPanel.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
