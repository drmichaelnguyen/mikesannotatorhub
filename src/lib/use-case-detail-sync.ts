"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useSearchParams } from "next/navigation";
import {
  OPEN_CASE_DETAIL_EVENT,
  readCaseIdFromBrowser,
} from "@/lib/case-detail-url";

/**
 * Sync `detailId` when the URL `case` param changes (deep links, Next `<Link>` nav).
 * Does not depend on `detailId` — avoids an extra render on open/close via replaceState.
 */
export function useCaseDetailUrlState(
  setDetailId: Dispatch<SetStateAction<string | null>>,
  isValidCase: (caseDbId: string) => boolean,
) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const caseFromUrl = readCaseIdFromBrowser();
    if (!caseFromUrl) {
      setDetailId((current) => (current === null ? current : null));
      return;
    }
    if (isValidCase(caseFromUrl)) {
      setDetailId((current) => (current === caseFromUrl ? current : caseFromUrl));
    }
  }, [searchParams, isValidCase, setDetailId]);
}

/** Hide the drawer immediately, then unmount the heavy panel on the next frame. */
export function useDeferredCaseDetailClose() {
  const [isClosing, setIsClosing] = useState(false);
  const rafRef = useRef<number | null>(null);

  const cancelScheduledUnmount = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsClosing(false);
  }, []);

  const scheduleUnmount = useCallback((onUnmount: () => void) => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    setIsClosing(true);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setIsClosing(false);
      onUnmount();
    });
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  return { isClosing, scheduleUnmount, cancelScheduledUnmount };
}

/** Sync drawer state with notification clicks and browser back/forward. */
export function useCaseDetailSync(
  isValidCase: (caseDbId: string) => boolean,
  onOpen: (caseDbId: string) => void,
  onClose: () => void,
) {
  const isValidRef = useRef(isValidCase);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  isValidRef.current = isValidCase;
  onOpenRef.current = onOpen;
  onCloseRef.current = onClose;

  useEffect(() => {
    function onOpenEvent(e: Event) {
      const caseDbId = (e as CustomEvent<{ caseDbId: string }>).detail?.caseDbId;
      if (caseDbId && isValidRef.current(caseDbId)) onOpenRef.current(caseDbId);
    }
    window.addEventListener(OPEN_CASE_DETAIL_EVENT, onOpenEvent);
    return () => window.removeEventListener(OPEN_CASE_DETAIL_EVENT, onOpenEvent);
  }, []);

  useEffect(() => {
    function onPopState() {
      const caseDbId = readCaseIdFromBrowser();
      if (!caseDbId) {
        onCloseRef.current();
        return;
      }
      if (isValidRef.current(caseDbId)) onOpenRef.current(caseDbId);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
}
