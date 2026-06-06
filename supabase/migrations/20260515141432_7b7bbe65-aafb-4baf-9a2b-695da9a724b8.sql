
REVOKE EXECUTE ON FUNCTION public.soft_delete_entity(text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.restore_entity(text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.purge_soft_deleted() FROM anon, public, authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_entity(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_entity(text, uuid) TO authenticated;
