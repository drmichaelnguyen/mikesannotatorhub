"use client";

import { useEffect } from "react";

/** Best-effort intent telemetry. Never collect field values or visible text. */
export function ActionTracker() {
  useEffect(() => {
    const changed = new WeakSet<Element>();
    let lastInvalid = 0;
    function send(event: string, target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return;
      const field = target.getAttribute("name") || target.id || "";
      // Exclude free-text identifiers and all authentication fields.
      if (!/^[a-zA-Z0-9_-]{0,100}$/.test(field) || /password|secret|token/i.test(field)) return;
      void fetch("/api/action-log", {
        method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
        body: JSON.stringify({ event, page: window.location.pathname, field }),
      }).catch(() => {});
    }
    const submit = (e: Event) => send("form_submit", e.target);
    const change = (e: Event) => { if (e.target instanceof Element) changed.add(e.target); };
    const blur = (e: Event) => {
      if (e.target instanceof Element && changed.has(e.target)) {
        changed.delete(e.target);
        send("field_changed", e.target);
      }
    };
    const invalid = (e: Event) => {
      if (Date.now() - lastInvalid < 1000) return;
      lastInvalid = Date.now();
      send("validation_blocked", e.target);
    };
    document.addEventListener("submit", submit, true);
    document.addEventListener("change", change, true);
    document.addEventListener("blur", blur, true);
    document.addEventListener("invalid", invalid, true);
    return () => {
      document.removeEventListener("submit", submit, true);
      document.removeEventListener("change", change, true);
      document.removeEventListener("blur", blur, true);
      document.removeEventListener("invalid", invalid, true);
    };
  }, []);
  return null;
}
