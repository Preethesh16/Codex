import './env.js';
import { Agent, run, webSearchTool } from '@openai/agents';
import { z } from 'zod';
import type { StartupContext } from 'orbit-core';

export const OPENAI_MODELS = {
  manager: process.env.OPENAI_MANAGER_MODEL || 'gpt-5.6-sol',
  specialist: process.env.OPENAI_SPECIALIST_MODEL || 'gpt-5.6-terra',
  fast: process.env.OPENAI_FAST_MODEL || 'gpt-5.6-luna',
  image: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
  video: process.env.OPENAI_VIDEO_MODEL || 'sora-2',
  speech: process.env.OPENAI_TTS_MODEL || 'tts-1',
  transcription: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe',
} as const;

export type OrbitDepartment = 'research' | 'finance' | 'legal' | 'brand' | 'marketing' | 'sales' | 'support' | 'conflict' | 'code' | 'operations';

export interface NormalizedOpenAIError {
  code: string;
  message: string;
  retryable: boolean;
  traceId: string;
}

const sensitivePatterns: Array<[RegExp, string]> = [
  [/\b(?:sk|sess)-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED_API_KEY]'],
  [/\b(?:password|passwd|secret|token|api[_ -]?key)\s*[:=]\s*[^\s,;]+/gi, '[REDACTED_CREDENTIAL]'],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]'],
  [/(?<!\d)(?:\+?91[-\s]?)?[6-9]\d{9}(?!\d)/g, '[REDACTED_PHONE]'],
  [/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, '[REDACTED_ID]'],
  [/\b[A-Z]{5}\d{4}[A-Z]\b/gi, '[REDACTED_TAX_ID]'],
  [/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED_FINANCIAL_ID]'],
];

export function redactForOpenAI(value: string): string {
  return sensitivePatterns.reduce((safe, [pattern, replacement]) => safe.replace(pattern, replacement), value);
}

export function normalizeOpenAIError(error: unknown, traceId: string): NormalizedOpenAIError {
  const candidate = error as { status?: number; code?: string; message?: string };
  const status = candidate?.status;
  return {
    code: candidate?.code || (status ? `http_${status}` : 'openai_error'),
    message: candidate?.message || 'The OpenAI request failed.',
    retryable: status === 408 || status === 409 || status === 429 || (typeof status === 'number' && status >= 500),
    traceId,
  };
}

const instructions: Record<OrbitDepartment, string> = {
  research: 'Research the live market, named competitors, pricing, demand signals, and relevant regulations. Cite sources and distinguish evidence from inference.',
  finance: 'Act as a startup CFO. Show calculations, assumptions, runway, unit economics, pricing, tax considerations, and scaling risks. Never claim to be a licensed adviser.',
  legal: 'Identify legal and compliance risks and practical next steps. Clearly label general information and require qualified counsel for filings or legal decisions.',
  brand: 'Define differentiated positioning, voice, visual direction, and messaging tied to the validated customer problem.',
  marketing: 'Create evidence-based go-to-market experiments, channels, campaigns, prompts, CAC/LTV hypotheses, and measurable success criteria. Cite current claims.',
  sales: 'Create an ethical sales strategy, ICP, qualification method, outreach, pipeline stages, and measurable targets.',
  support: 'Design onboarding and customer-support workflows, retention signals, escalation rules, and feedback loops.',
  conflict: 'Resolve disagreements among specialist recommendations. Surface assumptions, trade-offs, evidence, and a concrete decision.',
  code: 'Turn the approved business context into an implementation-ready product specification for Codex. Do not claim code was changed unless tool evidence says so.',
  operations: 'Coordinate milestones, dependencies, stage gates, risks, owners, and approvals across the company-building workflow.',
};

function contextPrompt(context: StartupContext, sharedContext: string): string {
  return redactForOpenAI(`Company: ${context.companyName}\nVision: ${context.founderProfile.vision}\nNiche: ${context.business.niche}\nTarget market: ${context.business.targetMarket}\nStage: ${context.business.stage}\nRunway: ${context.financials.runwayMonths} months\nBurn: ${context.financials.burnRate}/month\n\nShared activity:\n${sharedContext}`);
}

