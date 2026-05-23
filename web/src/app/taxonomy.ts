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
