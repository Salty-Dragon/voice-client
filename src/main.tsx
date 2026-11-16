import { createRoot } from "react-dom/client";
import App from "./App";
import { startShell } from "./shell";
import { Boot } from "./ui/Boot";
import { TipLayer } from "./ui/tips";
import "./style.css";

startShell();

createRoot(document.getElementById("root")!).render(
  <>
    <Boot>
      <App />
    </Boot>
    <TipLayer />
  </>,
);

// Space and the arrow keys scroll the page by default, which is distracting
// when they are bound to a net. Typing in a text field is left alone.
window.addEventListener("keydown", (e) => {
  const el = e.target as HTMLElement | null;
  const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
  if (!typing && [" ", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key)) {
    e.preventDefault();
  }
});
