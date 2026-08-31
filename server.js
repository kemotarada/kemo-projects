// ======================================================
// KEMO PROJECTS SERVER V1.0
//
// Background Project Manager
//
// Purpose:
// - Create real Kemo projects
// - Queue work for background workers
// - Track real progress
// - Track current task
// - Track timeline/events
// - Track worker heartbeat
// - Track preview / screenshot state
// - Never fake "working" status
//
// Future workers:
// - Research Agent
// - Design Agent
// - Website Builder
// - QA Agent
// - Deployment Agent
//
// Safety:
// - No shell execution here
// - No direct PC control here
// - Authenticated internal API only
// ======================================================

import express from "express";
import pg from "pg";
import crypto from "node:crypto";

const { Pool } = pg;


// ======================================================
// ENV
// ======================================================

const PORT = Number(
  process.env.PORT || 3000
);

const DATABASE_URL = String(
  process.env.DATABASE_URL || ""
).trim();

const KEMO_PROJECTS_KEY = String(
  process.env.KEMO_PROJECTS_KEY || ""
).trim();

const TELEGRAM_ALLOWED_USER_ID = String(
  process.env.TELEGRAM_ALLOWED_USER_ID || ""
).trim();


// ======================================================
// DATABASE
// ======================================================

const pool = new Pool({
  connectionString: DATABASE_URL,

  max: 8,

  idleTimeoutMillis: 30000,

  connectionTimeoutMillis: 10000
});


// ======================================================
// EXPRESS
// ======================================================

const app = express();

app.disable(
  "x-powered-by"
);

app.use(
  express.json({
    limit: "4mb"
  })
);


// ======================================================
// HELPERS
// ======================================================

function cleanText(
  value,
  maxLength = 10000
) {
  return String(
    value ?? ""
  )
    .replace(/\u0000/g, "")
    .trim()
    .slice(
      0,
      maxLength
    );
}


function safeInteger(
  value,
  fallback = 0
) {
  const number = Number(
    value
  );

  if (
    !Number.isFinite(number)
  ) {
    return fallback;
  }

  return Math.trunc(
    number
  );
}


function clamp(
  value,
  min,
  max
) {
  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );
}


function nowIso() {
  return new Date()
    .toISOString();
}


function createId() {
  return crypto.randomUUID();
}


function safeEqual(
  first,
  second
) {
  const a = Buffer.from(
    String(first || "")
  );

  const b = Buffer.from(
    String(second || "")
  );

  if (
    !a.length
    ||
    a.length !== b.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    a,
    b
  );
}


function getApiKey(
  req
) {
  return cleanText(
    req.headers[
      "x-kemo-projects-key"
    ],
    1000
  );
}


function requireApiKey(
  req,
  res,
  next
) {
  if (
    !KEMO_PROJECTS_KEY
  ) {
    return res
      .status(503)
      .json({
        ok: false,
        error:
          "KEMO_PROJECTS_KEY is not configured"
      });
  }

  if (
    !safeEqual(
      getApiKey(req),
      KEMO_PROJECTS_KEY
    )
  ) {
    return res
      .status(401)
      .json({
        ok: false,
        error:
          "Unauthorized"
      });
  }

  next();
}


function resolveUserId(
  value
) {
  const requested = cleanText(
    value,
    40
  );

  if (
    TELEGRAM_ALLOWED_USER_ID
  ) {
    if (
      requested
      &&
      requested !==
        TELEGRAM_ALLOWED_USER_ID
    ) {
      throw new Error(
        "Unauthorized user"
      );
    }

    return TELEGRAM_ALLOWED_USER_ID;
  }

  if (
    !requested
    ||
    !/^\d+$/.test(
      requested
    )
  ) {
    throw new Error(
      "Valid userId required"
    );
  }

  return requested;
}


// ======================================================
// DATABASE INIT
// ======================================================

