"use client";

import { useEffect } from "react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

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
