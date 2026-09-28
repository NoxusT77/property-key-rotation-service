import { z } from "zod";

export const rotationRequestSchema = z.object({
  oldKeyReference: z.string().min(4).max(200),
});

export type RotationRequest = z.infer<typeof rotationRequestSchema>;

export type RotationDecision = {
  canRevoke: boolean;
  matchingRecords: number;
  nextAction: "revoke-temporary-key" | "keep-overlap-and-redeploy";
};

export function decideRotation(logData: unknown, oldKeyReference: string): RotationDecision {
  const needle = oldKeyReference.toLowerCase();
  let matchingRecords = 0;

  const visit = (value: unknown): void => {
    if (typeof value === "string" && value.toLowerCase().includes(needle)) {
      matchingRecords += 1;
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value !== null && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };

  visit(logData);
  return {
    canRevoke: matchingRecords === 0,
    matchingRecords,
    nextAction: matchingRecords === 0 ? "revoke-temporary-key" : "keep-overlap-and-redeploy",
  };
}
