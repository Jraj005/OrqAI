/**
 * LLM job handler (stub for Phase 1).
 * Phase 5 will replace this with an actual LLM call.
 * @param {{ jobId: string, payload: object }} data
 */
export async function handleLlmJob(data) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { stub: true, message: 'LLM job stub — will call LLM in Phase 5', input: data.payload };
}