async function initDatabase() {

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kemo_projects (
      id UUID PRIMARY KEY,

      user_id BIGINT NOT NULL,

      project_type TEXT NOT NULL DEFAULT 'website',

      name TEXT NOT NULL,

      brief TEXT NOT NULL DEFAULT '',

      status TEXT NOT NULL DEFAULT 'queued',

      stage TEXT NOT NULL DEFAULT 'intake',

      progress INTEGER NOT NULL DEFAULT 0,

      current_task TEXT NOT NULL DEFAULT '',

      last_completed TEXT NOT NULL DEFAULT '',

      worker_id TEXT,

      local_path TEXT,

      repo_url TEXT,

      preview_url TEXT,

      production_url TEXT,

      last_screenshot_path TEXT,

      last_error TEXT,

      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

      started_at TIMESTAMPTZ,

      completed_at TIMESTAMPTZ,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);


  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_kemo_projects_user_updated
    ON kemo_projects(
      user_id,
      updated_at DESC
    );
  `);


  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_kemo_projects_status
    ON kemo_projects(
      status,
      updated_at DESC
    );
  `);


  await pool.query(`
    CREATE TABLE IF NOT EXISTS kemo_project_events (
      id BIGSERIAL PRIMARY KEY,

      project_id UUID NOT NULL
        REFERENCES kemo_projects(id)
        ON DELETE CASCADE,

      event_type TEXT NOT NULL,

      stage TEXT NOT NULL DEFAULT '',

      message TEXT NOT NULL,

      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);


  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_kemo_project_events_project
    ON kemo_project_events(
      project_id,
      created_at DESC
    );
  `);


  await pool.query(`
    CREATE TABLE IF NOT EXISTS kemo_project_jobs (
      id UUID PRIMARY KEY,

      project_id UUID NOT NULL
        REFERENCES kemo_projects(id)
        ON DELETE CASCADE,

      job_type TEXT NOT NULL,

      payload JSONB NOT NULL DEFAULT '{}'::jsonb,

      priority INTEGER NOT NULL DEFAULT 100,

      status TEXT NOT NULL DEFAULT 'pending',

      worker_id TEXT,

      attempts INTEGER NOT NULL DEFAULT 0,

      max_attempts INTEGER NOT NULL DEFAULT 3,

      locked_at TIMESTAMPTZ,

      started_at TIMESTAMPTZ,

      completed_at TIMESTAMPTZ,

      last_error TEXT,

      result JSONB NOT NULL DEFAULT '{}'::jsonb,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);


  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_kemo_project_jobs_queue
    ON kemo_project_jobs(
      status,
      priority DESC,
      created_at ASC
    );
  `);


  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_kemo_project_jobs_project
    ON kemo_project_jobs(
      project_id,
      created_at DESC
    );
  `);


  await pool.query(`
    CREATE TABLE IF NOT EXISTS kemo_project_workers (
      worker_id TEXT PRIMARY KEY,

      computer TEXT NOT NULL DEFAULT '',

      status TEXT NOT NULL DEFAULT 'online',

      current_project_id UUID,

      capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,

      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);


  console.log(
    "✅ Kemo Projects database ready"
  );
}


// ======================================================
// PROJECT EVENT
// ======================================================

async function addProjectEvent(
  projectId,
  eventType,
  message,
  {
    stage = "",
    metadata = {}
  } = {}
) {

  await pool.query(
    `
    INSERT INTO kemo_project_events
    (
      project_id,
      event_type,
      stage,
      message,
      metadata
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5::jsonb
    )
    `,
    [
      projectId,

      cleanText(
        eventType,
        100
      ),

      cleanText(
        stage,
        100
      ),

      cleanText(
        message,
        5000
      ),

      JSON.stringify(
        metadata || {}
      )
    ]
  );
}


// ======================================================
// GET PROJECT
// ======================================================

async function getProject(
  projectId
) {

  const result =
    await pool.query(
      `
      SELECT *
      FROM kemo_projects
      WHERE id = $1
      LIMIT 1
      `,
      [
        projectId
      ]
    );

  return result.rows[0]
    || null;
}


// ======================================================
// ROOT
// ======================================================

app.get(
  "/",
  (
    req,
    res
  ) => {
    res
      .type(
        "text/plain"
      )
      .send(
        "Kemo Projects V1.0 is online."
      );
  }
);


// ======================================================
// HEALTH
// ======================================================

app.get(
  "/api/health",
  async (
    req,
    res
  ) => {

    try {
      await pool.query(
        "SELECT 1"
      );

      const [
        workers,
        jobs,
        projects
      ] =
        await Promise.all([

          pool.query(`
            SELECT COUNT(*)::int AS count
            FROM kemo_project_workers
            WHERE last_seen_at >
              NOW() - INTERVAL '30 seconds'
          `),

          pool.query(`
            SELECT COUNT(*)::int AS count
            FROM kemo_project_jobs
            WHERE status = 'pending'
          `),

          pool.query(`
            SELECT COUNT(*)::int AS count
            FROM kemo_projects
            WHERE status IN (
              'queued',
              'working',
              'reviewing'
            )
          `)

        ]);

      res.json({
        ok: true,

        service:
          "kemo-projects",

        version:
          "1.0",

        database:
          "ready",

        activeWorkers:
          workers.rows[0]
            ?.count
          || 0,

        pendingJobs:
          jobs.rows[0]
            ?.count
          || 0,

        activeProjects:
          projects.rows[0]
            ?.count
          || 0,

        backgroundProjects:
          true,

        realProgressTracking:
          true,

        workerHeartbeat:
          true,

        eventTimeline:
          true,

        fakeWorkingStatus:
          false,

        serverTime:
          nowIso()
      });

    } catch (error) {

      res
        .status(500)
        .json({
          ok: false,

          error:
            error.message
        });
    }
  }
);


