import * as jobService from '../services/jobService.js';

export async function createJobHandler(req, reply) {
    try {
        const { job, created } = await jobService.createJob(req.body);
        return reply.status(created ? 201 : 200).send(job);
    } catch (err) {
        if (err.name === 'ZodError') {
            return reply.status(400).send({ error: 'Validation failed', details: err.issues });
        }
        throw err;
    }
}

export async function getJobByIdHandler(req, reply) {
    try {
        const job = await jobService.getJobById(req.params.id);
        return reply.send(job);
    } catch (err) {
        if (err.statusCode === 404) {
            return reply.status(404).send({ error: err.message });
        }
        throw err;
    }
}

export async function listJobsHandler(req, reply) {
    const jobs = await jobService.listJobs(req.query);
    return reply.send(jobs);
}

export async function retryJobHandler(req, reply) {
    try {
        const job = await jobService.retryJob(req.params.id);
        return reply.send(job);
    } catch (err) {
        if (err.statusCode === 404) {
            return reply.status(404).send({ error: err.message });
        }
        if (err.statusCode === 409) {
            return reply.status(409).send({ error: err.message });
        }
        throw err;
    }
}
