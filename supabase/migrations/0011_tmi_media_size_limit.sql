-- Sube el límite de tamaño de archivo del bucket de videos/fichas de TMI.

update storage.buckets set file_size_limit = 524288000 where id = 'tmi-media'; -- 500 MB
