-- Clasifica los informes por tipo (pre partido, post partido, info sede, otros).
-- Se amplía con más valores el día que se necesiten, igual que se hizo con events.kind.

alter table reports add column if not exists report_type text not null default 'otros';

alter table reports drop constraint if exists reports_report_type_check;
alter table reports add constraint reports_report_type_check
  check (report_type in ('pre_partido', 'post_partido', 'info_sede', 'otros'));
