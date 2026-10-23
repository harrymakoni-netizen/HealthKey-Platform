UPDATE hk.clinics SET settings=settings||'{"communication_options":["spoken","writing","pictures","sign","support"]}'::jsonb WHERE NOT settings ? 'communication_options';
