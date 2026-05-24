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
  type ImpactTheme,
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
  const [selectedThemes, setSelectedThemes] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedDepts, setSelectedDepts] = useState<Set<string>>(new Set());
  const [selectedQuarters, setSelectedQuarters] = useState<Set<string>>(new Set());
  const [deptFilter, setDeptFilter] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("pit_only");
  const [sortKey, setSortKey] = useState<SortKey>("areas");
  const [hideNotOffered, setHideNotOffered] = useState(true);
  const [activeCourse, setActiveCourse] = useState<ClassifiedCourse | null>(null);
  // Mobile-only: the sidebar collapses into a bottom-sheet drawer triggered
  // by a sticky "Filters" button. On lg+ it's an always-visible left rail.
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Lock body scroll while the mobile filter drawer is open.
  useEffect(() => {
    if (filtersOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [filtersOpen]);

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
      if (selectedThemes.size > 0) {
        const hit = r.verdict.impact_areas.some((a) =>
          selectedThemes.has(impactAreaTheme(a)),
        );
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
    selectedThemes,
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
    setSelectedThemes(new Set());
    setSelectedCategories(new Set());
    setSelectedDepts(new Set());
    setSelectedQuarters(new Set());
    setDeptFilter("");
  };

  const activeFilterCount =
    (search ? 1 : 0) +
    (selectedThemes.size > 0 ? 1 : 0) +
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

      {/* Mobile-only sticky filter bar — shows a Filters button + the active
          filter count + a quick "clear" affordance. Hidden on lg+. */}
      <div className="lg:hidden sticky top-0 z-30 bg-white/90 dark:bg-zinc-950/90 backdrop-blur border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5 flex items-center gap-2">
        <button
          onClick={() => setFiltersOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-[var(--cardinal)] transition"
        >
          <FilterIcon className="w-4 h-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-[var(--cardinal)] text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none">
              {activeFilterCount}
            </span>
          )}
        </button>
        {activeFilterCount > 0 && (
          <button
            onClick={clearAll}
            className="text-xs text-[var(--cardinal)] font-medium"
          >
            Clear
          </button>
        )}
        <div className="ml-auto text-xs text-zinc-500 tabular-nums">
          {sorted.length.toLocaleString()} {sorted.length === 1 ? "course" : "courses"}
        </div>
      </div>

      <div className="flex flex-1 flex-col lg:flex-row max-w-[1600px] w-full mx-auto px-4 lg:px-8 gap-8 py-6 lg:py-8">
        {/* Sidebar — inline on desktop, full-screen drawer on mobile when
            filtersOpen is true. The classes flip the entire layout. */}
        {filtersOpen && (
          <div
            onClick={() => setFiltersOpen(false)}
            className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          />
        )}
        <aside
          className={
            filtersOpen
              ? "lg:!relative lg:!w-72 fixed inset-x-0 bottom-0 top-12 z-50 bg-white dark:bg-zinc-950 rounded-t-2xl shadow-2xl overflow-y-auto thin-scroll px-5 py-5 space-y-7 lg:rounded-none lg:shadow-none lg:px-0 lg:py-0 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:flex-shrink-0"
              : "hidden lg:block lg:w-72 lg:flex-shrink-0 space-y-7 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto thin-scroll pr-2"
          }
        >
          {/* Drawer header — mobile only */}
          {filtersOpen && (
            <div className="lg:hidden flex items-center justify-between pb-3 mb-3 border-b border-zinc-200 dark:border-zinc-800 sticky -top-5 -mx-5 px-5 pt-5 bg-white dark:bg-zinc-950 z-10">
              <h2 className="text-base font-semibold">Filters</h2>
              <div className="flex items-center gap-3">
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearAll}
                    className="text-xs text-[var(--cardinal)] font-medium"
                  >
                    Clear all
                  </button>
                )}
                <button
                  onClick={() => setFiltersOpen(false)}
                  aria-label="Close filters"
                  className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-500 text-2xl leading-none"
                >
                  ×
                </button>
              </div>
            </div>
          )}
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
            count={selectedThemes.size}
            onClear={selectedThemes.size > 0 ? () => setSelectedThemes(new Set()) : undefined}
          >
            <div className="space-y-1">
              {(
                [
                  "justice",
                  "ethics",
                  "environment",
                  "civic",
                  "health",
                  "education",
                  "government",
                ] as ImpactTheme[]
              ).map((t) => {
                const s = THEME_STYLES[t];
                const inSet = selectedThemes.has(t);
                const total = offeredFilteredAll.filter((r) =>
                  r.verdict.impact_areas.some((a) => impactAreaTheme(a) === t),
                ).length;
                const pitN = offeredFilteredAll.filter(
                  (r) =>
                    r.verdict.is_pit &&
                    r.verdict.impact_areas.some((a) => impactAreaTheme(a) === t),
                ).length;
                const n = visibility === "pit_only" ? pitN : total;
                return (
                  <button
                    key={t}
                    onClick={() => toggleSet(selectedThemes, t, setSelectedThemes)}
                    className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm text-left transition ${
                      inSet
                        ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${s.dot}`} />
                    <span className="flex-1 truncate">{s.label}</span>
                    <span
                      className={`text-xs tabular-nums ${
                        inSet ? "text-white/70 dark:text-zinc-700" : "text-zinc-500"
                      }`}
                    >
                      {n.toLocaleString()}
                    </span>
                  </button>
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

          {/* Drawer footer — mobile only — primary CTA to dismiss */}
          {filtersOpen && (
            <div className="lg:hidden sticky bottom-0 -mx-5 px-5 py-3 mt-4 bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => setFiltersOpen(false)}
                className="w-full py-3 bg-[var(--cardinal)] text-white text-sm font-semibold rounded-lg hover:opacity-90 transition"
              >
                Show {sorted.length.toLocaleString()} {sorted.length === 1 ? "course" : "courses"}
              </button>
            </div>
          )}
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
                highlightThemes={selectedThemes}
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
      <div className="max-w-[1600px] mx-auto px-4 lg:px-8 py-8 lg:py-14">
        <div className="flex items-center gap-2 mb-3 lg:mb-4">
          <div className="w-1.5 h-5 lg:h-6 bg-[var(--cardinal)] rounded-full" />
          <span className="text-[10px] lg:text-xs uppercase tracking-[0.15em] lg:tracking-[0.18em] font-semibold text-[var(--cardinal)]">
            Stanford · Public Interest Technology
          </span>
        </div>
        <h1 className="text-[28px] sm:text-3xl lg:text-5xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 leading-[1.1] lg:leading-[1.05]">
          Find the class that matches{" "}
          <span className="lg:hidden">the world you want to build.</span>
          <span className="hidden lg:inline">
            <br />
            the world you want to build.
          </span>
        </h1>
        <p className="text-sm lg:text-lg text-zinc-600 dark:text-zinc-400 mt-3 lg:mt-4 max-w-2xl leading-relaxed">
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

        <div className="mt-6 lg:mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-6">
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
        className={`text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight tabular-nums ${
          subtle ? "text-zinc-700 dark:text-zinc-300" : "text-[var(--cardinal)]"
        }`}
      >
        {value}
      </div>
      <div className="text-[11px] sm:text-xs lg:text-sm text-zinc-500 mt-1 leading-tight">{label}</div>
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
  highlightThemes,
}: {
  course: ClassifiedCourse;
  onClick: () => void;
  delayIndex: number;
  highlightThemes: Set<string>;
}) {
  const v = course.verdict;
  // Compute the unique set of themes this course covers (preserve order).
  const themes: ImpactTheme[] = [];
  const seen = new Set<ImpactTheme>();
  for (const a of v.impact_areas) {
    const t = impactAreaTheme(a);
    if (!seen.has(t)) {
      seen.add(t);
      themes.push(t);
    }
  }

  return (
    <button
      onClick={onClick}
      style={{ animationDelay: `${Math.min(delayIndex, 12) * 18}ms` }}
      className="fade-up group text-left w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md hover:shadow-zinc-900/[0.04] transition-all duration-150 p-4 sm:p-5 min-w-0"
    >
      {/* Stacked on mobile, justified row on sm+ */}
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-y-0.5 sm:gap-x-3 mb-1.5">
        <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 tracking-wide">
          {course.full_code}
        </span>
        <div className="text-xs flex items-center flex-wrap gap-x-2 gap-y-0.5 text-zinc-500">
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

      {/* Explicit theme row — labelled, so users always know what the colors
          mean. When a theme is filter-selected, its chip gets a solid fill
          treatment to reinforce "this is why the course matched". */}
      {v.is_pit && themes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
          {themes.map((t) => {
            const s = THEME_STYLES[t];
            const active = highlightThemes.has(t);
            return (
              <span
                key={t}
                className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border transition ${
                  active
                    ? `${s.chip} ${s.chipDark} ring-2 ring-offset-1 ring-offset-white dark:ring-offset-zinc-950 ring-zinc-900 dark:ring-zinc-100`
                    : `${s.chip} ${s.chipDark}`
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                {s.label}
              </span>
            );
          })}
          {v.pit_category && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 uppercase tracking-wide">
              {PIT_CATEGORY_LABELS[v.pit_category]?.label || v.pit_category}
            </span>
          )}
        </div>
      )}

      {!v.is_pit && (
        <div className="mb-2.5">
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-500">
            not PIT · conf {v.confidence.toFixed(2)}
          </span>
        </div>
      )}

      {/* Granular impact areas — small chips, lower visual weight */}
      {v.impact_areas.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {v.impact_areas.map((a) => (
            <span
              key={a}
              className="text-[11px] px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-400 bg-zinc-100/60 dark:bg-zinc-900/60"
            >
              {a}
            </span>
          ))}
        </div>
      )}

      <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-2">
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
        <div>
          <div className="p-6 lg:p-9">
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

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
    </svg>
  );
}

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
