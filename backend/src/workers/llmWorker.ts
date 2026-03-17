/**
 * LLM Background Worker (v8.0)
 *
 * Polls Oracle JOB_QUEUE for AI_EXTRACT tasks and processes them.
 * Orchestration stays in Oracle; Execution stays in Node.
 */

import { JOB_QUEUE_PKG } from '../services/db/job-queue-db.js';
import { llmService } from '../services/llm/LLMService.js';
import { logger } from '../utils/logger.js';
import { withConnection } from '../services/oracle-pool.js';

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '2', 10);
const POLL_INTERVAL_MS = 5000;

let shutdownRequested = false;

export async function startLlmWorker() {
  logger.info(`Starting LLM Worker (Concurrency: ${CONCURRENCY})`);

  // Handle graceful shutdown signals
  const onShutdown = () => {
    logger.info('Worker received shutdown signal, finishing current jobs...');
    shutdownRequested = true;
  };
  process.on('SIGTERM', onShutdown);
  process.on('SIGINT', onShutdown);

  while (!shutdownRequested) {
    try {
      // 1. Lease jobs from Oracle (Tenant-aware loop)
      const jobs = await leaseAvailableJobs();

      if (jobs.length === 0) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      // 2. Process concurrently
      await Promise.all(jobs.map(processJob));

    } catch (e: any) {
      logger.error('Worker loop crash', { error: e.message });
      if (!shutdownRequested) {
        await sleep(POLL_INTERVAL_MS * 2);
      }
    }
  }

  logger.info('Worker shutdown complete');
}

async function leaseAvailableJobs() {
  // Leases jobs across all tenants (passing null to lease_jobs as per spec)
  return JOB_QUEUE_PKG.leaseJobs(null, 'AI_EXTRACT', CONCURRENCY, 300, 'NODE_LLM_WORKER');
}

async function processJob(job: any) {
  const { jobId, tenantId, buId, payloadJson } = job;
  const payload = typeof payloadJson === 'string' ? JSON.parse(payloadJson) : payloadJson;

  try {
    logger.info(`Processing Job ${jobId}`, { tenantId, styleId: payload.styleId });

    // 1. Execute LLM Call
    const result = await llmService.extractAttributes({
      imageBase64: payload.image_base64 || payload.imageBase64,
      styleId: payload.style_id || payload.styleId,
      colorId: payload.color_id || payload.colorId,
      businessUnitId: buId
    });

    // 2. Complete Job
    await JOB_QUEUE_PKG.completeJob(jobId, JSON.stringify(result));

  } catch (e: any) {
    logger.error(`Job ${jobId} failed`, { error: e.message });
    await JOB_QUEUE_PKG.failJob(jobId, 'LLM_ERR', e.message);
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
