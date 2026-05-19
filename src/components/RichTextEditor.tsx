"use client";

import { useEffect, useRef } from "react";

function exec(command: string, value?: string) {
  document.execCommand(command, false, value);
}

export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder,
}: {
  /** Use with a separate <label htmlFor={id}> — do not wrap this component in <label> (toolbar buttons would steal focus). */
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  /** HTML last pushed to the parent — avoids resetting the field while typing. */
  const lastEmittedRef = useRef(value);

  function isEditing() {
    const el = ref.current;
    if (!el) return false;
    const active = document.activeElement;
    return active === el || (active instanceof Node && el.contains(active));
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Do not rewrite DOM while the user is editing; that steals focus (often to the Bold button).
    if (isEditing()) return;
    if (value === lastEmittedRef.current) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value;
    }
    lastEmittedRef.current = value;
  }, [value]);

  function sync() {
    const el = ref.current;
    if (!el) return;
    const html = el.innerHTML;
    lastEmittedRef.current = html;
    onChange(html);
  }

  function runCommand(command: string, commandValue?: string) {
    ref.current?.focus();
    exec(command, commandValue);
    sync();
  }

  function insertImageFromFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      ref.current?.focus();
      exec("insertHTML", `<img src="${String(reader.result)}" alt="" style="max-width:100%;height:auto;border-radius:8px;" />`);
      sync();
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        <button type="button" tabIndex={-1} className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]" onMouseDown={(e) => { e.preventDefault(); runCommand("bold"); }}>
          B
        </button>
        <button type="button" tabIndex={-1} className="rounded border border-[var(--border)] px-2 py-1 text-xs italic hover:border-[var(--accent)]" onMouseDown={(e) => { e.preventDefault(); runCommand("italic"); }}>
          I
        </button>
        <button type="button" tabIndex={-1} className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]" onMouseDown={(e) => { e.preventDefault(); runCommand("underline"); }}>
          U
        </button>
        <button type="button" tabIndex={-1} className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]" onMouseDown={(e) => { e.preventDefault(); runCommand("formatBlock", "h2"); }}>
          H2
        </button>
        <button type="button" tabIndex={-1} className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]" onMouseDown={(e) => { e.preventDefault(); fileRef.current?.click(); }}>
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
        id={id}
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline="true"
        suppressContentEditableWarning
        onInput={sync}
        onBlur={sync}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            runCommand("insertHTML", "<br/>");
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

