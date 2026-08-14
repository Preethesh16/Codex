export interface FounderProfile {
  vision: string;
  technicalSkillLevel: 'beginner' | 'intermediate' | 'advanced';
  location: string;
  preferences: Record<string, any>;
}

export interface BusinessContext {
  niche: string;
  targetMarket: string;
  stage: string;
  validationScore: number;
  tam?: string;
  sam?: string;
}

export interface ProductContext {
  features: string[];
  stitchCanvasId?: string;
  techStack: string[];
  userStories: Array<{ id: string; title: string; points: number; status: 'todo' | 'inprogress' | 'done' }>;
  activeRoadmap: Array<{ id: string; phase: string; milestone: string; date: string; status: 'pending' | 'completed' }>;
}

export interface FinancialContext {
  runwayMonths: number;
  burnRate: number;
  breakEvenTarget: number;
  budgetAllocations: Record<string, number>;
  infrastructureCost: number;
  subscriptionCost: number;
}

export interface MarketingCampaign {
  id: string;
  name: string;
  platform: 'LinkedIn' | 'Twitter' | 'Instagram' | 'Google Ads' | 'Newsletter';
  status: 'draft' | 'scheduled' | 'active' | 'completed';
  impressionsSimulated: number;
  viralScore: number;
  content: string;
  generatedAssets: string[]; // Persisted creative asset URLs
}

export interface MarketingContext {
  campaigns: MarketingCampaign[];
  brandVoice: string;
  taglines: string[];
  targetKeywords: string[];
}

export interface SalesLead {
  id: string;
  companyName: string;
  contactEmail: string;
  status: 'discovered' | 'contacted' | 'proposal_sent' | 'closed_won' | 'closed_lost';
  value: number;
}

export interface SalesContext {
  leads: SalesLead[];
  activePipelineValue: number;
  proposalCount: number;
}

export interface CustomerContext {
  tickets: Array<{ id: string; title: string; sentiment: 'positive' | 'neutral' | 'negative'; status: 'open' | 'closed' }>;
  overallSentimentScore: number; // 0-100
  churnRiskIndex: number; // 0-100
}

export interface LegalContext {
  companyIncorporated: boolean;
  trademarkStatus: 'unfiled' | 'pending' | 'secured';
  riskRating: 'Low' | 'Medium' | 'High';
  generatedContracts: Array<{ id: string; type: 'NDA' | 'FounderAgreement' | 'ToS'; url: string }>;
}

export interface TechnicalContext {
  repoUrl?: string;
  commitHash?: string;
  buildStatus: 'idle' | 'building' | 'passed' | 'failed';
  buildLogs: string[];
  testSuiteStats: { passed: number; failed: number; coverage: number };
}

export interface StartupContext {
  workspaceId: string;
  companyName: string;
  founderProfile: FounderProfile;
  business: BusinessContext;
  product: ProductContext;
  financials: FinancialContext;
  marketing: MarketingContext;
  sales: SalesContext;
  customerSuccess: CustomerContext;
  legal: LegalContext;
  technical: TechnicalContext;
  updatedAt: string;
  pitchDeck?: Array<{ title: string; header: string; body: string }>;
}

export interface AgentMessage {
  messageId: string;
  parentId?: string;
  sender: string; // e.g., 'operations', 'research'
  recipient: string; // e.g., 'finance', 'all'
  action: string; // e.g., 'TAM_COMPILATION'
  payload: any;
  priority: 'Low' | 'Normal' | 'Critical';
  requiresApproval: boolean;
  approvalStatus: 'Pending' | 'Approved' | 'Rejected' | 'Auto-Approved';
  timestamp: string;
}

export interface ExecutionTask {
  id: string;
  title: string;
  department: string;
  status: 'pending' | 'inprogress' | 'completed' | 'failed';
  dependencies: string[];
  costImpact: number;
  confidenceScore: number;
  reasoning: string;
  risks: string[];
  suggestedNext: string[];
  durationEstimateMs: number;
  startedAt?: string;
  completedAt?: string;
}

export interface Conflict {
  id: string;
  partyA: string;
  partyB: string;
  topic: string;
  argumentsA: string;
  argumentsB: string;
  resolution?: string;
  status: 'active' | 'resolved';
  timestamp: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  details: string;
  timestamp: string;
}

export interface AgentRun {
  id: string;
  workspaceId: string;
  agent: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'awaiting_approval';
  traceId: string;
  citations: Array<{ title?: string; url: string }>;
  toolCalls: Array<{ name: string; status: 'requested' | 'approved' | 'rejected' | 'completed' | 'failed' }>;
  approvalIds: string[];
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  output?: unknown;
  error?: { code: string; message: string; retryable: boolean };
  createdAt: string;
  completedAt?: string;
}

export interface ToolApproval {
  id: string;
  workspaceId: string;
  runId: string;
  toolName: string;
  reason: string;
  input?: unknown;
  output?: unknown;
  executionError?: { code: string; message: string; retryable: boolean };
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

export interface MediaJob {
  id: string;
  workspaceId: string;
  kind: 'image' | 'image_edit' | 'video' | 'voiceover' | 'storyboard';
  provider: 'openai' | 'local';
  model: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'fallback';
  prompt?: string;
  providerJobId?: string;
  outputPaths: string[];
  output?: unknown;
  traceId: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  error?: { code: string; message: string; retryable: boolean };
  createdAt: string;
  updatedAt: string;
}
