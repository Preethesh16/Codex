export function requireExplicitApproval(action: string, approved: unknown): void {
  if (approved !== true) throw new Error(`${action} requires explicit human approval.`);
}
