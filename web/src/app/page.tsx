"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClassifiedCourse, ClassifiedPayload } from "./types";
import { IMPACT_AREAS, PIT_CATEGORY_LABELS } from "./taxonomy";

type SortKey = "code" | "title" | "department" | "confidence" | "areas";
type Visibility = "pit_only" | "all";

const DATA_URL = "/classified.json";

export default function Home() {
  const [payload, setPayload] = useState<ClassifiedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedAreas, setSelectedAreas] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedDepts, setSelectedDepts] = useState<Set<string>>(new Set());
  const [deptFilter, setDeptFilter] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("pit_only");
  const [sortKey, setSortKey] = useState<SortKey>("areas");
  const [hideNotOffered, setHideNotOffered] = useState(true);
  const [activeCourse, setActiveCourse] = useState<ClassifiedCourse | null>(null);

  useEffect(() => {
    fetch(DATA_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${DATA_URL}: ${r.status}`);
        return r.json();
      })
      .then((d: ClassifiedPayload) => {
        setPayload(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  // Total counts that reflect the offered-this-year filter so the sidebar
  // displays consistent numbers with the visible course list.
  const offeredFilteredAll = useMemo(() => {
    if (!payload) return [];
    return hideNotOffered
      ? payload.results.filter((r) => r.is_offered_this_year)
      : payload.results;
  }, [payload, hideNotOffered]);

  const totalCount = offeredFilteredAll.length;
  const pitCount = offeredFilteredAll.filter((r) => r.verdict.is_pit).length;

  const deptStats = useMemo(() => {
    const counts = new Map<string, { total: number; pit: number; label: string }>();
    for (const r of offeredFilteredAll) {
      const key = r.subject;
      const label = r.academic_org || r.subject;
      const cur = counts.get(key) || { total: 0, pit: 0, label };
      cur.total += 1;
      if (r.verdict.is_pit) cur.pit += 1;
      counts.set(key, cur);
    }
    return Array.from(counts.entries())
      .map(([code, v]) => ({ code, ...v }))
      .filter((d) => d.pit > 0 || visibility === "all")
      .sort((a, b) => b.pit - a.pit || a.code.localeCompare(b.code));
  }, [offeredFilteredAll, visibility]);

  const filtered = useMemo(() => {
    if (!payload) return [];
    const needle = search.trim().toLowerCase();
    return payload.results.filter((r) => {
      if (hideNotOffered && !r.is_offered_this_year) return false;
      if (visibility === "pit_only" && !r.verdict.is_pit) return false;
      if (selectedAreas.size > 0) {
        const hit = r.verdict.impact_areas.some((a) => selectedAreas.has(a));
        if (!hit) return false;
      }
      if (selectedCategories.size > 0) {
        if (!r.verdict.pit_category || !selectedCategories.has(r.verdict.pit_category))
          return false;
      }
      if (selectedDepts.size > 0 && !selectedDepts.has(r.subject)) return false;
      if (needle) {
        const blob = (
          r.full_code +
          " " +
          r.title +
          " " +
          r.description +
          " " +
          r.verdict.reasoning +
          " " +
          r.cross_listed_codes.join(" ")
        ).toLowerCase();
        if (!blob.includes(needle)) return false;
      }
      return true;
    });
  }, [payload, search, selectedAreas, selectedCategories, selectedDepts, visibility, hideNotOffered]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sortKey) {
      case "code":
        return arr.sort((a, b) => a.full_code.localeCompare(b.full_code));
      case "title":
        return arr.sort((a, b) => a.title.localeCompare(b.title));
      case "department":
        return arr.sort(
          (a, b) => a.subject.localeCompare(b.subject) || a.full_code.localeCompare(b.full_code),
        );
      case "confidence":
        return arr.sort((a, b) => b.verdict.confidence - a.verdict.confidence);
      case "areas":
      default:
        return arr.sort(
          (a, b) =>
            b.verdict.impact_areas.length - a.verdict.impact_areas.length ||
            a.full_code.localeCompare(b.full_code),
        );
    }
  }, [filtered, sortKey]);

  const toggleSet = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };

  if (loading) return <LoadingState />;
  if (error)
    return (
      <ErrorState
        message={`Couldn't load classification data. The classifier may not have finished yet — drop classified.json into web/public/. Details: ${error}`}
      />
    );
  if (!payload) return <ErrorState message="No data" />;

  return (
    <div className="flex flex-1 flex-col">
      <Header payload={payload} />
      <div className="flex flex-1 flex-col lg:flex-row max-w-[1600px] w-full mx-auto px-4 lg:px-6 gap-6 py-6">
        <aside className="lg:w-72 lg:flex-shrink-0 space-y-6 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <FilterSection title="Show">
            <RadioGroup
              options={[
                { value: "pit_only", label: `PIT only (${pitCount.toLocaleString()})` },
                { value: "all", label: `All courses (${totalCount.toLocaleString()})` },
              ]}
              value={visibility}
              onChange={(v) => setVisibility(v as Visibility)}
            />
            <label className="flex items-center gap-2 text-sm cursor-pointer mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <input
                type="checkbox"
                checked={hideNotOffered}
                onChange={(e) => setHideNotOffered(e.target.checked)}
              />
              <span>
                Only offered 2025–26
                <span className="text-xs text-zinc-500 ml-1">
                  (hides {(payload.count - payload.results.filter((r) => r.is_offered_this_year).length).toLocaleString()})
                </span>
              </span>
            </label>
          </FilterSection>

          <FilterSection title={`Impact Areas (${selectedAreas.size})`}>
            <div className="space-y-1.5">
              {IMPACT_AREAS.map((a) => (
                <CheckboxRow
                  key={a.name}
                  label={a.name}
                  description={a.description}
                  checked={selectedAreas.has(a.name)}
                  onChange={() => toggleSet(selectedAreas, a.name, setSelectedAreas)}
                />
              ))}
            </div>
            {selectedAreas.size > 0 && (
              <button
                className="text-xs text-blue-600 hover:underline mt-2"
                onClick={() => setSelectedAreas(new Set())}
              >
                Clear all
              </button>
            )}
          </FilterSection>

          <FilterSection title={`PIT Category (${selectedCategories.size})`}>
            <div className="space-y-1.5">
              {Object.entries(PIT_CATEGORY_LABELS).map(([key, v]) => (
                <CheckboxRow
                  key={key}
                  label={v.label}
                  description={v.description}
                  checked={selectedCategories.has(key)}
                  onChange={() =>
                    toggleSet(selectedCategories, key, setSelectedCategories)
                  }
                />
              ))}
            </div>
          </FilterSection>

          <FilterSection title={`Department (${selectedDepts.size})`}>
            <input
              type="text"
              placeholder="Filter departments..."
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="w-full text-sm px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded mb-2 bg-white dark:bg-zinc-900"
            />
            <div className="max-h-72 overflow-y-auto space-y-0.5">
              {deptStats
                .filter(
                  (d) =>
                    !deptFilter ||
                    d.code.toLowerCase().includes(deptFilter.toLowerCase()) ||
                    d.label.toLowerCase().includes(deptFilter.toLowerCase()),
                )
                .map((d) => (
                  <label
                    key={d.code}
                    className="flex items-center gap-2 text-xs cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 px-1 py-0.5 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selectedDepts.has(d.code)}
                      onChange={() => toggleSet(selectedDepts, d.code, setSelectedDepts)}
                    />
                    <span className="flex-1 truncate">{d.code}</span>
                    <span className="text-zinc-500 tabular-nums">
                      {d.pit}
                      {visibility === "all" && (
                        <span className="text-zinc-400">/{d.total}</span>
                      )}
                    </span>
                  </label>
                ))}
            </div>
          </FilterSection>
        </aside>

        <main className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center mb-4">
            <input
              type="search"
              placeholder="Search title, description, course code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm"
            />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm"
            >
              <option value="areas">Most impact areas</option>
              <option value="confidence">Highest confidence</option>
              <option value="code">Course code</option>
              <option value="title">Title</option>
              <option value="department">Department</option>
            </select>
          </div>

          <div className="text-sm text-zinc-500 mb-3">
            {sorted.length.toLocaleString()} of{" "}
            {visibility === "pit_only" ? pitCount.toLocaleString() : totalCount.toLocaleString()}{" "}
            courses
            {hideNotOffered && (
              <span className="text-zinc-400"> (offered 2025–26)</span>
            )}
          </div>

          <div className="space-y-3">
            {sorted.slice(0, 500).map((r) => (
              <CourseCard key={r.course_id} course={r} onClick={() => setActiveCourse(r)} />
            ))}
            {sorted.length > 500 && (
              <div className="text-sm text-zinc-500 text-center py-4">
                Showing first 500 of {sorted.length.toLocaleString()}. Refine filters to see more.
              </div>
            )}
            {sorted.length === 0 && (
              <div className="text-center py-12 text-zinc-500">
                No courses match the current filters.
              </div>
            )}
          </div>
        </main>
      </div>

      {activeCourse && (
        <CourseModal course={activeCourse} onClose={() => setActiveCourse(null)} />
      )}
      <Footer payload={payload} />
    </div>
  );
}

function Header({ payload }: { payload: ClassifiedPayload }) {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-5">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Stanford PIT Class Explorer
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 max-w-3xl">
          Stanford courses ({payload.source_year}) classified as Public Interest Technology — tech for the public good, ethics of technology, civic tech, and more. Built on the{" "}
          <a
            className="underline hover:text-blue-600"
            href="https://haas.stanford.edu"
            target="_blank"
            rel="noreferrer"
          >
            Haas Center for Public Service
          </a>{" "}
          PIT taxonomy.
        </p>
      </div>
    </header>
  );
}

