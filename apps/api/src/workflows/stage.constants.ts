import { StageName } from '@prisma/client';

export const STAGE_ORDER: StageName[] = [
  StageName.Requirement,
  StageName.Design,
  StageName.Development,
  StageName.Test,
  StageName.Release,
  StageName.Diagnosis,
];

export function stageIndex(stage: StageName) {
  return STAGE_ORDER.indexOf(stage);
}
