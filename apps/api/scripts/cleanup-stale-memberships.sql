-- Removes stale non-owner memberships left behind after Clerk users were deleted.
-- Run the SELECT first in Supabase SQL editor. Keep ROLLBACK until the preview is correct,
-- then change ROLLBACK to COMMIT and run the full transaction.

BEGIN;

WITH stale_memberships AS (
  SELECT
    m."id",
    m."userId",
    m."organizationId",
    m."role",
    m."createdAt",
    u."email",
    u."firstName",
    u."lastName"
  FROM "memberships" m
  JOIN "users" u ON u."id" = m."userId"
  WHERE m."role" <> 'OWNER'::"Role"
    AND NULLIF(BTRIM(COALESCE(u."email", '')), '') IS NULL
    AND NULLIF(BTRIM(COALESCE(u."firstName", '')), '') IS NULL
    AND NULLIF(BTRIM(COALESCE(u."lastName", '')), '') IS NULL
)
SELECT *
FROM stale_memberships
ORDER BY "organizationId", "createdAt";

WITH stale_memberships AS (
  SELECT m."id"
  FROM "memberships" m
  JOIN "users" u ON u."id" = m."userId"
  WHERE m."role" <> 'OWNER'::"Role"
    AND NULLIF(BTRIM(COALESCE(u."email", '')), '') IS NULL
    AND NULLIF(BTRIM(COALESCE(u."firstName", '')), '') IS NULL
    AND NULLIF(BTRIM(COALESCE(u."lastName", '')), '') IS NULL
)
DELETE FROM "memberships" m
USING stale_memberships s
WHERE m."id" = s."id"
RETURNING m."id", m."userId", m."organizationId", m."role";

ROLLBACK;