// ======================================================
// CREATE PROJECT
// ======================================================

app.post(
  "/api/projects",
  requireApiKey,
  async (
    req,
    res
  ) => {

    const client =
      await pool.connect();

    try {
      const userId =
        resolveUserId(
          req.body?.userId
        );

      const name =
        cleanText(
          req.body?.name,
          300
        );

      const brief =
        cleanText(
          req.body?.brief,
          30000
        );

      const projectType =
        cleanText(
          req.body?.projectType
          ||
          "website",
          100
        );

      if (
        !name
      ) {
        throw new Error(
          "Project name required"
        );
      }

      const projectId =
        createId();

      const jobId =
        createId();

      const metadata =
        (
          req.body?.metadata
          &&
          typeof req.body.metadata ===
            "object"
          &&
          !Array.isArray(
            req.body.metadata
          )
        )
          ?
          req.body.metadata
          :
          {};

      await client.query(
        "BEGIN"
      );


      await client.query(
        `
        INSERT INTO kemo_projects
        (
          id,
          user_id,
          project_type,
          name,
          brief,
          status,
          stage,
          progress,
          current_task,
          metadata
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          'queued',
          'intake',
          0,
          'Waiting for Kemo Project Worker',
          $6::jsonb
        )
        `,
        [
          projectId,
          userId,
          projectType,
          name,
          brief,
          JSON.stringify(
            metadata
          )
        ]
      );


      await client.query(
        `
        INSERT INTO kemo_project_events
        (
          project_id,
          event_type,
          stage,
          message,
          metadata
        )
        VALUES (
          $1,
          'project_created',
          'intake',
          $2,
          '{}'::jsonb
        )
        `,
        [
          projectId,
          `Project created: ${name}`
        ]
      );


      await client.query(
        `
        INSERT INTO kemo_project_jobs
        (
          id,
          project_id,
          job_type,
          payload,
          priority,
          status
        )
        VALUES (
          $1,
          $2,
          'project_initialize',
          $3::jsonb,
          100,
          'pending'
        )
        `,
        [
          jobId,
          projectId,

          JSON.stringify({
            projectId,
            userId,
            projectType,
            name,
            brief,
            metadata
          })
        ]
      );


      await client.query(
        "COMMIT"
      );


      res.json({
        ok: true,

        projectId,

        jobId,

        status:
          "queued",

        stage:
          "intake",

        progress:
          0
      });

    } catch (error) {

      try {
        await client.query(
          "ROLLBACK"
        );
      } catch {}

      res
        .status(400)
        .json({
          ok: false,

          error:
            error.message
        });

    } finally {

      client.release();
    }
  }
);


// ======================================================
// LIST PROJECTS
// ======================================================

app.get(
  "/api/projects",
  requireApiKey,
  async (
    req,
    res
  ) => {

    try {
      const userId =
        resolveUserId(
          req.query?.userId
        );

      const result =
        await pool.query(
          `
          SELECT *
          FROM kemo_projects
          WHERE user_id = $1
          ORDER BY updated_at DESC
          LIMIT 100
          `,
          [
            userId
          ]
        );

      res.json({
        ok: true,

        projects:
          result.rows
      });

    } catch (error) {

      res
        .status(400)
        .json({
          ok: false,

          error:
            error.message
        });
    }
  }
);


// ======================================================
// PROJECT DETAILS
// ======================================================

app.get(
  "/api/projects/:projectId",
  requireApiKey,
  async (
    req,
    res
  ) => {

    try {
      const project =
        await getProject(
          req.params.projectId
        );

      if (
        !project
      ) {
        return res
          .status(404)
          .json({
            ok: false,

            error:
              "Project not found"
          });
      }

      res.json({
        ok: true,

        project
      });

    } catch (error) {

      res
        .status(400)
        .json({
          ok: false,

          error:
            error.message
        });
    }
  }
);


// ======================================================
// PROJECT EVENTS
// ======================================================

