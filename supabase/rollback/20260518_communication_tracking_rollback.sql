-- Rollback de 20260518120000_communication_tracking.sql
-- Remove as 3 tabelas de rastreio de comunicacao. tracked_links e
-- tracking_events caem por CASCADE, mas sao listadas explicitamente para
-- deixar a intencao clara.

DROP TABLE IF EXISTS public.tracking_events CASCADE;
DROP TABLE IF EXISTS public.tracked_links CASCADE;
DROP TABLE IF EXISTS public.communications CASCADE;
