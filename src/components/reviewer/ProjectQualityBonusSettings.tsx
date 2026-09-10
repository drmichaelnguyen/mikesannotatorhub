"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProjectQualityBonusAction } from "@/app/actions/settings";
import { DEFAULT_FIVE_STAR_BONUS_PERCENT, isValidFiveStarBonusPercent } from "@/lib/project-quality-bonus";
import type { Lang } from "@/lib/i18n";

type ProjectBonus = { project: string; percent: number };

export function ProjectQualityBonusSettings({ lang, settings, onSaved }: { lang: Lang; settings: ProjectBonus[]; onSaved: (rows: ProjectBonus[]) => void }) {
  const vi = lang === "vi";
  const router = useRouter();
  const [rows, setRows] = useState(settings);
  const [project, setProject] = useState(settings[0]?.project ?? "");
  const [percent, setPercent] = useState(String(settings[0]?.percent ?? DEFAULT_FIVE_STAR_BONUS_PERCENT));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  function selectProject(value: string) {
    setProject(value);
    setPercent(String(rows.find(row => row.project === value.trim())?.percent ?? DEFAULT_FIVE_STAR_BONUS_PERCENT));
    setMessage(null);
  }

  return (
    <section className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-sm text-[var(--muted)]">
        {vi
          ? "Đặt tỷ lệ thưởng 5★ cho từng Dự án (ví dụ BC2, BC3), tính trên thù lao tối thiểu. Mặc định 15%; đặt 0% để tắt thưởng. Có thể sửa tỷ lệ theo phạm vi khi tạo ca. Không đổi tỷ lệ đã lưu trên ca hoặc khoản đã duyệt; ca cũ chưa có tỷ lệ riêng dùng mặc định này. Mức trừ khi nộp lại vẫn áp dụng."
          : "Set the 5★ bonus for each Project (for example BC2 or BC3), as a percentage of minimum case pay. The default is 15%; set 0% to disable the bonus. New cases can override this default for their scope during creation. Saved case percentages and approved payouts stay unchanged; older cases without a saved percentage use this default. Resubmission deductions still apply."}
      </p>
      <form onSubmit={event => {
        event.preventDefault();
        setMessage(null);
        const data = new FormData(event.currentTarget);
        start(async () => {
          try {
            const result = await updateProjectQualityBonusAction(data);
            if (!result.ok) {
              setError(true);
              setMessage(result.error === "invalid"
                ? (vi ? "Nhập dự án và tỷ lệ từ 0 đến 100%, tối đa hai chữ số thập phân." : "Enter a project and a percentage from 0 to 100, with at most two decimal places.")
                : (vi ? "Không thể lưu. Vui lòng thử lại." : "Could not save the bonus. Please try again."));
              return;
            }
            const updated = [...rows.filter(row => row.project !== result.project), { project: result.project, percent: result.percent }].sort((a, b) => a.project.localeCompare(b.project));
            setRows(updated);
            onSaved(updated);
            setError(false);
            setMessage(vi ? `Đã lưu thưởng 5★ cho ${result.project}: ${result.percent}%.` : `Saved ${result.project} 5★ bonus: ${result.percent}%.`);
            router.refresh();
          } catch {
            setError(true);
            setMessage(vi ? "Không thể lưu. Kiểm tra kết nối và thử lại." : "Could not save. Check your connection and try again.");
          }
        });
      }} className="space-y-3">
        <fieldset disabled={pending} className="flex flex-wrap items-end gap-3 disabled:opacity-60">
          <label className="block text-sm">
            {vi ? "Dự án" : "Project"}
            <input name="project" list="quality-bonus-projects" required maxLength={200} value={project} onChange={event => selectProject(event.target.value)} className="mt-1 block rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2" />
            <datalist id="quality-bonus-projects">{rows.map(row => <option key={row.project} value={row.project} />)}</datalist>
          </label>
          <label className="block text-sm">
            {vi ? "Thưởng 5★ (%)" : "5★ bonus (%)"}
            <input name="percent" type="number" required min={0} max={100} step="0.01" value={percent} onChange={event => { setPercent(event.target.value); setMessage(null); }} className="mt-1 block w-36 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2" />
          </label>
          <button type="submit" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white">{pending ? (vi ? "Đang lưu…" : "Saving…") : (vi ? "Lưu tỷ lệ thưởng" : "Save bonus percentage")}</button>
        </fieldset>
        {percent.trim() && isValidFiveStarBonusPercent(Number(percent)) && <p className="text-xs text-[var(--muted)]">{vi ? `Ví dụ: thù lao tối thiểu 100 + thưởng 5★ ${Number(percent)} (trước khoản trừ khi nộp lại).` : `Example: minimum case pay of 100 + a 5★ bonus of ${Number(percent)} (before any resubmission deduction).`}</p>}
        {message && <p role={error ? "alert" : "status"} className={`text-sm ${error ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>{message}</p>}
      </form>
      {rows.length > 0 && <div className="flex flex-wrap gap-2">{rows.map(row => <button key={row.project} type="button" disabled={pending} onClick={() => selectProject(row.project)} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">{row.project}: {row.percent}%</button>)}</div>}
    </section>
  );
}