app.get(
  "/api/projects/:projectId/events",
  requireApiKey,
  async (
    req,
    res
  ) => {

    try {
      const result =
        await pool.query(
          `
          SELECT *
          FROM kemo_project_events
          WHERE project_id = $1
          ORDER BY created_at DESC
          LIMIT 200
          `,
          [
            req.params.projectId
          ]
        );

      res.json({
        ok: true,

        events:
          result.rows
      });

    } catch (error) {

      res
        .status(400)
        .json({
          ok: false,

          error:
            error.message
        });
    }
  }
);


// ======================================================
// PROJECT REPORT
//
// This is what Telegram will use when Karim asks:
// "وين وصلت؟"
// ======================================================

app.get(
  "/api/projects/:projectId/report",
  requireApiKey,
  async (
    req,
    res
  ) => {

    try {
      const project =
        await getProject(
          req.params.projectId
        );

      if (
        !project
      ) {
        return res
          .status(404)
          .json({
            ok: false,

            error:
              "Project not found"
          });
      }


      const [
        events,
        jobs,
        worker
      ] =
        await Promise.all([

          pool.query(
            `
            SELECT
              event_type,
              stage,
              message,
              metadata,
              created_at
            FROM kemo_project_events
            WHERE project_id = $1
            ORDER BY created_at DESC
            LIMIT 40
            `,
            [
              project.id
            ]
          ),

          pool.query(
            `
            SELECT
              id,
              job_type,
              status,
              worker_id,
              attempts,
              started_at,
              completed_at,
              last_error,
              updated_at
            FROM kemo_project_jobs
            WHERE project_id = $1
            ORDER BY created_at DESC
            LIMIT 30
            `,
            [
              project.id
            ]
          ),

          project.worker_id
            ?
            pool.query(
              `
              SELECT *
              FROM kemo_project_workers
              WHERE worker_id = $1
              LIMIT 1
              `,
              [
                project.worker_id
              ]
            )
            :
            Promise.resolve({
              rows: []
            })

        ]);


      const workerRow =
        worker.rows[0]
        ||
        null;

      let workerOnline =
        false;

      if (
        workerRow?.last_seen_at
      ) {
        workerOnline =
          (
            Date.now()
            -
            new Date(
              workerRow.last_seen_at
            ).getTime()
          )
          <
          30000;
      }


      res.json({
        ok: true,

        project,

        worker: {
          online:
            workerOnline,

          info:
            workerRow
        },

        jobs:
          jobs.rows,

        recentEvents:
          events.rows,

        proof: {
          workerOnline,

          lastActivity:
            project.updated_at,

          lastScreenshotPath:
            project.last_screenshot_path,

          previewUrl:
            project.preview_url,

          productionUrl:
            project.production_url
        }
      });

    } catch (error) {

      res
        .status(400)
        .json({
          ok: false,

          error:
            error.message
        });
    }
  }
);


// ======================================================
// ADD JOB
// ======================================================

app.post(
  "/api/projects/:projectId/jobs",
  requireApiKey,
  async (
    req,
    res
  ) => {

    try {
      const project =
        await getProject(
          req.params.projectId
        );

      if (
        !project
      ) {
        throw new Error(
          "Project not found"
        );
      }

      const jobType =
        cleanText(
          req.body?.jobType,
          150
        );

      if (
        !jobType
      ) {
        throw new Error(
          "jobType required"
        );
      }

      const payload =
        (
          req.body?.payload
          &&
          typeof req.body.payload ===
            "object"
          &&
          !Array.isArray(
            req.body.payload
          )
        )
          ?
          req.body.payload
          :
          {};

      const priority =
        clamp(
          safeInteger(
            req.body?.priority,
            100
          ),
          1,
          1000
        );

      const jobId =
        createId();


      await pool.query(
        `
        INSERT INTO kemo_project_jobs
        (
          id,
          project_id,
          job_type,
          payload,
          priority,
          status
        )
        VALUES (
          $1,
          $2,
          $3,
          $4::jsonb,
          $5,
          'pending'
        )
        `,
        [
          jobId,
          project.id,
          jobType,
          JSON.stringify(
            payload
          ),
          priority
        ]
      );


      await addProjectEvent(
        project.id,
        "job_queued",
        `Queued job: ${jobType}`,
        {
          stage:
            project.stage,

          metadata: {
            jobId
          }
        }
      );


      res.json({
        ok: true,

        jobId,

        status:
          "pending"
      });

    } catch (error) {

      res
        .status(400)
        .json({
          ok: false,

          error:
            error.message
        });
    }
  }
);


// ======================================================
// WORKER HEARTBEAT
// ======================================================

