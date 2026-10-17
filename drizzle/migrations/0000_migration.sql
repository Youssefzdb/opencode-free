CREATE TABLE public.bridge_projects (
  id text PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 64),
  files jsonb NOT NULL DEFAULT '{}'::jsonb,
  message text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bridge_projects TO anon, authenticated;
GRANT ALL ON public.bridge_projects TO service_role;
ALTER TABLE public.bridge_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bridge projects are readable" ON public.bridge_projects FOR SELECT TO anon, authenticated USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.bridge_projects;