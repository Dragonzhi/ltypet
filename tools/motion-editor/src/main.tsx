import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

const rootElement = document.getElementById("root");

function renderStartupError(error: unknown) {
  if (!rootElement) return;
  const message = error instanceof Error ? error.message : String(error);
  rootElement.replaceChildren();
  const panel = document.createElement("main");
  panel.setAttribute("role", "alert");
  panel.style.cssText = "margin:48px;padding:24px;border:1px solid #ef4444;border-radius:8px;color:#fecaca;background:#450a0a;font:14px/1.6 system-ui";
  const title = document.createElement("h1");
  title.textContent = "Animation Studio 启动失败";
  const detail = document.createElement("pre");
  detail.style.whiteSpace = "pre-wrap";
  detail.textContent = message;
  panel.append(title, detail);
  rootElement.append(panel);
}

window.addEventListener("error", (event) => renderStartupError(event.error ?? event.message));
window.addEventListener("unhandledrejection", (event) => renderStartupError(event.reason));

void import("./App")
  .then(({ default: App }) => {
    if (!rootElement) throw new Error("缺少 #root 容器");
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  })
  .catch(renderStartupError);
