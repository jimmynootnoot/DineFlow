-- Run and commit this file BEFORE se2-02-workflows.sql (Postgres enum requirement).
alter type public.user_role add value if not exists 'management';
