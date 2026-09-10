"use client";

import { useEffect, useState } from "react";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

const DEFAULT_INPUT_CLASS =
  "mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2";

const ADD_NEW = "__add_new__";

type SharedFieldProps = {
  lang: Lang;
  idPrefix: string;
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  required?: boolean;
  inputClassName?: string;
  name?: string;
};

function ChooseOrCreateField({
  lang,
  idPrefix,
  value,
  onChange,
  options = [],
  required = false,
  inputClassName = DEFAULT_INPUT_CLASS,
  name,
  labelKey,
  hintKey,
  addNewKey,
  newPlaceholderKey,
}: SharedFieldProps & {
  labelKey: DictKey;
  hintKey: DictKey;
  addNewKey: DictKey;
  newPlaceholderKey: DictKey;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const selectId = `${idPrefix}-select`;
  const newInputId = `${idPrefix}-new`;
  const known = Boolean(value) && options.includes(value);
  const [addingNew, setAddingNew] = useState(() => !known && (value !== "" || options.length === 0));

  useEffect(() => {
    if (known) setAddingNew(false);
  }, [known]);

  const selectValue = addingNew ? ADD_NEW : value;

  return (
    <div className="md:col-span-2">
      <label htmlFor={selectId} className="text-sm text-[var(--muted)]">
        {tk(labelKey)}
      </label>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <select
        id={selectId}
        required={required && !addingNew}
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value;
          if (next === ADD_NEW) {
            setAddingNew(true);
            if (known || !value) onChange("");
            return;
          }
          setAddingNew(false);
          onChange(next);
        }}
        className={inputClassName}
      >
        <option value="">{tk("case_choose")}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
        <option value={ADD_NEW}>{tk(addNewKey)}</option>
      </select>
      {addingNew ? (
        <input
          id={newInputId}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={tk(newPlaceholderKey)}
          className={`${inputClassName} mt-2`}
          autoFocus
        />
      ) : null}
      <p className="mt-1 text-xs text-[var(--muted)]">{tk(hintKey)}</p>
    </div>
  );
}

/** Campaign/folder project (BC2, BC3, …) — choose existing or add new. */
export function CaseProjectField({
  lang,
  idPrefix,
  value,
  onChange,
  options = [],
  required = false,
  inputClassName = DEFAULT_INPUT_CLASS,
  name,
}: SharedFieldProps) {
  return (
    <ChooseOrCreateField
      lang={lang}
      idPrefix={`${idPrefix}-project`}
      value={value}
      onChange={onChange}
      options={options}
      required={required}
      inputClassName={inputClassName}
      name={name}
      labelKey="case_project"
      hintKey="case_project_hint"
      addNewKey="case_project_add_new"
      newPlaceholderKey="case_project_new_placeholder"
    />
  );
}

/** Shared RedbrickAI project choose-or-create field (create / edit / batch). */
export function CaseRedbrickProjectField({
  lang,
  idPrefix,
  value,
  onChange,
  options = [],
  required = false,
  inputClassName = DEFAULT_INPUT_CLASS,
  name,
}: SharedFieldProps) {
  return (
    <ChooseOrCreateField
      lang={lang}
      idPrefix={`${idPrefix}-redbrick`}
      value={value}
      onChange={onChange}
      options={options}
      required={required}
      inputClassName={inputClassName}
      name={name}
      labelKey="case_redbrick"
      hintKey="case_redbrick_hint"
      addNewKey="case_redbrick_add_new"
      newPlaceholderKey="case_redbrick_new_placeholder"
    />
  );
}

/** Shared scope-of-work choose-or-create field (create / edit / batch). */
export function CaseScopeOfWorkField({
  lang,
  idPrefix,
  value,
  onChange,
  options = [],
  required = false,
  inputClassName = DEFAULT_INPUT_CLASS,
  name,
}: SharedFieldProps) {
  return (
    <ChooseOrCreateField
      lang={lang}
      idPrefix={`${idPrefix}-scope`}
      value={value}
      onChange={onChange}
      options={options}
      required={required}
      inputClassName={inputClassName}
      name={name}
      labelKey="case_scope"
      hintKey="case_scope_hint"
      addNewKey="case_scope_add_new"
      newPlaceholderKey="case_scope_new_placeholder"
    />
  );
}
