import type { StartupContext } from 'orbit-core';

export function startupForgeProfileFromContext(context: StartupContext) {
  return {
    externalWorkspaceId: context.workspaceId,
    businessName: context.companyName, founderName: '', industry: context.business.niche,
    stage: context.business.stage, location: '', problemStatement: context.founderProfile.vision,
    solution: context.product.features.join(', '), mission: context.founderProfile.vision,
    vision: context.founderProfile.vision, uniqueValueProp: context.marketing.taglines[0] || '',
    productType: 'webapp', revenueModel: '', targetMarket: context.business.targetMarket,
    marketSize: context.business.tam || '', preferredFrontend: context.product.techStack.join(', ') || 'React + TypeScript',
    preferredBackend: 'Node.js', preferredDb: 'SQLite', preferredCloud: 'Vercel',
    designStyle: context.marketing.brandVoice, brandColors: [], githubRepoUrl: '', hasExistingCode: false,
  };
}