app.post(
  "/api/worker/heartbeat",
  requireApiKey,
  async (
    req,
    res
  ) => {

    try {
      const workerId =
        cleanText(
          req.body?.workerId,
          200
        );

      if (
        !workerId
      ) {
        throw new Error(
          "workerId required"
        );
      }

      const computer =
        cleanText(
          req.body?.computer,
          300
        );

      const currentProjectId =
        cleanText(
          req.body?.currentProjectId,
          100
        )
        ||
        null;

      const capabilities =
        Array.isArray(
          req.body?.capabilities
        )
          ?
          req.body.capabilities
            .slice(
              0,
              100
            )
          :
          [];

      const metadata =
        (
          req.body?.metadata
          &&
          typeof req.body.metadata ===
            "object"
          &&
          !Array.isArray(
            req.body.metadata
          )
        )
          ?
          req.body.metadata
          :
          {};


      await pool.query(
        `
        INSERT INTO kemo_project_workers
        (
          worker_id,
          computer,
          status,
          current_project_id,
          capabilities,
          metadata,
          last_seen_at
        )
        VALUES (
          $1,
          $2,
          'online',
          $3,
          $4::jsonb,
          $5::jsonb,
          NOW()
        )

        ON CONFLICT(worker_id)

        DO UPDATE SET
          computer =
            EXCLUDED.computer,

          status =
            'online',

          current_project_id =
            EXCLUDED.current_project_id,

          capabilities =
            EXCLUDED.capabilities,

          metadata =
            EXCLUDED.metadata,

          last_seen_at =
            NOW(),

          updated_at =
            NOW()
        `,
        [
          workerId,
          computer,
          currentProjectId,
          JSON.stringify(
            capabilities
          ),
          JSON.stringify(
            metadata
          )
        ]
      );


      res.json({
        ok: true,

        serverTime:
          nowIso()
      });

    } catch (error) {

      res
        .status(400)
        .json({
          ok: false,

          error:
            error.message
        });
    }
  }
);


// ======================================================
// CLAIM NEXT JOB
//
// Worker calls this continuously.
// PostgreSQL SKIP LOCKED prevents duplicate claims.
// ======================================================

app.post(
  "/api/worker/next-job",
  requireApiKey,
  async (
    req,
    res
  ) => {

    const client =
      await pool.connect();

    try {
      const workerId =
        cleanText(
          req.body?.workerId,
          200
        );

      if (
        !workerId
      ) {
        throw new Error(
          "workerId required"
        );
      }


      await client.query(
        "BEGIN"
      );


      const selected =
        await client.query(
          `
          SELECT
            j.*,

            p.user_id,
            p.project_type,
            p.name AS project_name,
            p.brief AS project_brief,
            p.metadata AS project_metadata

          FROM kemo_project_jobs j

          JOIN kemo_projects p
            ON p.id =
              j.project_id

          WHERE
            j.status = 'pending'

            AND j.attempts <
              j.max_attempts

            AND p.status NOT IN (
              'completed',
              'cancelled'
            )

          ORDER BY
            j.priority DESC,
            j.created_at ASC

          FOR UPDATE
          OF j
          SKIP LOCKED

          LIMIT 1
          `
        );


      if (
        !selected.rows.length
      ) {

        await client.query(
          "COMMIT"
        );

        return res.json({
          ok: true,

          job:
            null
        });
      }


      const job =
        selected.rows[0];


      const updatedJob =
        await client.query(
          `
          UPDATE kemo_project_jobs

          SET
            status =
              'working',

            worker_id =
              $2,

            attempts =
              attempts + 1,

            locked_at =
              NOW(),

            started_at =
              COALESCE(
                started_at,
                NOW()
              ),

            updated_at =
              NOW()

          WHERE id = $1

          RETURNING *
          `,
          [
            job.id,
            workerId
          ]
        );


      await client.query(
        `
        UPDATE kemo_projects

        SET
          status =
            'working',

          worker_id =
            $2,

          current_task =
            $3,

          started_at =
            COALESCE(
              started_at,
              NOW()
            ),

          updated_at =
            NOW()

        WHERE id = $1
        `,
        [
          job.project_id,
          workerId,
          job.job_type
        ]
      );


      await client.query(
        `
        INSERT INTO kemo_project_events
        (
          project_id,
          event_type,
          stage,
          message,
          metadata
        )
        VALUES (
          $1,
          'job_started',
          '',
          $2,
          $3::jsonb
        )
        `,
        [
          job.project_id,

          `Worker started: ${job.job_type}`,

          JSON.stringify({
            workerId,

            jobId:
              job.id
          })
        ]
      );


      await client.query(
        "COMMIT"
      );


      res.json({
        ok: true,

        job: {
          ...updatedJob.rows[0],

          userId:
            String(
              job.user_id
            ),

          projectType:
            job.project_type,

          projectName:
            job.project_name,

          projectBrief:
            job.project_brief,

          projectMetadata:
            job.project_metadata
        }
      });

    } catch (error) {

      try {
        await client.query(
          "ROLLBACK"
        );
      } catch {}


      res
        .status(400)
        .json({
          ok: false,

          error:
            error.message
        });

    } finally {

      client.release();
    }
  }
);