function Footer({ payload }: { payload: ClassifiedPayload }) {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800 mt-12 py-4">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 text-xs text-zinc-500">
        {payload.pit_count.toLocaleString()} of {payload.count.toLocaleString()} courses identified as PIT •
        {" "}{payload.results.filter((r) => r.verdict.is_pit && r.is_offered_this_year).length.toLocaleString()} offered this year •
        classified {new Date(payload.classified_at).toLocaleDateString()} • model {payload.model} •
        source: explorecourses.stanford.edu
      </div>
    </footer>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function RadioGroup({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="radio"
            name="visibility"
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function CheckboxRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      title={description}
      className="flex items-start gap-2 text-sm cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 -mx-1 px-1 py-0.5 rounded"
    >
      <input type="checkbox" checked={checked} onChange={onChange} className="mt-0.5 flex-shrink-0" />
      <span className="leading-tight">{label}</span>
    </label>
  );
}

function CourseCard({
  course,
  onClick,
}: {
  course: ClassifiedCourse;
  onClick: () => void;
}) {
  const v = course.verdict;
  return (
    <button
      onClick={onClick}
      className="text-left w-full p-4 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:border-zinc-400 dark:hover:border-zinc-600 hover:shadow-sm transition"
    >
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="text-sm font-mono text-zinc-500 dark:text-zinc-400">
          {course.full_code}
        </span>
        <div className="text-xs text-zinc-500 whitespace-nowrap flex items-center gap-2">
          {course.is_offered_this_year ? (
            <span className="text-emerald-700 dark:text-emerald-400">
              {course.offered_terms.join(" · ")}
            </span>
          ) : (
            <span className="text-amber-700 dark:text-amber-400">Not offered 2025–26</span>
          )}
          <span>
            {course.units_min === course.units_max
              ? `${course.units_min ?? "?"} units`
              : `${course.units_min ?? "?"}–${course.units_max ?? "?"} units`}
          </span>
        </div>
      </div>
      <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-50 leading-snug mb-2">
        {course.title}
      </h2>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {v.is_pit && v.pit_category && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300">
            {PIT_CATEGORY_LABELS[v.pit_category]?.label || v.pit_category}
          </span>
        )}
        {v.impact_areas.map((a) => (
          <span
            key={a}
            className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
          >
            {a}
          </span>
        ))}
        {!v.is_pit && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-500">
            not PIT (conf {v.confidence.toFixed(2)})
          </span>
        )}
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
        {course.description}
      </p>
    </button>
  );
}

