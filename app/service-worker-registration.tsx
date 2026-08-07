"use client";

import { useEffect } from "react";

const basePath = process.env.NODE_ENV === "production" ? "/Local-Wave-" : "";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    window.addEventListener("load", () => {
      void navigator.serviceWorker.register(`${basePath}/sw.js`, {
        scope: `${basePath || "/"}/`
      });
    });
  }, []);

  return null;
}