// ======================================================
// PROJECT PROGRESS
//
// Real worker uses this.
// This becomes Telegram's source of truth.
// ======================================================

app.post(
  "/api/projects/:projectId/progress",
  requireApiKey,
  async (
    req,
    res
  ) => {

    try {
      const project =
        await getProject(
          req.params.projectId
        );

      if (
        !project
      ) {
        throw new Error(
          "Project not found"
        );
      }


      const progress =
        req.body?.progress ===
          undefined
          ?
          null
          :
          clamp(
            safeInteger(
              req.body.progress,
              project.progress
            ),
            0,
            100
          );


      const stage =
        req.body?.stage ===
          undefined
          ?
          null
          :
          cleanText(
            req.body.stage,
            100
          );


      const status =
        req.body?.status ===
          undefined
          ?
          null
          :
          cleanText(
            req.body.status,
            100
          );


      const currentTask =
        req.body?.currentTask ===
          undefined
          ?
          null
          :
          cleanText(
            req.body.currentTask,
            2000
          );


      const lastCompleted =
        req.body?.lastCompleted ===
          undefined
          ?
          null
          :
          cleanText(
            req.body.lastCompleted,
            2000
          );


      const previewUrl =
        req.body?.previewUrl ===
          undefined
          ?
          null
          :
          cleanText(
            req.body.previewUrl,
            3000
          );


      const screenshotPath =
        req.body?.screenshotPath ===
          undefined
          ?
          null
          :
          cleanText(
            req.body.screenshotPath,
            3000
          );


      const localPath =
        req.body?.localPath ===
          undefined
          ?
          null
          :
          cleanText(
            req.body.localPath,
            3000
          );


      const repoUrl =
        req.body?.repoUrl ===
          undefined
          ?
          null
          :
          cleanText(
            req.body.repoUrl,
            3000
          );


      const metadata =
        (
          req.body?.metadata
          &&
          typeof req.body.metadata ===
            "object"
          &&
          !Array.isArray(
            req.body.metadata
          )
        )
          ?
          req.body.metadata
          :
          null;


      const updated =
        await pool.query(
          `
          UPDATE kemo_projects

          SET
            progress =
              COALESCE(
                $2,
                progress
              ),

            stage =
              COALESCE(
                $3,
                stage
              ),

            status =
              COALESCE(
                $4,
                status
              ),

            current_task =
              COALESCE(
                $5,
                current_task
              ),

            last_completed =
              COALESCE(
                $6,
                last_completed
              ),

            preview_url =
              COALESCE(
                $7,
                preview_url
              ),

            last_screenshot_path =
              COALESCE(
                $8,
                last_screenshot_path
              ),

            local_path =
              COALESCE(
                $9,
                local_path
              ),

            repo_url =
              COALESCE(
                $10,
                repo_url
              ),

            metadata =
              CASE
                WHEN $11::jsonb IS NULL
                  THEN metadata
                ELSE
                  metadata
                  ||
                  $11::jsonb
              END,

            last_error =
              NULL,

            updated_at =
              NOW()

          WHERE id = $1

          RETURNING *
          `,
          [
            project.id,

            progress,

            stage,

            status,

            currentTask,

            lastCompleted,

            previewUrl,

            screenshotPath,

            localPath,

            repoUrl,

            metadata
              ?
              JSON.stringify(
                metadata
              )
              :
              null
          ]
        );


      const message =
        cleanText(
          req.body?.message,
          5000
        )
        ||
        (
          currentTask
          ?
          `Working: ${currentTask}`
          :
          "Project progress updated"
        );


      await addProjectEvent(
        project.id,
        "progress",
        message,
        {
          stage:
            stage
            ||
            updated.rows[0].stage,

          metadata: {
            progress:
              updated.rows[0]
                .progress,

            currentTask:
              updated.rows[0]
                .current_task,

            lastCompleted:
              updated.rows[0]
                .last_completed
          }
        }
      );


      res.json({
        ok: true,

        project:
          updated.rows[0]
      });

    } catch (error) {

      res
        .status(400)
        .json({
          ok: false,

          error:
            error.message
        });
    }
  }
);


// ======================================================
// JOB COMPLETE
// ======================================================

