// Mirrors classifier/taxonomy.py — keep names aligned so impact_areas from
// the verdict JSON match the filter chips exactly.

export const IMPACT_AREAS: { name: string; description: string }[] = [
  { name: "Accessible/Inclusive Design", description: "Tech for diverse abilities; universal design." },
  { name: "Cities/Urban Issues", description: "Urban policy, housing, transportation, infrastructure, public safety." },
  { name: "Civic Engagement", description: "Participation, volunteering, philanthropy, advocacy." },
  { name: "Connected Communities", description: "Cross-sector partnerships, community infrastructure." },
  { name: "Cybersecurity (Public Interest framing)", description: "Critical infrastructure, algorithmic fairness, IoT safety." },
  { name: "Democracy/Elections/Electoral Services", description: "Election integrity, voter access, civic organizing." },
  { name: "Education", description: "EdTech, K-12 access, education equity." },
  { name: "Environmental Sustainability", description: "Climate, clean energy, environmental justice, conservation." },
  { name: "Ethics", description: "Tech ethics, algorithmic bias, fairness, responsible AI." },
  { name: "Food and Agriculture", description: "AgTech, food security, sustainable food systems." },
  { name: "Government and Government Technology", description: "GovTech, civic tech, public-sector digital transformation." },
  { name: "Healthcare", description: "Public health, telemedicine, health equity, health info systems." },
  { name: "Identity", description: "Inclusion, online safety, historically-marginalized groups." },
  { name: "Information Integrity", description: "Data ethics, privacy, security, anti-disinformation." },
  { name: "Law/Legal Services", description: "Legal tech, criminal justice reform, legal aid technology." },
  { name: "Media/Journalism", description: "Data journalism, media literacy, social-media integrity." },
  { name: "Privacy", description: "Privacy law, surveillance, facial recognition, anonymization." },
  { name: "Racial Justice", description: "Racial equity, immigration tech, LGBTQ+ inclusion, gender equality." },
  { name: "Social Justice", description: "Equal rights, opportunity, treatment." },
];

export const PIT_CATEGORY_LABELS: Record<string, { label: string; description: string }> = {
  pit_specific: {
    label: "Core PIT",
    description: "Directly teaches public-interest-tech content.",
  },
  tech_applied_to_impact_area: {
    label: "Tech applied to impact area",
    description: "Technical/computational course applied to a PIT impact area.",
  },
  ethics_policy_of_tech: {
    label: "Ethics/policy of tech",
    description: "Policy, law, ethics, or humanities course on tech's societal role.",
  },
  pit_knowledge_pillar: {
    label: "PIT knowledge",
    description: "Teaches the motivations, assessment, engagement, or responsible deployment of PIT.",
  },
};

// Group the 19 impact areas into 7 visually-distinct theme buckets so the
// chips scan at a glance. Each theme gets a Tailwind color family.
export type ImpactTheme =
  | "justice"
  | "health"
  | "environment"
  | "civic"
  | "ethics"
  | "education"
  | "government";

export const IMPACT_AREA_THEME: Record<string, ImpactTheme> = {
  "Racial Justice": "justice",
  "Social Justice": "justice",
  "Identity": "justice",
  "Law/Legal Services": "justice",
  "Healthcare": "health",
  "Environmental Sustainability": "environment",
  "Food and Agriculture": "environment",
  "Civic Engagement": "civic",
  "Democracy/Elections/Electoral Services": "civic",
  "Cities/Urban Issues": "civic",
  "Connected Communities": "civic",
  "Ethics": "ethics",
  "Privacy": "ethics",
  "Information Integrity": "ethics",
  "Cybersecurity (Public Interest framing)": "ethics",
  "Education": "education",
  "Media/Journalism": "education",
  "Government and Government Technology": "government",
  "Accessible/Inclusive Design": "government",
};

// Tailwind color classes per theme. The "soft" variant is for chips on light
// surfaces; the "accent" variant is the saturated indicator used on the card
// left-stripe and inside the modal.
export const THEME_STYLES: Record<
  ImpactTheme,
  { chip: string; chipDark: string; stripe: string; dot: string; label: string }
> = {
  justice: {
    chip: "bg-rose-100 text-rose-800 border-rose-200",
    chipDark: "dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
    stripe: "bg-rose-500",
    dot: "bg-rose-500",
    label: "Justice & identity",
  },
  health: {
    chip: "bg-pink-100 text-pink-800 border-pink-200",
    chipDark: "dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-900",
    stripe: "bg-pink-500",
    dot: "bg-pink-500",
    label: "Health",
  },
  environment: {
    chip: "bg-emerald-100 text-emerald-800 border-emerald-200",
    chipDark: "dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    stripe: "bg-emerald-500",
    dot: "bg-emerald-500",
    label: "Environment",
  },
  civic: {
    chip: "bg-sky-100 text-sky-800 border-sky-200",
    chipDark: "dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
    stripe: "bg-sky-500",
    dot: "bg-sky-500",
    label: "Civic & democracy",
  },
  ethics: {
    chip: "bg-violet-100 text-violet-800 border-violet-200",
    chipDark: "dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900",
    stripe: "bg-violet-500",
    dot: "bg-violet-500",
    label: "Ethics & privacy",
  },
  education: {
    chip: "bg-amber-100 text-amber-800 border-amber-200",
    chipDark: "dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
    stripe: "bg-amber-500",
    dot: "bg-amber-500",
    label: "Education & media",
  },
  government: {
    chip: "bg-teal-100 text-teal-800 border-teal-200",
    chipDark: "dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900",
    stripe: "bg-teal-500",
    dot: "bg-teal-500",
    label: "Government & access",
  },
};

export function impactAreaTheme(area: string): ImpactTheme {
  return IMPACT_AREA_THEME[area] || "civic";
}

export function areaChipClass(area: string): string {
  const t = THEME_STYLES[impactAreaTheme(area)];
  return `${t.chip} ${t.chipDark}`;
}

// Primary theme of a course = theme of its first impact area, or null.
export function primaryTheme(impactAreas: string[]): ImpactTheme | null {
  if (impactAreas.length === 0) return null;
  return impactAreaTheme(impactAreas[0]);
}
