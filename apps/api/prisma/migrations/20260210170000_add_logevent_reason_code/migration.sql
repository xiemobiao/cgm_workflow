-- AlterTable
ALTER TABLE "LogEvent" ADD COLUMN     "reasonCode" TEXT;

-- Backfill from msgJson (best-effort)
UPDATE "LogEvent"
SET
  "reasonCode" = COALESCE(
    NULLIF(trim("msgJson"->>'reasonCode'), ''),
    NULLIF(trim("msgJson"->>'reason_code'), ''),
    NULLIF(trim(("msgJson"->'data')->>'reasonCode'), ''),
    NULLIF(trim(("msgJson"->'data')->>'reason_code'), ''),
    NULLIF(trim(("msgJson"->'error')->>'reasonCode'), ''),
    NULLIF(trim(("msgJson"->'error')->>'reason_code'), '')
  )
WHERE
  "reasonCode" IS NULL
  AND (
    ("msgJson" ? 'reasonCode') OR
    ("msgJson" ? 'reason_code') OR
    (("msgJson"->'data') ? 'reasonCode') OR
    (("msgJson"->'data') ? 'reason_code') OR
    (("msgJson"->'error') ? 'reasonCode') OR
    (("msgJson"->'error') ? 'reason_code')
  );

-- CreateIndex
CREATE INDEX "LogEvent_reasonCode_idx" ON "LogEvent"("reasonCode");
