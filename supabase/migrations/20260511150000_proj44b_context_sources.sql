-- PROJ-44-β — Context Ingestion Pipeline foundation table. Applied
-- live via Supabase MCP on 2026-05-11; this file mirror keeps
-- `supabase db push` idempotent.

CREATE TYPE public.context_source_kind AS ENUM (
  'document', 'email', 'meeting_notes', 'transcript', 'other'
);
CREATE TYPE public.context_source_processing_status AS ENUM (
  'pending', 'processing', 'classified', 'failed', 'archived'
);

CREATE TABLE public.context_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  kind public.context_source_kind NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) > 0 AND length(title) <= 500),
  content_excerpt text CHECK (content_excerpt IS NULL OR length(content_excerpt) <= 8000),
  content_full_url text CHECK (content_full_url IS NULL OR length(content_full_url) <= 2000),
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  language text CHECK (language IS NULL OR language IN ('de', 'en')),
  privacy_class smallint NOT NULL DEFAULT 3 CHECK (privacy_class IN (1, 2, 3)),
  processing_status public.context_source_processing_status NOT NULL DEFAULT 'pending',
  last_processed_at timestamptz,
  last_failure_reason text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX context_sources_tenant_created_idx
  ON public.context_sources (tenant_id, project_id, created_at DESC);
CREATE INDEX context_sources_status_idx
  ON public.context_sources (processing_status)
  WHERE processing_status IN ('pending', 'processing', 'failed');

CREATE TRIGGER tg_context_sources_touch_updated_at
  BEFORE UPDATE ON public.context_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.context_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY context_sources_select_member ON public.context_sources
  FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY context_sources_insert_member ON public.context_sources
  FOR INSERT WITH CHECK (
    public.is_tenant_member(tenant_id) AND created_by = auth.uid()
  );
CREATE POLICY context_sources_update_admin ON public.context_sources
  FOR UPDATE USING (public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY context_sources_delete_admin ON public.context_sources
  FOR DELETE USING (public.is_tenant_admin(tenant_id));

-- Audit constraint + tracked-columns function updated to include
-- `context_sources` and pre-existing `dependencies` entity type.
-- The full _tracked_audit_columns body was re-issued during the
-- live MCP apply; this file mirror only shows the table + RLS for
-- brevity. To replay locally, run the live function definition
-- captured in the PROJ-44 spec.
