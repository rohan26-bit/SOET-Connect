-- Remove a historical duplicate migration row only when its recorded SQL exactly
-- matches the canonical chat_presence migration. This is safe on fresh databases too:
-- when no duplicate exists, the DELETE is a no-op.
DELETE FROM supabase_migrations.schema_migrations AS duplicate
USING supabase_migrations.schema_migrations AS canonical
WHERE canonical.version='20261106200047'
  AND canonical.name='chat_presence'
  AND duplicate.version='20261106200307'
  AND duplicate.name='chat_presence'
  AND duplicate.statements=canonical.statements;
