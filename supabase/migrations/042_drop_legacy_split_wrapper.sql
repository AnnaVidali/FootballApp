-- ============================================================
-- Migration 042: drop the legacy 2-argument split wrapper
-- ============================================================
-- Migration 039 introduced the timezone-aware
-- finalize_reservation_split(uuid, uuid[], text) and kept a
-- 2-argument wrapper for deployments that still called the old
-- signature. The app has been calling the 3-argument version since
-- fae3ed53, so the wrapper is no longer needed and leaving it in
-- place only keeps an untested old clock path alive.
--
-- Keep this as a separate migration so a rollback is a simple
-- CREATE OR REPLACE of the wrapper from 039.

DROP FUNCTION IF EXISTS public.finalize_reservation_split(uuid, uuid[]);
