"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClassifiedCourse, ClassifiedPayload } from "./types";
import {
  IMPACT_AREAS,
  PIT_CATEGORY_LABELS,
  THEME_STYLES,
  areaChipClass,
  impactAreaTheme,
  primaryTheme,
} from "./taxonomy";

type SortKey = "code" | "title" | "department" | "confidence" | "areas";
type Visibility = "pit_only" | "all";
const DATA_URL = "/classified.json";
const QUARTERS = ["Autumn", "Winter", "Spring", "Summer"] as const;

export default function Home() {
  const [payload, setPayload] = useState<ClassifiedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedAreas, setSelectedAreas] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedDepts, setSelectedDepts] = useState<Set<string>>(new Set());
  const [selectedQuarters, setSelectedQuarters] = useState<Set<string>>(new Set());
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

  const offeredFilteredAll = useMemo(() => {
    if (!payload) return [];
    return hideNotOffered
      ? payload.results.filter((r) => r.is_offered_this_year)
      : payload.results;
  }, [payload, hideNotOffered]);

  const totalCount = offeredFilteredAll.length;
  const pitCount = offeredFilteredAll.filter((r) => r.verdict.is_pit).length;
  const deptCount = useMemo(
    () => new Set(offeredFilteredAll.filter((r) => r.verdict.is_pit).map((r) => r.subject)).size,
    [offeredFilteredAll],
  );

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
      if (selectedQuarters.size > 0) {
        const hit = r.offered_terms.some((q) => selectedQuarters.has(q));
        if (!hit) return false;
      }
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
  }, [
    payload,
    search,
    selectedAreas,
    selectedCategories,
    selectedDepts,
    selectedQuarters,
    visibility,
    hideNotOffered,
  ]);

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

  const clearAll = () => {
    setSearch("");
    setSelectedAreas(new Set());
    setSelectedCategories(new Set());
    setSelectedDepts(new Set());
    setSelectedQuarters(new Set());
    setDeptFilter("");
  };

  const activeFilterCount =
    (search ? 1 : 0) +
    (selectedAreas.size > 0 ? 1 : 0) +
    (selectedCategories.size > 0 ? 1 : 0) +
    (selectedDepts.size > 0 ? 1 : 0) +
    (selectedQuarters.size > 0 ? 1 : 0);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!payload) return <ErrorState message="No data" />;

  const pitOfferedTotal = payload.results.filter(
    (r) => r.verdict.is_pit && r.is_offered_this_year,
  ).length;
  const hiddenNotOffered =
    payload.count - payload.results.filter((r) => r.is_offered_this_year).length;

  return (
    <div className="flex flex-1 flex-col">
      <Hero
        pitOffered={pitOfferedTotal}
        pitTotal={payload.pit_count}
        impactAreaCount={IMPACT_AREAS.length}
        deptCount={deptCount}
      />

      <div className="flex flex-1 flex-col lg:flex-row max-w-[1600px] w-full mx-auto px-4 lg:px-8 gap-8 py-8">
        {/* Sidebar */}
        <aside className="lg:w-72 lg:flex-shrink-0 space-y-7 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto thin-scroll pr-2">
          <FilterSection title="Show">
            <RadioGroup
              options={[
                { value: "pit_only", label: `PIT only`, count: pitCount },
                { value: "all", label: `All courses`, count: totalCount },
              ]}
              value={visibility}
              onChange={(v) => setVisibility(v as Visibility)}
            />
            <label className="flex items-start gap-2.5 text-sm cursor-pointer mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <input
                type="checkbox"
                className="mt-0.5 flex-shrink-0"
                checked={hideNotOffered}
                onChange={(e) => setHideNotOffered(e.target.checked)}
              />
              <span className="leading-snug">
                Only offered 2025–26
                <span className="block text-xs text-zinc-500 mt-0.5">
                  hides {hiddenNotOffered.toLocaleString()} catalog courses on hiatus
                </span>
              </span>
            </label>
          </FilterSection>

          <FilterSection
            title="Quarter"
            count={selectedQuarters.size}
            onClear={selectedQuarters.size > 0 ? () => setSelectedQuarters(new Set()) : undefined}
          >
            <div className="grid grid-cols-2 gap-1.5">
              {QUARTERS.map((q) => {
                const inSet = selectedQuarters.has(q);
                const totalInQ = offeredFilteredAll.filter((r) =>
                  r.offered_terms.includes(q),
                ).length;
                const pitInQ = offeredFilteredAll.filter(
                  (r) => r.offered_terms.includes(q) && r.verdict.is_pit,
                ).length;
                const n = visibility === "pit_only" ? pitInQ : totalInQ;
                return (
                  <button
                    key={q}
                    onClick={() => toggleSet(selectedQuarters, q, setSelectedQuarters)}
                    className={`px-2.5 py-1.5 text-sm rounded-md border transition text-left ${
                      inSet
                        ? "bg-[var(--cardinal)] text-white border-[var(--cardinal)]"
                        : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600"
                    }`}
                  >
                    <div className="font-medium">{q}</div>
                    <div className={`text-xs ${inSet ? "text-white/80" : "text-zinc-500"}`}>
                      {n.toLocaleString()}
                    </div>
                  </button>
                );
              })}
            </div>
          </FilterSection>

          <FilterSection
            title="PIT category"
            count={selectedCategories.size}
            onClear={
              selectedCategories.size > 0 ? () => setSelectedCategories(new Set()) : undefined
            }
          >
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

          <FilterSection
            title="Impact area"
            count={selectedAreas.size}
            onClear={selectedAreas.size > 0 ? () => setSelectedAreas(new Set()) : undefined}
          >
            <div className="space-y-1.5">
              {IMPACT_AREAS.map((a) => {
                const theme = impactAreaTheme(a.name);
                const dot = THEME_STYLES[theme].dot;
                return (
                  <label
                    key={a.name}
                    title={a.description}
                    className="flex items-center gap-2 text-sm cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 -mx-1 px-1 py-1 rounded"
                  >
                    <input
                      type="checkbox"
                      className="flex-shrink-0"
                      checked={selectedAreas.has(a.name)}
                      onChange={() => toggleSet(selectedAreas, a.name, setSelectedAreas)}
                    />
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                    <span className="leading-tight flex-1 truncate">{a.name}</span>
                  </label>
                );
              })}
            </div>
          </FilterSection>

          <FilterSection
            title="Department"
            count={selectedDepts.size}
            onClear={selectedDepts.size > 0 ? () => setSelectedDepts(new Set()) : undefined}
          >
            <input
              type="text"
              placeholder="Filter departments…"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="w-full text-sm px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded-md mb-2 bg-white dark:bg-zinc-950 focus:outline-none focus:border-[var(--cardinal)] focus:ring-2 focus:ring-[var(--cardinal)]/20"
            />
            <div className="max-h-72 overflow-y-auto space-y-0.5 thin-scroll pr-1">
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
                    className="flex items-center gap-2 text-xs cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 px-1 py-1 rounded"
                  >
                    <input
                      type="checkbox"
                      className="flex-shrink-0"
                      checked={selectedDepts.has(d.code)}
                      onChange={() => toggleSet(selectedDepts, d.code, setSelectedDepts)}
                    />
                    <span className="flex-1 truncate font-mono">{d.code}</span>
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

        {/* Main */}
        <main className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="search"
                placeholder="Search title, description, course code…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:border-[var(--cardinal)] focus:ring-2 focus:ring-[var(--cardinal)]/20"
              />
            </div>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-sm font-medium cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-600"
            >
              <option value="areas">Sort: most impact areas</option>
              <option value="confidence">Sort: highest confidence</option>
              <option value="code">Sort: course code</option>
              <option value="title">Sort: title</option>
              <option value="department">Sort: department</option>
            </select>
          </div>

          <div className="flex items-center justify-between mb-4 text-sm">
            <div className="text-zinc-600 dark:text-zinc-400">
              <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                {sorted.length.toLocaleString()}
              </span>{" "}
              {sorted.length === 1 ? "course" : "courses"}
              {activeFilterCount > 0 && (
                <span className="text-zinc-500">
                  {" "}
                  matching {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {activeFilterCount > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-[var(--cardinal)] hover:underline font-medium"
              >
                Clear filters
              </button>
            )}
          </div>

          <div className="space-y-3">
            {sorted.slice(0, 500).map((r, i) => (
              <CourseCard
                key={r.course_id}
                course={r}
                onClick={() => setActiveCourse(r)}
                delayIndex={i}
              />
            ))}
            {sorted.length > 500 && (
              <div className="text-sm text-zinc-500 text-center py-6">
                Showing first 500 of {sorted.length.toLocaleString()}. Refine filters to see more.
              </div>
            )}
            {sorted.length === 0 && <EmptyState onReset={clearAll} />}
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

// =====================================================================
// Components
// =====================================================================

function Hero({
  pitOffered,
  pitTotal,
  impactAreaCount,
  deptCount,
}: {
  pitOffered: number;
  pitTotal: number;
  impactAreaCount: number;
  deptCount: number;
}) {
  return (
    <header className="hero-bg border-b border-zinc-200 dark:border-zinc-800">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-8 py-10 lg:py-14">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1.5 h-6 bg-[var(--cardinal)] rounded-full" />
          <span className="text-xs uppercase tracking-[0.18em] font-semibold text-[var(--cardinal)]">
            Stanford · Public Interest Technology
          </span>
        </div>
        <h1 className="text-3xl lg:text-5xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 leading-[1.05]">
          Find the class that matches
          <br />
          the world you want to build.
        </h1>
        <p className="text-base lg:text-lg text-zinc-600 dark:text-zinc-400 mt-4 max-w-2xl leading-relaxed">
          Every Stanford course offered in 2025–26, classified against the{" "}
          <a
            className="text-[var(--cardinal)] underline decoration-[var(--cardinal)]/40 underline-offset-2 hover:decoration-[var(--cardinal)] transition"
            href="https://haas.stanford.edu"
            target="_blank"
            rel="noreferrer"
          >
            Haas Center
          </a>{" "}
          Public Interest Technology taxonomy. Tech for the public good, ethics of technology, civic tech,
          and more.
        </p>

        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 lg:gap-6">
          <Stat value={pitOffered.toLocaleString()} label="PIT courses this year" />
          <Stat value={pitTotal.toLocaleString()} label="PIT in full catalog" subtle />
          <Stat value={impactAreaCount.toString()} label="Impact areas" subtle />
          <Stat value={deptCount.toString()} label="Departments offering PIT" subtle />
        </div>
      </div>
    </header>
  );
}

function Stat({ value, label, subtle }: { value: string; label: string; subtle?: boolean }) {
  return (
    <div className="flex flex-col">
      <div
        className={`text-3xl lg:text-4xl font-semibold tracking-tight tabular-nums ${
          subtle ? "text-zinc-700 dark:text-zinc-300" : "text-[var(--cardinal)]"
        }`}
      >
        {value}
      </div>
      <div className="text-xs lg:text-sm text-zinc-500 mt-1 leading-tight">{label}</div>
    </div>
  );
}

function FilterSection({
  title,
  count,
  onClear,
  children,
}: {
  title: string;
  count?: number;
  onClear?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
          {title}
          {count !== undefined && count > 0 && (
            <span className="ml-1.5 text-[var(--cardinal)] tabular-nums">{count}</span>
          )}
        </h3>
        {onClear && (
          <button
            onClick={onClear}
            className="text-[10px] uppercase tracking-wide text-zinc-500 hover:text-[var(--cardinal)]"
          >
            Clear
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function RadioGroup({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string; count: number }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      {options.map((o) => (
        <label
          key={o.value}
          className="flex items-center justify-between gap-2 text-sm cursor-pointer px-1 py-1 -mx-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-900"
        >
          <div className="flex items-center gap-2">
            <input
              type="radio"
              name="visibility"
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span>{o.label}</span>
          </div>
          <span className="text-xs text-zinc-500 tabular-nums">
            {o.count.toLocaleString()}
          </span>
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
      className="flex items-start gap-2 text-sm cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 -mx-1 px-1 py-1 rounded"
    >
      <input type="checkbox" checked={checked} onChange={onChange} className="mt-0.5 flex-shrink-0" />
      <span className="leading-tight">{label}</span>
    </label>
  );
}

function CourseCard({
  course,
  onClick,
  delayIndex,
}: {
  course: ClassifiedCourse;
  onClick: () => void;
  delayIndex: number;
}) {
  const v = course.verdict;
  const theme = primaryTheme(v.impact_areas);
  const stripe = theme ? THEME_STYLES[theme].stripe : "bg-zinc-300";

  return (
    <button
      onClick={onClick}
      style={{ animationDelay: `${Math.min(delayIndex, 12) * 18}ms` }}
      className="fade-up group text-left w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md hover:shadow-zinc-900/[0.04] transition-all duration-150"
    >
      <div className="flex">
        <div className={`w-1 flex-shrink-0 ${stripe}`} />
        <div className="flex-1 p-5 min-w-0">
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 tracking-wide">
              {course.full_code}
            </span>
            <div className="text-xs whitespace-nowrap flex items-center gap-3 text-zinc-500">
              {course.is_offered_this_year ? (
                <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                  {course.offered_terms.join(" · ")}
                </span>
              ) : (
                <span className="text-amber-700 dark:text-amber-400 font-medium">
                  Not offered 2025–26
                </span>
              )}
              <span className="text-zinc-400 dark:text-zinc-600">·</span>
              <span>
                {course.units_min === course.units_max
                  ? `${course.units_min ?? "?"} units`
                  : `${course.units_min ?? "?"}–${course.units_max ?? "?"} units`}
              </span>
            </div>
          </div>
          <h2 className="text-base lg:text-lg font-medium text-zinc-900 dark:text-zinc-50 leading-snug mb-2.5 group-hover:text-[var(--cardinal)] transition-colors">
            {course.title}
          </h2>
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {v.is_pit && v.pit_category && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 uppercase tracking-wide">
                {PIT_CATEGORY_LABELS[v.pit_category]?.label || v.pit_category}
              </span>
            )}
            {v.impact_areas.map((a) => (
              <span
                key={a}
                className={`text-xs px-2 py-0.5 rounded-full border ${areaChipClass(a)}`}
              >
                {a}
              </span>
            ))}
            {!v.is_pit && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-500">
                not PIT · conf {v.confidence.toFixed(2)}
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-2">
            {course.description}
          </p>
        </div>
      </div>
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
  const theme = primaryTheme(v.impact_areas);
  const stripe = theme ? THEME_STYLES[theme].stripe : "bg-zinc-300";

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-zinc-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fade-up bg-white dark:bg-zinc-950 rounded-t-3xl sm:rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto thin-scroll"
      >
        <div className="flex">
          <div className={`w-1.5 flex-shrink-0 ${stripe}`} />
          <div className="flex-1 p-6 lg:p-9">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="min-w-0">
                <div className="text-xs font-mono text-zinc-500 tracking-wide mb-1">
                  {course.full_code}
                </div>
                <h2 className="text-2xl lg:text-3xl font-semibold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">
                  {course.title}
                </h2>
                <div className="text-sm text-zinc-500 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{course.academic_org_descr || course.academic_org || course.subject}</span>
                  <span>·</span>
                  <span>
                    {course.units_min === course.units_max
                      ? `${course.units_min} units`
                      : `${course.units_min}–${course.units_max} units`}
                  </span>
                  <span>·</span>
                  <span>{course.grading}</span>
                </div>
                <div className="text-xs mt-2">
                  {course.is_offered_this_year ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Offered: {course.offered_terms.join(", ")} 2025–26
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Not offered in 2025–26 — listed in catalog
                    </span>
                  )}
                </div>
                {course.cross_listed_codes.length > 0 && (
                  <div className="text-xs text-zinc-500 mt-2">
                    Also listed as:{" "}
                    <span className="font-mono text-zinc-700 dark:text-zinc-300">
                      {course.cross_listed_codes.join(", ")}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 text-2xl leading-none w-8 h-8 flex items-center justify-center flex-shrink-0 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                ×
              </button>
            </div>

            {v.is_pit ? (
              <div className="mb-6 p-5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 uppercase tracking-wide">
                    {v.pit_category ? PIT_CATEGORY_LABELS[v.pit_category]?.label : "PIT"}
                  </span>
                  <span className="text-xs text-zinc-500">
                    Classifier confidence {(v.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                {v.impact_areas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {v.impact_areas.map((a) => (
                      <span
                        key={a}
                        className={`text-xs px-2 py-0.5 rounded-full border ${areaChipClass(a)}`}
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {v.reasoning}
                </p>
              </div>
            ) : (
              <div className="mb-6 p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                <div className="text-xs text-zinc-500 mb-2 uppercase tracking-wide">
                  Not classified as PIT · {(v.confidence * 100).toFixed(0)}% confidence
                </div>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">{v.reasoning}</p>
              </div>
            )}

            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-[0.15em] mb-2">
              Description
            </h3>
            <p className="text-sm lg:text-[15px] text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
              {course.description}
            </p>

            {course.gers.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-[0.15em] mb-2">
                  Ways / GERs
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

            <div className="mt-7 pt-5 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-4">
              <a
                href={`https://explorecourses.stanford.edu/search?q=${encodeURIComponent(course.full_code)}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-[var(--cardinal)] hover:underline font-medium inline-flex items-center gap-1"
              >
                View on ExploreCourses
                <ArrowRightIcon className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Footer({ payload }: { payload: ClassifiedPayload }) {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800 mt-16 py-6 bg-white/50 dark:bg-zinc-950/50">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-8 text-xs text-zinc-500 leading-relaxed">
        <span className="font-semibold text-zinc-700 dark:text-zinc-300">
          {payload.pit_count.toLocaleString()}
        </span>{" "}
        PIT courses identified across {payload.count.toLocaleString()} active 2025–26 listings ·{" "}
        <span className="font-semibold text-zinc-700 dark:text-zinc-300">
          {payload.results
            .filter((r) => r.verdict.is_pit && r.is_offered_this_year)
            .length.toLocaleString()}
        </span>{" "}
        offered this year · classified{" "}
        {new Date(payload.classified_at).toLocaleDateString()} · model {payload.model} · source:
        explorecourses.stanford.edu
      </div>
    </footer>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex items-center gap-3 text-zinc-500">
        <div className="w-4 h-4 border-2 border-[var(--cardinal)] border-t-transparent rounded-full animate-spin" />
        Loading Stanford courses…
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h2 className="text-lg font-semibold text-[var(--cardinal)] mb-2">
          Couldn&apos;t load data
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
      </div>
    </div>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="text-center py-16">
      <div className="text-zinc-300 dark:text-zinc-700 mb-3">
        <svg
          className="w-12 h-12 mx-auto"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
          />
        </svg>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
        No courses match the current filters.
      </p>
      <button
        onClick={onReset}
        className="text-sm text-[var(--cardinal)] hover:underline font-medium"
      >
        Clear all filters
      </button>
    </div>
  );
}

// =====================================================================
// Inline icons (keeps the bundle small — no icon library dep)
// =====================================================================

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
