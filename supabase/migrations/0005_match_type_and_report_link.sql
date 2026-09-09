-- Distingue partidos amistosos de partidos por torneo, y permite enlazar
-- un informe a su PDF/Artifact ya generado (integración liviana con Claude Code).

alter table events add column if not exists match_type text check (match_type in ('amistoso', 'torneo'));
alter table reports add column if not exists link_url text;
