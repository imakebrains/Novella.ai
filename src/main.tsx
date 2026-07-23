import { Buffer } from "buffer";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { installDevtools } from "./devtools";
import { bootPersonalization } from "./ui/personalize";
import { pluginHost } from "./plugins/runtime";
import { ollamaStreamingProvider } from "./plugins/providers/ollama";
import { openAICompatibleProvider } from "./plugins/providers/openaiCompatible";
import { anthropicProvider } from "./plugins/providers/anthropic";
import "./ui/theme.css";
import "./ui/app.css";

// gray-matter parses YAML through Node's Buffer; the browser needs it present
// before any vault code runs. Harmless under Tauri, required on the web build.
const g = globalThis as unknown as { Buffer?: typeof Buffer };
g.Buffer ??= Buffer;

// Register built-in plugins. Ollama is on by default because it costs
// nothing and needs no key; paid providers stay opt-in (task #12).
pluginHost.register(ollamaStreamingProvider);
void pluginHost.enable(ollamaStreamingProvider.id);

// Paid providers are registered but off by default — they need a key, and
// nothing should reach the network until the writer says so.
pluginHost.register(anthropicProvider);
pluginHost.register(openAICompatibleProvider);

// Dev-only; the bundler drops this entirely in production builds.
installDevtools();

// Saved accent/font/size overrides, before first paint.
bootPersonalization();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
