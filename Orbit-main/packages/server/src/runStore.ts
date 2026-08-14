import { join, resolve } from 'path';
import type { AgentRun, ToolApproval } from 'orbit-core';
import { readJson, writeJsonAtomic } from './atomicJson.js';

const base = process.env.ORBIT_DATA_DIR ? resolve(process.env.ORBIT_DATA_DIR) : join(process.cwd(), 'uploads');
const runsPath = join(base, 'agent-runs.json');
const approvalsPath = join(base, 'tool-approvals.json');

function read<T>(file: string): T[] {
  return readJson<T[]>(file, []);
}

function write<T>(file: string, items: T[]): void {
  writeJsonAtomic(file, items.slice(-500));
}

export function saveAgentRun(run: AgentRun): void {
  const items = read<AgentRun>(runsPath);
  const index = items.findIndex((item) => item.id === run.id);
  if (index >= 0) items[index] = run; else items.push(run);
  write(runsPath, items);
}

export function listAgentRuns(workspaceId: string): AgentRun[] {
  return read<AgentRun>(runsPath).filter((run) => run.workspaceId === workspaceId);
}

export function createApproval(input: Omit<ToolApproval, 'id' | 'status' | 'requestedAt'>): ToolApproval {
  const approval: ToolApproval = { ...input, id: crypto.randomUUID(), status: 'pending', requestedAt: new Date().toISOString() };
  const items = read<ToolApproval>(approvalsPath);
  items.push(approval);
  write(approvalsPath, items);
  return approval;
}

export function listApprovals(workspaceId: string): ToolApproval[] {
  return read<ToolApproval>(approvalsPath).filter((approval) => approval.workspaceId === workspaceId);
}

export function decideApproval(id: string, workspaceId: string, status: 'approved' | 'rejected', decidedBy: string): ToolApproval | undefined {
  const items = read<ToolApproval>(approvalsPath);
  const approval = items.find((item) => item.id === id && item.workspaceId === workspaceId && item.status === 'pending');
  if (!approval) return undefined;
  approval.status = status;
  approval.decidedAt = new Date().toISOString();
  approval.decidedBy = decidedBy;
  write(approvalsPath, items);
  return approval;
}

export function updateApprovalExecution(id: string, workspaceId: string, patch: Pick<ToolApproval, 'output' | 'executionError'>): ToolApproval | undefined {
  const items = read<ToolApproval>(approvalsPath);
  const approval = items.find((item) => item.id === id && item.workspaceId === workspaceId);
  if (!approval) return undefined;
  if (patch.output !== undefined) approval.output = patch.output;
  if (patch.executionError !== undefined) approval.executionError = patch.executionError;
  write(approvalsPath, items);
  return approval;
}