function createSpecialist(department: OrbitDepartment) {
  const useWeb = department === 'research' || department === 'marketing';
  const complex = department === 'finance' || department === 'legal' || department === 'conflict' || department === 'code';
  return new Agent({
    name: `${department[0].toUpperCase()}${department.slice(1)} specialist`,
    instructions: instructions[department],
    model: complex ? OPENAI_MODELS.manager : OPENAI_MODELS.specialist,
    tools: useWeb ? [webSearchTool()] : [],
  });
}

const specialistAgents = Object.fromEntries(
  (Object.keys(instructions) as OrbitDepartment[]).map((department) => [department, createSpecialist(department)]),
) as Record<OrbitDepartment, Agent>;

const managerTools = (['research', 'finance', 'legal', 'brand', 'marketing', 'sales', 'support', 'conflict', 'code'] as OrbitDepartment[])
  .map((department) => specialistAgents[department].asTool({
    toolName: `${department}_specialist`,
    toolDescription: `Ask Orbit's ${department} specialist for a bounded analysis.`,
  }));

export const orbitManagerAgent = new Agent({
  name: 'Orbit Manager',
  model: OPENAI_MODELS.manager,
  instructions: 'Coordinate Orbit specialists. Research must run before dependent analysis. Reconcile conflicts before producing marketing, build, or GTM recommendations. Never execute publishing, deployment, spending, filings, public claims, or repository writes without explicit human approval.',
  tools: managerTools,
});

async function withRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const status = (error as { status?: number })?.status;
      if (attempt === attempts || ![408, 409, 429, 500, 502, 503, 504].includes(status || 0)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** (attempt - 1))));
    }
  }
  throw lastError;
}

export async function runDepartmentAgent(input: {
  department: OrbitDepartment;
  message: string;
  chatHistory?: string;
  context: StartupContext;
  sharedContext: string;
}): Promise<{ output: string; traceId: string }> {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');
  const traceId = crypto.randomUUID();
  const prompt = redactForOpenAI(`${contextPrompt(input.context, input.sharedContext)}\n\nConversation:\n${input.chatHistory || '(none)'}\n\nFounder request:\n${input.message}`);
  const result = await withRetry(() => run(specialistAgents[input.department], prompt, { maxTurns: 8 }));
  return { output: String(result.finalOutput || '').trim(), traceId };
}

export const FinancePlanSchema = z.object({
  burnRate: z.number().nonnegative(),
  runwayMonths: z.number().nonnegative(),
  infrastructureCost: z.number().nonnegative(),
  subscriptionCost: z.number().nonnegative(),
  budgetAllocations: z.object({
    engineering: z.number().min(0).max(100),
    marketing: z.number().min(0).max(100),
    sales: z.number().min(0).max(100),
    operations: z.number().min(0).max(100),
  }).refine((value) => Math.abs(Object.values(value).reduce((sum, item) => sum + item, 0) - 100) < 0.01, 'Allocations must sum to 100'),
});

const ContextPatchSchema = z.object({
  business: z.object({ niche: z.string().optional(), targetMarket: z.string().optional(), stage: z.string().optional(), validationScore: z.number().min(0).max(100).optional(), tam: z.string().optional(), sam: z.string().optional() }).optional(),
  financials: z.object({ runwayMonths: z.number().nonnegative().optional(), burnRate: z.number().nonnegative().optional(), breakEvenTarget: z.number().nonnegative().optional(), infrastructureCost: z.number().nonnegative().optional(), subscriptionCost: z.number().nonnegative().optional() }).optional(),
  marketing: z.object({ brandVoice: z.string().optional(), taglines: z.array(z.string()).max(8).optional(), targetKeywords: z.array(z.string()).max(20).optional() }).optional(),
  product: z.object({ features: z.array(z.string()).max(20).optional(), techStack: z.array(z.string()).max(20).optional() }).optional(),
  legal: z.object({ riskRating: z.enum(['Low', 'Medium', 'High']).optional() }).optional(),
}).strict();

