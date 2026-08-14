const { tool } = require('@openai/agents');
const { z } = require('zod');

/**
 * Create a user-scoped OpenAI Agents SDK publishing tool.
 *
 * Native SDK approval is mandatory. Execution still only creates MultiVideo's
 * durable pending request; the authenticated approval route is the sole upload
 * executor.
 */
function createYouTubePublishTool({ requestApproval }) {
    if (typeof requestApproval !== 'function') {
        throw new TypeError('requestApproval callback is required');
    }
    return tool({
        name: 'request_youtube_publish',
        description: 'Request human review to publish an uploaded video to YouTube. This tool never uploads by itself.',
        parameters: z.object({
            videoId: z.string().min(1),
            privacyStatus: z.enum(['private', 'unlisted', 'public']).default('private'),
            reason: z.string().min(1).max(500)
        }),
        needsApproval: true,
        execute: async ({ videoId, privacyStatus, reason }) => {
            const approval = await requestApproval({ videoId, platforms: ['youtube'], privacyStatus, reason });
            return {
                approvalId: String(approval.approvalId),
                status: approval.status || 'pending',
                requiresHumanApproval: true,
                message: 'Nothing was published. Approve the pending request in MultiVideo.'
            };
        }
    });
}

module.exports = { createYouTubePublishTool };
