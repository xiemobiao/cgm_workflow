-- AlterTable
ALTER TABLE "LogEvent" ADD COLUMN     "stage" TEXT;
ALTER TABLE "LogEvent" ADD COLUMN     "op" TEXT;
ALTER TABLE "LogEvent" ADD COLUMN     "result" TEXT;

-- Backfill from msgJson (best-effort)
UPDATE "LogEvent"
SET
  "stage" = COALESCE(
    NULLIF(lower(trim("msgJson"->>'stage')), ''),
    NULLIF(lower(trim(("msgJson"->'data')->>'stage')), '')
  ),
  "op" = COALESCE(
    NULLIF(lower(trim("msgJson"->>'op')), ''),
    NULLIF(lower(trim(("msgJson"->'data')->>'op')), '')
  ),
  "result" = COALESCE(
    NULLIF(lower(trim("msgJson"->>'result')), ''),
    NULLIF(lower(trim(("msgJson"->'data')->>'result')), '')
  )
WHERE
  ("stage" IS NULL OR "op" IS NULL OR "result" IS NULL)
  AND (
    ("msgJson" ? 'stage' OR ("msgJson"->'data') ? 'stage') OR
    ("msgJson" ? 'op' OR ("msgJson"->'data') ? 'op') OR
    ("msgJson" ? 'result' OR ("msgJson"->'data') ? 'result')
  );

-- CreateIndex
CREATE INDEX "LogEvent_logFileId_stage_idx" ON "LogEvent"("logFileId", "stage");