function CourseModal({
  course,
  onClose,
}: {
  course: ClassifiedCourse;
  onClose: () => void;
}) {
  const v = course.verdict;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      role="dialog"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-zinc-950 rounded-t-2xl sm:rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 lg:p-8">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="text-sm font-mono text-zinc-500">{course.full_code}</div>
              <h2 className="text-2xl font-semibold leading-tight mt-1">{course.title}</h2>
              <div className="text-sm text-zinc-500 mt-1">
                {course.academic_org_descr || course.academic_org || course.subject} •{" "}
                {course.units_min === course.units_max
                  ? `${course.units_min} units`
                  : `${course.units_min}–${course.units_max} units`}{" "}
                • {course.grading}
              </div>
              <div className="text-xs mt-1">
                {course.is_offered_this_year ? (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    Offered 2025–26: {course.offered_terms.join(", ")}
                  </span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-400">
                    Not offered in 2025–26
                  </span>
                )}
              </div>
              {course.cross_listed_codes.length > 0 && (
                <div className="text-xs text-zinc-500 mt-1">
                  Cross-listed: {course.cross_listed_codes.join(", ")}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 text-2xl leading-none w-8 h-8 flex items-center justify-center flex-shrink-0"
            >
              ×
            </button>
          </div>

          {v.is_pit && (
            <div className="mb-5 p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 font-medium">
                  {v.pit_category ? PIT_CATEGORY_LABELS[v.pit_category]?.label : "PIT"}
                </span>
                <span className="text-xs text-blue-700 dark:text-blue-400">
                  confidence {v.confidence.toFixed(2)}
                </span>
              </div>
              {v.impact_areas.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {v.impact_areas.map((a) => (
                    <span
                      key={a}
                      className="text-xs px-2 py-0.5 rounded-full bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-300"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-sm text-blue-900 dark:text-blue-200">{v.reasoning}</p>
            </div>
          )}

          {!v.is_pit && (
            <div className="mb-5 p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
              <div className="text-xs text-zinc-500 mb-2">
                Not classified as PIT (confidence {v.confidence.toFixed(2)})
              </div>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">{v.reasoning}</p>
            </div>
          )}

          <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">
            Description
          </h3>
          <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
            {course.description}
          </p>

          {course.gers.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                GERs / Ways
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {course.gers.map((g) => (
                  <span
                    key={g}
                    className="text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-4">
            <a
              href={`https://explorecourses.stanford.edu/search?q=${encodeURIComponent(course.full_code)}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              View on ExploreCourses →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="text-zinc-500">Loading classified courses…</div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h2 className="text-lg font-semibold text-red-700 mb-2">
          Couldn&apos;t load data
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
      </div>
    </div>
  );
}
