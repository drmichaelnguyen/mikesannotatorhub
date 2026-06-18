"use client";

import { useEffect, useState } from "react";
import { getGuideContentAction } from "@/app/actions/cases";

export function useGuideHtml(guideId: string | undefined) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!guideId) {
      setHtml("");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getGuideContentAction(guideId)
      .then((content) => {
        if (!cancelled) setHtml(content);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [guideId]);

  return { html, loading };
}
