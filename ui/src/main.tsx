import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/hall.css";
import "./styles/plan.css";
import "./styles/floor.css";
import "./styles/signoff.css";
import "./styles/v2.css";
import "./styles/nav.css";
import "./styles/hero.css";

void (new URLSearchParams(location.search).has("review") ? import("./review/harness").then((m) => m.mount(document.getElementById("root")!)) : createRoot(document.getElementById("root")!).render(<App />));
