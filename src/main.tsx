// Two windows share this page: the app itself, and the compact strip. The
// strip must never start the voice engine or the key capture (the server
// allows one voice connection per account), so each side is loaded on its own.
import "./style.css";

type Internals = { metadata?: { currentWindow?: { label?: string } } };
const label = (window as unknown as { __TAURI_INTERNALS__?: Internals }).__TAURI_INTERNALS__?.metadata?.currentWindow?.label;

if (label === "strip") void import("./strip/main");
else void import("./main-app");
