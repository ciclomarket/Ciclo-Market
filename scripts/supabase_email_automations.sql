-- Email Automation Logs - Tracking de envíos para las 3 automatizaciones semanales
-- Ejecutar en Supabase SQL Editor

-- Tabla de logs para evitar re-envíos y métricas
CREATE TABLE IF NOT EXISTS public.email_automation_logs (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    automation_type text NOT NULL, -- 'monday_new_arrivals', 'wednesday_update', 'friday_upgrade'
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    email_to text NOT NULL,
    sent_at timestamp with time zone DEFAULT now(),
    opened_at timestamp with time zone,
    clicked_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    
    CONSTRAINT automation_type_check CHECK (
        automation_type IN ('monday_new_arrivals', 'wednesday_update', 'friday_upgrade')
    )
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_email_automation_logs_type_user 
    ON public.email_automation_logs(automation_type, user_id);
CREATE INDEX IF NOT EXISTS idx_email_automation_logs_sent_at 
    ON public.email_automation_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_email_automation_logs_type_sent 
    ON public.email_automation_logs(automation_type, sent_at);

-- Comentario
COMMENT ON TABLE public.email_automation_logs IS 
'Tracking de envíos de automatizaciones de email (lunes/miércoles/viernes) para evitar spam y métricas';

-- RLS: solo el service role puede escribir/leer (se maneja desde backend)
ALTER TABLE public.email_automation_logs ENABLE ROW LEVEL SECURITY;

-- Política: deny all para anon/authenticated (solo service role via backend)
CREATE POLICY "deny_all_automation_logs" 
    ON public.email_automation_logs 
    FOR ALL 
    TO anon, authenticated 
    USING (false);

-- Vista para dashboard: envíos por automatización últimos 30 días
CREATE OR REPLACE VIEW public.v_email_automation_stats AS
SELECT 
    automation_type,
    DATE(sent_at) as date,
    COUNT(*) as sent_count,
    COUNT(opened_at) as opened_count,
    COUNT(clicked_at) as clicked_count
FROM public.email_automation_logs
WHERE sent_at >= NOW() - INTERVAL '30 days'
GROUP BY automation_type, DATE(sent_at)
ORDER BY date DESC, automation_type;

COMMENT ON VIEW public.v_email_automation_stats IS 
'Stats diarias de envíos de email automatizados para el admin dashboard';
