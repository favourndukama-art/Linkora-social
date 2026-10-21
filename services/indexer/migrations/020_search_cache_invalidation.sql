-- Migration 020: Notify search workers when indexed documents or ranking inputs change.
-- The search service listens on this channel and evicts its Redis result cache.

CREATE OR REPLACE FUNCTION notify_search_index_changed()
RETURNS TRIGGER AS $$
DECLARE
    changed_id TEXT;
BEGIN
    changed_id := COALESCE(
        to_jsonb(NEW) ->> 'id',
        to_jsonb(NEW) ->> 'address',
        to_jsonb(OLD) ->> 'id',
        to_jsonb(OLD) ->> 'address'
    );
    PERFORM pg_notify('search_index_changed', json_build_object(
        'table', TG_TABLE_NAME,
        'operation', TG_OP,
        'id', changed_id
    )::text);
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_search_cache_invalidation ON posts;
CREATE TRIGGER posts_search_cache_invalidation
AFTER INSERT OR UPDATE OR DELETE ON posts
FOR EACH ROW EXECUTE FUNCTION notify_search_index_changed();

DROP TRIGGER IF EXISTS profiles_search_cache_invalidation ON profiles;
CREATE TRIGGER profiles_search_cache_invalidation
AFTER INSERT OR UPDATE OR DELETE ON profiles
FOR EACH ROW EXECUTE FUNCTION notify_search_index_changed();
