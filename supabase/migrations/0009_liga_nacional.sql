-- Agrega "Liga Nacional" como tipo de partido.

alter table events drop constraint if exists events_match_type_check;
alter table events add constraint events_match_type_check
  check (match_type in ('amistoso', 'amistoso_internacional', 'torneo_amistoso', 'liga_nacional', 'competicion_oficial'));
