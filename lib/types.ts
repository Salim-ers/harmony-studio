export type Prospect = {
  id: string; name: string; source_url: string; source_type: string; city: string;
  category: string; evidence: string; signal: string; score: number; status: string;
  notes: string; created_at: string; updated_at: string;
};
export type Project = {
  id: string; name: string; category: string; style: string; brief: string;
  images: string[]; current_html?: string; summary: string;
  created_at: string; updated_at: string;
};
export type Settings = { matrix: string; watch_city: string; watch_enabled: boolean };
