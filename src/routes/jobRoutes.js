import { createJobHandler, getJobByIdHandler, listJobsHandler, retryJobHandler } from '../controllers/jobController.js';

export async function jobRoutes(app) {
    app.post('/', createJobHandler);
    app.get('/', listJobsHandler);
    app.get('/:id', getJobByIdHandler);
    app.post('/:id/retry', retryJobHandler);
}
