-- Permite especificar la competencia (Sudamericano, Mundial, etc.) cuando
-- el partido es de tipo "Competición Oficial".

alter table events add column if not exists competition_name text;