app.post(
  "/api/jobs/:jobId/complete",
  requireApiKey,
  async (
    req,
    res
  ) => {

    const client =
      await pool.connect();

    try {
      const workerId =
        cleanText(
          req.body?.workerId,
          200
        );

      if (
        !workerId
      ) {
        throw new Error(
          "workerId required"
        );
      }


      await client.query(
        "BEGIN"
      );


      const jobResult =
        await client.query(
          `
          UPDATE kemo_project_jobs

          SET
            status =
              'completed',

            result =
              $3::jsonb,

            completed_at =
              NOW(),

            updated_at =
              NOW()

          WHERE
            id = $1

            AND worker_id = $2

            AND status =
              'working'

          RETURNING *
          `,
          [
            req.params.jobId,

            workerId,

            JSON.stringify(
              (
                req.body?.result
                &&
                typeof req.body.result ===
                  "object"
              )
                ?
                req.body.result
                :
                {}
            )
          ]
        );


      if (
        !jobResult.rows.length
      ) {
        throw new Error(
          "Working job not found"
        );
      }


      const job =
        jobResult.rows[0];


      await client.query(
        `
        UPDATE kemo_projects

        SET
          last_completed =
            $2,

          current_task =
            '',

          updated_at =
            NOW()

        WHERE id = $1
        `,
        [
          job.project_id,

          cleanText(
            req.body?.completedMessage
            ||
            job.job_type,
            2000
          )
        ]
      );


      await client.query(
        `
        INSERT INTO kemo_project_events
        (
          project_id,
          event_type,
          stage,
          message,
          metadata
        )
        VALUES (
          $1,
          'job_completed',
          '',
          $2,
          $3::jsonb
        )
        `,
        [
          job.project_id,

          cleanText(
            req.body?.completedMessage
            ||
            `Completed: ${job.job_type}`,
            5000
          ),

          JSON.stringify({
            jobId:
              job.id,

            workerId
          })
        ]
      );


      await client.query(
        "COMMIT"
      );


      res.json({
        ok: true,

        job:
          jobResult.rows[0]
      });

    } catch (error) {

      try {
        await client.query(
          "ROLLBACK"
        );
      } catch {}


      res
        .status(400)
        .json({
          ok: false,

          error:
            error.message
        });

    } finally {

      client.release();
    }
  }
);


// ======================================================
// JOB FAILED
// ======================================================

app.post(
  "/api/jobs/:jobId/fail",
  requireApiKey,
  async (
    req,
    res
  ) => {

    const client =
      await pool.connect();

    try {
      const workerId =
        cleanText(
          req.body?.workerId,
          200
        );

      const errorText =
        cleanText(
          req.body?.error,
          5000
        )
        ||
        "Unknown worker error";


      await client.query(
        "BEGIN"
      );


      const current =
        await client.query(
          `
          SELECT *
          FROM kemo_project_jobs
          WHERE
            id = $1
            AND worker_id = $2
          FOR UPDATE
          `,
          [
            req.params.jobId,
            workerId
          ]
        );


      if (
        !current.rows.length
      ) {
        throw new Error(
          "Job not found"
        );
      }


      const job =
        current.rows[0];


      const permanentFailure =
        Number(
          job.attempts
        )
        >=
        Number(
          job.max_attempts
        );


      const nextStatus =
        permanentFailure
          ?
          "failed"
          :
          "pending";


      await client.query(
        `
        UPDATE kemo_project_jobs

        SET
          status =
            $3,

          last_error =
            $4,

          worker_id =
            CASE
              WHEN $3 =
                'pending'
                THEN NULL
              ELSE worker_id
            END,

          locked_at =
            CASE
              WHEN $3 =
                'pending'
                THEN NULL
              ELSE locked_at
            END,

          updated_at =
            NOW()

        WHERE
          id = $1
          AND worker_id = $2
        `,
        [
          job.id,
          workerId,
          nextStatus,
          errorText
        ]
      );


      if (
        permanentFailure
      ) {

        await client.query(
          `
          UPDATE kemo_projects

          SET
            status =
              'blocked',

            last_error =
              $2,

            current_task =
              '',

            updated_at =
              NOW()

          WHERE id = $1
          `,
          [
            job.project_id,
            errorText
          ]
        );

      } else {

        await client.query(
          `
          UPDATE kemo_projects

          SET
            last_error =
              $2,

            updated_at =
              NOW()

          WHERE id = $1
          `,
          [
            job.project_id,
            errorText
          ]
        );
      }


      await client.query(
        `
        INSERT INTO kemo_project_events
        (
          project_id,
          event_type,
          stage,
          message,
          metadata
        )
        VALUES (
          $1,
          $2,
          '',
          $3,
          $4::jsonb
        )
        `,
        [
          job.project_id,

          permanentFailure
            ?
            "job_failed"
            :
            "job_retry",

          errorText,

          JSON.stringify({
            jobId:
              job.id,

            workerId,

            attempts:
              job.attempts,

            maxAttempts:
              job.max_attempts
          })
        ]
      );


      await client.query(
        "COMMIT"
      );


      res.json({
        ok: true,

        permanentFailure,

        status:
          nextStatus
      });

    } catch (error) {

      try {
        await client.query(
          "ROLLBACK"
        );
      } catch {}


      res
        .status(400)
        .json({
          ok: false,

          error:
            error.message
        });

    } finally {

      client.release();
    }
  }
);


