"use client";

import { usePathname, useRouter } from "next/navigation";

export type Filter = { name: string; label: string; value: string; options: { value: string; label: string }[] };

// Dropdowns that keep their choice in the URL (?course=..&week=..), so the server page filters and
// Back/refresh keep the view.
export function Filters({ filters }: { filters: Filter[] }) {
  const router = useRouter();
  const path = usePathname();
  const set = (name: string, value: string) => {
    const q = new URLSearchParams(filters.filter((f) => f.value).map((f) => [f.name, f.value]));
    if (value) q.set(name, value);
    else q.delete(name);
    router.replace(q.size ? `${path}?${q}` : path, { scroll: false });
  };
  return (
    <div className="filters" role="search" aria-label="Filter">
      {filters.filter((f) => f.options.length || f.value).map((f) => (
        <label key={f.name} className="filter" data-on={f.value ? "" : undefined}>
          <span className="sr-only">{f.label}</span>
          <select value={f.value} onChange={(e) => set(f.name, e.target.value)}>
            <option value="">All {f.label.toLowerCase()}s</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      {filters.some((f) => f.value) && (
        <button type="button" className="filter-clear" onClick={() => router.replace(path, { scroll: false })}>
          Clear filters
        </button>
      )}
    </div>
  );
}
