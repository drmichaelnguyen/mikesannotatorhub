"use client";

export function RichTextContent({
  html,
  className = "",
}: {
  html: string;
  className?: string;
}) {
  return (
    <div
      className={`rich-text-content prose prose-sm max-w-none text-[var(--text)] prose-headings:font-semibold prose-p:my-2 prose-img:my-3 prose-img:max-w-full prose-img:rounded-md ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