// ======================================================
// COMPLETE PROJECT
// ======================================================

app.post(
  "/api/projects/:projectId/complete",
  requireApiKey,
  async (
    req,
    res
  ) => {

    try {
      const productionUrl =
        cleanText(
          req.body?.productionUrl,
          3000
        );

      const previewUrl =
        cleanText(
          req.body?.previewUrl,
          3000
        );

      const screenshotPath =
        cleanText(
          req.body?.screenshotPath,
          3000
        );


      const result =
        await pool.query(
          `
          UPDATE kemo_projects

          SET
            status =
              'completed',

            stage =
              'completed',

            progress =
              100,

            current_task =
              '',

            last_completed =
              COALESCE(
                NULLIF(
                  $2,
                  ''
                ),
                last_completed
              ),

            production_url =
              COALESCE(
                NULLIF(
                  $3,
                  ''
                ),
                production_url
              ),

            preview_url =
              COALESCE(
                NULLIF(
                  $4,
                  ''
                ),
                preview_url
              ),

            last_screenshot_path =
              COALESCE(
                NULLIF(
                  $5,
                  ''
                ),
                last_screenshot_path
              ),

            last_error =
              NULL,

            completed_at =
              NOW(),

            updated_at =
              NOW()

          WHERE id = $1

          RETURNING *
          `,
          [
            req.params.projectId,

            cleanText(
              req.body?.message,
              2000
            ),

            productionUrl,

            previewUrl,

            screenshotPath
          ]
        );


      if (
        !result.rows.length
      ) {
        throw new Error(
          "Project not found"
        );
      }


      await addProjectEvent(
        req.params.projectId,
        "project_completed",
        cleanText(
          req.body?.message,
          5000
        )
        ||
        "Project completed",
        {
          stage:
            "completed",

          metadata: {
            productionUrl,
            previewUrl
          }
        }
      );


      res.json({
        ok: true,

        project:
          result.rows[0]
      });

    } catch (error) {

      res
        .status(400)
        .json({
          ok: false,

          error:
            error.message
        });
    }
  }
);


// ======================================================
// START
// ======================================================

async function start() {

  const missing = [];

  if (
    !DATABASE_URL
  ) {
    missing.push(
      "DATABASE_URL"
    );
  }

  if (
    !KEMO_PROJECTS_KEY
  ) {
    missing.push(
      "KEMO_PROJECTS_KEY"
    );
  }

  if (
    missing.length
  ) {
    console.error(
      (
        "❌ Missing variables: "
        +
        missing.join(
          ", "
        )
      )
    );

    process.exit(
      1
    );
  }


  try {

    await initDatabase();


    app.listen(
      PORT,
      "0.0.0.0",
      () => {

        console.log("");
        console.log(
          "======================================="
        );
        console.log(
          " KEMO PROJECTS SERVER V1.0"
        );
        console.log(
          " BACKGROUND PROJECT MANAGER"
        );
        console.log(
          "======================================="
        );
        console.log("");

        console.log(
          `✅ Port: ${PORT}`
        );

        console.log(
          "✅ PostgreSQL: ready"
        );

        console.log(
          "✅ Real project queue"
        );

        console.log(
          "✅ Worker heartbeat tracking"
        );

        console.log(
          "✅ Real progress tracking"
        );

        console.log(
          "✅ Project timeline"
        );

        console.log(
          "✅ Screenshot state tracking"
        );

        console.log(
          "✅ Preview / production URL tracking"
        );

        console.log(
          "✅ Retry + error tracking"
        );

        console.log(
          "🛡️ Internal authenticated API"
        );

        console.log(
          "🚫 Fake working status disabled"
        );

        console.log("");
      }
    );

  } catch (error) {

    console.error(
      "❌ Startup failed:",
      error
    );

    process.exit(
      1
    );
  }
}


start();
