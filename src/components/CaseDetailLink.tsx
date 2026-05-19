"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export type CaseDetailLinkProps = {
  caseDbId: string;
  children: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  /** Adjust query before `case` is set (e.g. `p.delete("annotators")` on reviewer). */
  amendSearch?: (params: URLSearchParams) => void;
};

function buildCaseDetailHref(
  pathname: string,
  search: string,
  caseDbId: string,
  amendSearch?: (params: URLSearchParams) => void,
) {
  const params = new URLSearchParams(search);
  amendSearch?.(params);
  params.set("case", caseDbId);
  const q = params.toString();
  return q ? `${pathname}?${q}` : pathname;
}

const defaultClassName = "text-[var(--accent)] underline-offset-2 hover:underline";

/**
 * Deep-link to a case via `?case=`. Href is applied after mount so SSR markup
 * (no search params in static shell) matches the client's first paint.
 */
export function CaseDetailLink({ caseDbId, children, className, onClick, amendSearch }: CaseDetailLinkProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [href, setHref] = useState<string | null>(null);
  const cn = className ?? defaultClassName;

  useEffect(() => {
    setHref(buildCaseDetailHref(pathname, searchParams.toString(), caseDbId, amendSearch));
  }, [pathname, searchParams, caseDbId, amendSearch]);

  if (href === null) {
    return <span className={cn}>{children}</span>;
  }

  return (
    <Link href={href} scroll={false} className={cn} onClick={onClick}>
      {children}
    </Link>
  );
}
