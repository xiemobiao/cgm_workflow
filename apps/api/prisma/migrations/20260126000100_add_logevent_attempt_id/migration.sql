-- AlterTable
ALTER TABLE "LogEvent" ADD COLUMN     "attemptId" TEXT;

-- Backfill from msgJson (best-effort)
UPDATE "LogEvent"
SET
  "attemptId" = COALESCE(
    NULLIF(trim("msgJson"->>'attemptId'), ''),
    NULLIF(trim(("msgJson"->'data')->>'attemptId'), '')
  )
WHERE
  "attemptId" IS NULL
  AND (
    ("msgJson" ? 'attemptId' OR ("msgJson"->'data') ? 'attemptId')
  );

-- CreateIndex
CREATE INDEX "LogEvent_projectId_attemptId_idx" ON "LogEvent"("projectId", "attemptId");
