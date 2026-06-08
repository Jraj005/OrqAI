/**
 * DOCUMENT_PROCESS job handler (stub for Phase 1).
 * Phase 4 will replace this with real chunking + embedding dispatch.
 * @param {{ jobId: string, payload: object }} data
 */
export async function handleDocumentProcessJob(data) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { stub: true, message: 'Document process job stub — will chunk + enqueue embeddings in Phase 4', input: data.payload };
}