const WorkflowOutputSchema = z.object({
  summary: z.string(),
  citations: z.array(z.object({ title: z.string().optional(), url: z.string().url() })).max(20),
  assumptions: z.array(z.string()).max(20),
  contextPatch: ContextPatchSchema,
});

export type WorkflowOutput = z.infer<typeof WorkflowOutputSchema>;

export const ORBIT_WORKFLOW_STAGES: ReadonlyArray<ReadonlyArray<OrbitDepartment>> = [
  ['research'],
  ['finance', 'legal', 'brand'],
  ['conflict'],
  ['marketing', 'code', 'sales'],
];

function workflowAgent(department: OrbitDepartment) {
  const useWeb = department === 'research' || department === 'marketing';
  const complex = department === 'finance' || department === 'legal' || department === 'conflict' || department === 'code';
  return new Agent({
    name: `Orbit workflow ${department}`,
    instructions: `${instructions[department]} Return only evidence-backed analysis and a minimal context patch. Never put credentials or personal identifiers in output. Never claim an external action was executed.`,
    model: complex ? OPENAI_MODELS.manager : OPENAI_MODELS.specialist,
    tools: useWeb ? [webSearchTool()] : [],
    outputType: WorkflowOutputSchema,
  });
}

async function workflowRun(department: OrbitDepartment, objective: string, context: StartupContext, prior: string): Promise<WorkflowOutput> {
  const result = await withRetry(() => run(workflowAgent(department), redactForOpenAI(`${contextPrompt(context, prior)}\n\nObjective: ${objective}`), { maxTurns: 10 }));
  return WorkflowOutputSchema.parse(result.finalOutput);
}

export async function runOrbitWorkflow(objective: string, context: StartupContext): Promise<Array<{ department: OrbitDepartment; output: WorkflowOutput }>> {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');
  const results: Array<{ department: OrbitDepartment; output: WorkflowOutput }> = [];
  const research = await workflowRun('research', objective, context, 'Research runs first.');
  results.push({ department: 'research', output: research });
  const researchSummary = JSON.stringify(research);
  const parallel = await Promise.all((['finance', 'legal', 'brand'] as OrbitDepartment[]).map(async (department) => ({ department, output: await workflowRun(department, objective, context, researchSummary) })));
  results.push(...parallel);
  const conflict = await workflowRun('conflict', objective, context, JSON.stringify(parallel.map(({ department, output }) => ({ department, output }))));
  results.push({ department: 'conflict', output: conflict });
  const finalPrior = JSON.stringify({ research, parallel, conflict });
  const delivery = await Promise.all((['marketing', 'code', 'sales'] as OrbitDepartment[]).map(async (department) => ({ department, output: await workflowRun(department, objective, context, finalPrior) })));
  results.push(...delivery);
  return results;
}

export function applyValidatedContextPatch(context: StartupContext, patch: unknown): StartupContext {
  const parsed = ContextPatchSchema.parse(patch);
  if (parsed.business) context.business = { ...context.business, ...parsed.business };
  if (parsed.financials) context.financials = { ...context.financials, ...parsed.financials };
  if (parsed.marketing) context.marketing = { ...context.marketing, ...parsed.marketing };
  if (parsed.product) context.product = { ...context.product, ...parsed.product };
  if (parsed.legal) context.legal = { ...context.legal, ...parsed.legal };
  return context;
}

export async function refineFinancePlan(message: string, context: StartupContext) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');
  const structuredAgent = new Agent({
    name: 'Orbit Finance Planner',
    model: OPENAI_MODELS.manager,
    instructions: 'Return a feasible revised startup budget based only on the supplied context and founder request. Budget allocation percentages must sum to 100.',
    outputType: FinancePlanSchema,
  });
  const result = await withRetry(() => run(structuredAgent, redactForOpenAI(`${contextPrompt(context, '')}\n\nRequest: ${message}`)));
  return FinancePlanSchema.parse(result.finalOutput);
}
