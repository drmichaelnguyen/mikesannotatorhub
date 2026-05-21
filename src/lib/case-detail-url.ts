export const OPEN_CASE_DETAIL_EVENT = "ah:open-case-detail";

/** Update the query string without a Next.js navigation (avoids full page RSC refetch). */
export function replaceSearchInBrowser(
  pathname: string,
  currentSearch: string,
  mutate: (params: URLSearchParams) => void,
) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(currentSearch);
  mutate(params);
  const query = params.toString();
  const url = query ? `${pathname}?${query}` : pathname;
  window.history.replaceState(window.history.state, "", url);
}

/** Update `?case=` in the address bar without refetching the page. */
export function replaceCaseQueryInBrowser(
  pathname: string,
  currentSearch: string,
  caseDbId: string | null,
  amendSearch?: (params: URLSearchParams) => void,
) {
  replaceSearchInBrowser(pathname, currentSearch, (params) => {
    amendSearch?.(params);
    if (caseDbId) params.set("case", caseDbId);
    else params.delete("case");
  });
}

export function readCaseIdFromBrowser(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("case");
}

/** Open a case drawer from anywhere on the workboard page (e.g. notifications). */
export function dispatchOpenCaseDetail(caseDbId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(OPEN_CASE_DETAIL_EVENT, { detail: { caseDbId } }),
  );
}
