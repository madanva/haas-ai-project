"""
PIT taxonomy — the source of truth for what counts as Public Interest Technology.

Distilled from Stanford Haas Center's June 2023 report
"A Public Interest Technology Job Skills Taxonomy to Match Job Seekers with
Hiring Organizations" (Cohen, Chua, Garvin, Yoon, Zhou).

Key insight from the report (p.13, restated p.36): technical skills alone are
"ambivalent" — a Python or ML course is not PIT just because it's technical.
What makes a class PIT is the intersection of technology content with one of
the 19 PIT-related Fields of Interest & Impact Areas (Appendix 2 §3.2), or
content that directly teaches PIT-specific knowledge (Appendix 2 §1.1.2,
§1.1.3).

This module is the single source the classifier prompt + the UI both consume.
Update here when the taxonomy changes; everything downstream picks it up.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ImpactArea:
    name: str
    subareas: tuple[str, ...]
    description: str  # one-line gloss shown in prompt + UI filters


# Report Appendix 2 §3.2: 19 PIT-Related Fields of Interest and Impact Areas.
IMPACT_AREAS: tuple[ImpactArea, ...] = (
    ImpactArea(
        "Accessible/Inclusive Design",
        ("Equitable use", "Flexibility in use", "Physical effort", "Perceptible information"),
        "Designing technology for people with disabilities or diverse abilities; universal design.",
    ),
    ImpactArea(
        "Cities/Urban Issues",
        ("Housing/Homelessness", "Infrastructure", "Public Safety, Law Enforcement", "Transportation", "Business Recovery", "Hunger/Food Security"),
        "Technology applied to urban policy, housing, transportation, infrastructure, public safety.",
    ),
    ImpactArea(
        "Civic Engagement",
        ("Direct service", "Community collaboration", "Fundraising and philanthropy", "Political engagement"),
        "Tools and platforms enabling civic participation, volunteering, philanthropy, advocacy.",
    ),
    ImpactArea(
        "Connected Communities",
        ("Public/private partnerships", "Equitable transit/transportation", "Neighborhood watch"),
        "Cross-sector partnerships and community infrastructure.",
    ),
    ImpactArea(
        "Cybersecurity (Public Interest framing)",
        ("Algorithmic fairness", "Critical infrastructure", "Cryptocurrency policy", "Internet of Things", "Privacy", "National security"),
        "Security framed around public benefit: critical infrastructure protection, algorithmic fairness, cryptocurrency policy, IoT safety. NOT generic enterprise security training.",
    ),
    ImpactArea(
        "Democracy/Elections/Electoral Services",
        ("Activism", "Community organizing", "Election security"),
        "Election integrity, voter access, civic organizing, election technology.",
    ),
    ImpactArea(
        "Education",
        ("Academia/Research", "EdTech", "Education Nonprofits", "Higher Education", "K-12 Education", "Education Equity"),
        "Educational technology, K-12 access, education equity, EdTech. NOT a generic 'I teach with slides' note.",
    ),
    ImpactArea(
        "Environmental Sustainability",
        ("Carbon Sequestration/Clean Energy", "Climate, Climate Policy", "Conservation", "Green Building", "Environmental Justice", "Land Management", "Water Management"),
        "Climate, clean energy, environmental justice, conservation, sustainable systems.",
    ),
    ImpactArea(
        "Ethics",
        ("Algorithmic Bias", "Digital (Access) Equity", "Transparency", "Open Data", "Data Standardization", "Data Access", "Fairness in hiring"),
        "Tech ethics, algorithmic bias, fairness, transparency, open data, responsible AI.",
    ),
    ImpactArea(
        "Food and Agriculture",
        ("Autonomous farming", "Weather forecasting", "Smart greenhouses", "Biotechnology/seed science", "Online marketplaces", "Supply chain automation"),
        "AgTech, food security, sustainable food systems, agricultural innovation for public benefit.",
    ),
    ImpactArea(
        "Government and Government Technology",
        ("Election integrity", "GovTech/Civic Tech", "Urban Policy", "Tech Policy", "Economic Policy"),
        "GovTech, civic tech, public-sector digital transformation, tech and economic policy.",
    ),
    ImpactArea(
        "Healthcare",
        ("Childcare", "Mental Health Services", "Pharmaceuticals", "Public Health", "Telemedicine"),
        "Public health, telemedicine, mental health tech, health equity, health information systems.",
    ),
    ImpactArea(
        "Identity",
        ("Algorithmic bias", "Inclusion", "Perspectives of historically-marginalized groups", "Online safety"),
        "Inclusion, online safety, perspectives of historically-marginalized groups.",
    ),
    ImpactArea(
        "Information Integrity",
        ("Aggregating/anonymizing data", "Data Ethics", "Data Privacy", "Data Security"),
        "Data ethics, privacy, security, anti-disinformation, content moderation.",
    ),
    ImpactArea(
        "Law/Legal Services",
        ("Bias", "Criminal Justice", "Legal Aid", "Policing", "Prison Reform", "Victim Support", "Fraud Prevention"),
        "Legal tech for public access, criminal justice reform, policing reform, legal aid technology.",
    ),
    ImpactArea(
        "Media/Journalism",
        ("Data Journalism", "Social Media Integrity", "Social Media Analytics", "Media Representation"),
        "Data journalism, media literacy, social-media integrity, representation in media.",
    ),
    ImpactArea(
        "Privacy",
        ("Aggregating/anonymizing data", "Digital security", "Surveillance", "Health information", "Facial recognition", "Geolocation", "IoT data", "Financial transactions"),
        "Privacy law, surveillance studies, facial recognition policy, anonymization techniques, personal data protection.",
    ),
    ImpactArea(
        "Racial Justice",
        ("Black-owned Businesses", "Disability Services", "Immigration/Refugee Services", "LGBTQ+ youth", "Gender equality", "Racial Justice", "Indigenous/Tribal communities", "Economic mobility"),
        "Racial equity in technology and policy, immigration tech, LGBTQ+ inclusion, gender equality, Indigenous communities, economic mobility.",
    ),
    ImpactArea(
        "Social Justice",
        ("Equal rights", "Equal opportunity", "Equal treatment"),
        "Broader social justice framings — equal rights, opportunity, treatment.",
    ),
)


# Report Appendix 2 §1.1.2: PIT-specific academic programs that produce PIT graduates.
# A course explicitly tied to one of these and any impact-area lens is strongly PIT.
PIT_SPECIFIC_ACADEMIC_FIELDS: tuple[str, ...] = (
    "AI",
    "Computer Science",
    "Cybersecurity",
    "Data Management/Analytics/Science/Visualization",
    "Human-Centered Design",
    "Privacy",
    "Software Engineering",
    "Technology Strategy and Policy",
)

# Report Appendix 2 §1.1.3: regardless of educational field, knowledge that
# enables the following is PIT-relevant.
PIT_KNOWLEDGE_PILLARS: tuple[str, ...] = (
    "Understanding the motivations for and challenges of public interest technology",
    "Assessment of new and emerging technologies for social impact",
    "Effective engagement with users (human-centered design)",
    "Responsible deployment of technologies",
)


# The four ways a Stanford class can qualify as PIT under our inclusive
# interpretation. The classifier returns one of these in pit_category.
PIT_CATEGORIES = {
    "pit_specific": (
        "Course directly teaches public-interest-tech content — e.g. 'CS for Social Good', "
        "'Designing Tech Policy', algorithmic fairness, human-centered design for civic problems, "
        "responsible AI deployment."
    ),
    "tech_applied_to_impact_area": (
        "Technical/computational course explicitly applied to one of the 19 PIT impact areas — "
        "e.g. 'ML for Healthcare', 'GIS for Environmental Justice', 'Data Science for Social Sciences'."
    ),
    "ethics_policy_of_tech": (
        "Policy, law, ethics, philosophy, or humanities course centered on technology's societal role — "
        "e.g. 'Privacy Law', 'AI Governance', 'Tech Ethics', 'Computers and Society'. "
        "Qualifies even without hands-on coding."
    ),
    "pit_knowledge_pillar": (
        "Course teaching one of the four PIT-knowledge pillars (motivations/challenges of PIT, "
        "assessing emerging tech for social impact, user engagement, responsible deployment) "
        "regardless of formal field."
    ),
}


# Explicit exclusions — the report's "ambivalent terms" insight (p.13).
NOT_PIT_PATTERNS = (
    "Pure technical-skills courses with no public-interest framing — generic algorithms, "
    "data structures, calculus, organic chemistry.",
    "Pure non-tech humanities/social science with no technology content — history of Rome, "
    "literary criticism without digital/media framing.",
    "Equal-opportunity boilerplate language alone — a syllabus that mentions 'diverse perspectives' "
    "without substantive PIT content does not qualify.",
    "Skills training the report explicitly calls 'ambivalent' — a Python or ML course in itself "
    "is not PIT; it must be applied to or framed around an impact area.",
)


# Pretty list of impact area names — used by classifier prompt and UI filters.
IMPACT_AREA_NAMES: tuple[str, ...] = tuple(a.name for a in IMPACT_AREAS)


def render_taxonomy_for_prompt() -> str:
    """Compact, prompt-ready rendering. Kept terse so we don't blow the context window."""
    lines = ["## PIT Impact Areas (the 19 fields)"]
    for a in IMPACT_AREAS:
        lines.append(f"- **{a.name}**: {a.description}")
    lines.append("")
    lines.append("## What makes a class PIT (inclusive definition — any of these)")
    for k, v in PIT_CATEGORIES.items():
        lines.append(f"- **{k}** — {v}")
    lines.append("")
    lines.append("## What does NOT qualify (the report's 'ambivalent terms' insight)")
    for p in NOT_PIT_PATTERNS:
        lines.append(f"- {p}")
    return "\n".join(lines)


if __name__ == "__main__":
    print(render_taxonomy_for_prompt())
