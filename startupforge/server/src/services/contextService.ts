import { getBusinessProfile, getTeamMembers, getCoreFeatures, getUserPersonas } from '../db/database';

const redact = (value: unknown): string => String(value ?? '')
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
  .replace(/(?<!\d)(?:\+?91[-\s]?)?[6-9]\d{9}(?!\d)/g, '[REDACTED_PHONE]')
  .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, '[REDACTED_TAX_ID]')
  .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, '[REDACTED_ID]')
  .replace(/\b(?:sk|sess)-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED_API_KEY]')
  .replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/gi, '[REDACTED_BANK_CODE]')
  .replace(/\b(?:account|a\/c)\s*(?:number|no\.?|#)?\s*[:=-]?\s*\d{9,18}\b/gi, '[REDACTED_FINANCIAL_ID]')
  .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_TOKEN]');

function jsonList(value: unknown): string {
  try { return (JSON.parse(String(value || '[]')) as unknown[]).map(redact).join(', '); } catch { return ''; }
}

/** Deterministically compiles a privacy-filtered build specification locally. */
export async function compileBusinessContext(businessId: number, onProgress?: (chars: number) => void): Promise<string> {
  const business = getBusinessProfile(businessId) as any;
  if (!business) throw new Error(`Business profile ${businessId} not found`);
  const team = getTeamMembers(businessId) as any[];
  const features = getCoreFeatures(businessId) as any[];
  const personas = getUserPersonas(businessId) as any[];

  const context = `=== STARTUPFORGE PRIVACY-FILTERED BUILD CONTEXT ===
Business ID: ${businessId}
Generated: ${new Date().toISOString()}

COMPANY
- Name: ${redact(business.business_name)}
- Industry: ${redact(business.industry)}
- Stage: ${redact(business.stage)}

PROBLEM AND SOLUTION
- Problem: ${redact(business.problem_statement)}
- Solution: ${redact(business.solution)}
- Value proposition: ${redact(business.unique_value_prop)}
- Mission: ${redact(business.mission)}
- Vision: ${redact(business.vision)}

MARKET
- Target market: ${redact(business.target_market)}
- Market size: ${redact(business.market_size)}
- Revenue model: ${redact(business.revenue_model)}

TEAM ROLES (personal identities omitted)
${team.map((member, index) => `${index + 1}. ${redact(member.role)}; skills: ${jsonList(member.skills)}; responsibilities: ${jsonList(member.responsibilities)}`).join('\n') || '- None supplied'}

MVP FEATURES
${features.map((feature, index) => `${index + 1}. ${redact(feature.name)} [priority ${Number(feature.priority) || 1}] [${feature.is_mvp ? 'MVP' : 'later'}]: ${redact(feature.description)}`).join('\n') || '- None supplied'}

USER PERSONAS
${personas.map((persona, index) => `${index + 1}. ${redact(persona.description)}; pain points: ${jsonList(persona.pain_points)}`).join('\n') || '- None supplied'}

TECHNICAL PREFERENCES
- Frontend: ${redact(business.preferred_frontend)}
- Backend: ${redact(business.preferred_backend)}
- Database: ${redact(business.preferred_db)}
- Cloud: ${redact(business.preferred_cloud)}
- Design: ${redact(business.design_style)}
- Brand colors: ${jsonList(business.brand_colors)}
- Product type: ${redact(business.product_type)}
- Existing code: ${business.has_existing_code ? 'yes; extend without destructive replacement' : 'no; create a new project'}

Identity numbers, credentials, contacts, founder names, and precise locations are intentionally omitted.
=== END BUILD CONTEXT ===`;
  onProgress?.(context.length);
  return context;
}
