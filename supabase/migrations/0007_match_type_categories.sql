-- Reemplaza el tipo de partido binario (amistoso/torneo) por 4 categorías reales.
-- Los partidos ya guardados como 'torneo' pasan a 'competicion_oficial' (el equivalente más cercano).

update events set match_type = 'competicion_oficial' where match_type = 'torneo';

alter table events drop constraint if exists events_match_type_check;
alter table events add constraint events_match_type_check
  check (match_type in ('amistoso', 'amistoso_internacional', 'torneo_amistoso', 'competicion_oficial'));
