-- Security advisor: function_search_path_mutable on public.set_updated_at.
-- The function only calls now(), so an empty search_path is safe.
alter function public.set_updated_at() set search_path = '';
