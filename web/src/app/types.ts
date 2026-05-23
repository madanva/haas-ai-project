// Mirror of the Python classifier output. Keep in sync with
// classifier/classify.py and scraper/fetch_classes.py.

export type PitCategory =
  | "pit_specific"
  | "tech_applied_to_impact_area"
  | "ethics_policy_of_tech"
  | "pit_knowledge_pillar";

export interface Verdict {
  is_pit: boolean;
  confidence: number;
  pit_category: PitCategory | null;
  impact_areas: string[];
  reasoning: string;
  _pass?: number;
  _cached?: boolean;
}

export interface Course {
  course_id: string;
  subject: string;
  code: string;
  full_code: string;
  title: string;
  description: string;
  year: string;
  units_min: number | null;
  units_max: number | null;
  gers: string[];
  grading: string;
  learning_objectives: string[];
  academic_org: string;
  academic_org_descr: string;
  academic_career: string;
  cross_listed_codes: string[];
}

export interface ClassifiedCourse extends Course {
  verdict: Verdict;
}

export interface ClassifiedPayload {
  model: string;
  classified_at: string;
  source_year: string;
  count: number;
  pit_count: number;
  results: ClassifiedCourse[];
}
