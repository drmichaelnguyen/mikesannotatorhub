"use client";

import { useEffect, useRef } from "react";

function exec(command: string, value?: string) {
  document.execCommand(command, false, value);
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value;
    }
  }, [value]);

  function sync() {
    const el = ref.current;
    if (!el) return;
    onChange(el.innerHTML);
  }

  function insertImageFromFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      exec("insertHTML", `<img src="${String(reader.result)}" alt="" style="max-width:100%;height:auto;border-radius:8px;" />`);
      sync();
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        <button type="button" className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]" onMouseDown={(e) => { e.preventDefault(); exec("bold"); sync(); }}>
          B
        </button>
        <button type="button" className="rounded border border-[var(--border)] px-2 py-1 text-xs italic hover:border-[var(--accent)]" onMouseDown={(e) => { e.preventDefault(); exec("italic"); sync(); }}>
          I
        </button>
        <button type="button" className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]" onMouseDown={(e) => { e.preventDefault(); exec("underline"); sync(); }}>
          U
        </button>
        <button type="button" className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]" onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "h2"); sync(); }}>
          H2
        </button>
        <button type="button" className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]" onMouseDown={(e) => { e.preventDefault(); fileRef.current?.click(); }}>
          Image
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) insertImageFromFile(file);
            e.target.value = "";
          }}
        />
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        onBlur={sync}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            exec("insertHTML", "<br/>");
            sync();
          }
        }}
        className="min-h-40 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none"
        data-placeholder={placeholder}
      />
      <style jsx>{`
        [contenteditable][data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: var(--muted);
        }
      `}</style>
    </div>
  );
}

