import { withConnection } from '../oracle-pool.js';
import oracledb from 'oracledb';

export const JOB_QUEUE_PKG = {
  async leaseJobs(tenantId: string | null, jobType: string, limit: number, leaseSeconds: number, workerId: string) {
    return withConnection(async (conn) => {
      const result = await conn.execute(
        `BEGIN ATTR_MGR.JOB_QUEUE_PKG.lease_jobs(:tenant, :type, :limit, :lease, :worker, :rc); END;`,
        {
          tenant: tenantId,
          type: jobType,
          limit: limit,
          lease: leaseSeconds,
          worker: workerId,
          rc: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR }
        }
      );

      const resultSet = (result.outBinds as any).rc;
      const rows = [];
      let row;
      while ((row = await resultSet.getRow())) {
        // According to the V051 spec: JOB_ID, TENANT_ID, BUSINESS_UNIT_ID, PAYLOAD_JSON, ATTEMPT_COUNT
        rows.push({
          jobId: row.JOB_ID,
          tenantId: row.TENANT_ID,
          buId: row.BUSINESS_UNIT_ID,
          payloadJson: row.PAYLOAD_JSON,
          attemptCount: row.ATTEMPT_COUNT
        });
      }
      await resultSet.close();
      return rows;
    });
  },

  async completeJob(jobId: number, resultJson?: string) {
    return withConnection(async (conn) => {
      await conn.execute(
        `BEGIN ATTR_MGR.JOB_QUEUE_PKG.complete_job(:id, :res); END;`,
        { id: jobId, res: resultJson || null }
      );
      await conn.commit();
    });
  },

  async failJob(jobId: number, errorCode: string, errorMessage: string) {
    return withConnection(async (conn) => {
      await conn.execute(
        `BEGIN ATTR_MGR.JOB_QUEUE_PKG.fail_job(:id, :err, :msg); END;`,
        { id: jobId, err: errorCode, msg: errorMessage }
      );
      await conn.commit();
    });
  },

  async enqueueJob(tenantId: string, buId: number, type: string, payload: any, idempotencyKey: string) {
    return withConnection(async (conn) => {
      await conn.execute(
        `BEGIN ATTR_MGR.JOB_QUEUE_PKG.enqueue_job(:tenant, :bu, :type, :payload, :key); END;`,
        {
          tenant: tenantId,
          bu: buId,
          type: type,
          payload: JSON.stringify(payload),
          key: idempotencyKey
        }
      );
      await conn.commit();
    });
  }
};
