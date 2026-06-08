/**
 * EMBEDDING job handler (stub for Phase 1).
 * Phase 4 will replace this with an OpenAI embeddings API call.
 * @param {{ jobId: string, payload: object }} data
 */
export async function handleEmbeddingJob(data) {
    // Simulate work
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { stub: true, message: 'Embedding job stub — will call OpenAI in Phase 4', input: data.payload };
}
