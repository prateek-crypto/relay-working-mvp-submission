import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { apiDelete, apiGet, apiPatch, apiPost, loginDemo } from "./api";
import QueueCard from "./components/QueueCard";
import JobsTable from "./components/JobsTable";
import WorkersTable from "./components/WorkersTable";
import DlqTable from "./components/DlqTable";

type Project = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

type Queue = {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  isPaused: boolean;
  defaultPriority: number;
  concurrencyLimit: number;
  retryPolicyId?: string | null;
  rateLimitCount?: number | null;
  rateLimitWindowSec?: number | null;
  createdAt: string;
  updatedAt: string;
};

type QueueStats = {
  queueId: string;
  queued: number;
  claimed?: number;
  running: number;
  scheduled?: number;
  completed: number;
  deadLetter: number;
};

type ScheduledJob = {
  id: string;
  queueId: string;
  name?: string | null;
  jobType: string;
  payloadJson: any;
  priority: number;
  maxAttempts: number;
  cronExpression: string;
  timezone?: string | null;
  nextRunAt: string;
  lastEnqueuedAt?: string | null;
  isPaused: boolean;
  createdAt: string;
  updatedAt: string;
};

type Worker = {
  id: string;
  workerName: string;
  status: string;
  startedAt?: string;
  lastHeartbeatAt?: string | null;
};

type DlqItem = {
  id: string;
  jobId: string;
  failureReason: string;
  finalAttempt: number;
  createdAt: string;
  job?: {
    id: string;
    jobType: string;
    status: string;
  };
};

function App() {
  const [token, setToken] = useState("");
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [projects, setProjects] = useState<Project[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [dlq, setDlq] = useState<DlqItem[]>([]);
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledJob[]>([]);
  const [queueStats, setQueueStats] = useState<Record<string, QueueStats>>({});

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedQueueId, setSelectedQueueId] = useState("");

  const [projectForm, setProjectForm] = useState({
    name: "",
    slug: ""
  });

  const [queueForm, setQueueForm] = useState({
    name: "",
    description: "",
    defaultPriority: 5,
    concurrencyLimit: 5
  });

  const [queueConfigForm, setQueueConfigForm] = useState({
    description: "",
    defaultPriority: 5,
    concurrencyLimit: 5,
    rateLimitCount: "",
    rateLimitWindowSec: ""
  });

  const [scheduledForm, setScheduledForm] = useState({
    name: "",
    jobType: "generate-report",
    cronExpression: "*/5 * * * *",
    priority: 5,
    maxAttempts: 3,
    payloadJson: '{ "report": "invoice-summary" }'
  });

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const selectedQueue = useMemo(
    () => queues.find((q) => q.id === selectedQueueId) ?? null,
    [queues, selectedQueueId]
  );

  async function boot() {
    try {
      setBooting(true);
      setError("");
      const auth = await loginDemo();
      if (!auth?.token) {
        throw new Error(auth?.error || "Demo login failed");
      }
      setToken(auth.token);
    } catch (err: any) {
      setError(err?.message || "Unable to login");
    } finally {
      setBooting(false);
    }
  }

  async function loadProjectsAndGlobals(authToken: string) {
    const [projectsRes, workersRes, dlqRes] = await Promise.all([
      apiGet("/projects", authToken),
      apiGet("/workers", authToken),
      apiGet("/dead-letter", authToken)
    ]);

    const projectItems = projectsRes.items || [];
    setProjects(projectItems);
    setWorkers(workersRes.items || []);
    setDlq(dlqRes.items || []);

    if (!selectedProjectId && projectItems[0]) {
      setSelectedProjectId(projectItems[0].id);
    } else if (
      selectedProjectId &&
      !projectItems.some((p: Project) => p.id === selectedProjectId)
    ) {
      setSelectedProjectId(projectItems[0]?.id ?? "");
    }
  }

  async function loadQueuesForProject(projectId: string, authToken: string) {
    if (!projectId) {
      setQueues([]);
      setSelectedQueueId("");
      setJobs([]);
      setScheduledJobs([]);
      return;
    }

    const queuesRes = await apiGet(`/projects/${projectId}/queues`, authToken);
    const queueItems: Queue[] = queuesRes.items || [];
    setQueues(queueItems);

    if (!selectedQueueId && queueItems[0]) {
      setSelectedQueueId(queueItems[0].id);
    } else if (
      selectedQueueId &&
      !queueItems.some((q) => q.id === selectedQueueId)
    ) {
      setSelectedQueueId(queueItems[0]?.id ?? "");
    }

    const statsEntries = await Promise.all(
      queueItems.map(async (queue) => {
        const stats = await apiGet(`/queues/${queue.id}/stats`, authToken);
        return [queue.id, stats] as const;
      })
    );

    setQueueStats(Object.fromEntries(statsEntries));
  }

  async function loadQueueDetails(queueId: string, authToken: string) {
    if (!queueId) {
      setJobs([]);
      setScheduledJobs([]);
      return;
    }

    const [jobsRes, scheduledRes] = await Promise.all([
      apiGet(`/queues/${queueId}/jobs`, authToken),
      apiGet(`/queues/${queueId}/scheduled-jobs`, authToken)
    ]);

    setJobs(jobsRes.items || []);
    setScheduledJobs(scheduledRes.items || []);
  }

  async function loadAll(authToken: string) {
    try {
      setLoading(true);
      setError("");
      await loadProjectsAndGlobals(authToken);

      const effectiveProjectId =
        selectedProjectId || (projects[0] ? projects[0].id : "");
      if (effectiveProjectId) {
        await loadQueuesForProject(effectiveProjectId, authToken);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    boot();
  }, []);

  useEffect(() => {
    if (!token) return;
    loadProjectsAndGlobals(token);
  }, [token]);

  useEffect(() => {
    if (!token || !selectedProjectId) return;
    loadQueuesForProject(selectedProjectId, token);
  }, [token, selectedProjectId]);

  useEffect(() => {
    if (!token || !selectedQueueId) return;
    loadQueueDetails(selectedQueueId, token);
  }, [token, selectedQueueId]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(async () => {
      try {
        await loadProjectsAndGlobals(token);
        if (selectedProjectId) {
          await loadQueuesForProject(selectedProjectId, token);
        }
        if (selectedQueueId) {
          await loadQueueDetails(selectedQueueId, token);
        }
      } catch {
        // keep silent during background polling
      }
    }, 8000);
    return () => clearInterval(id);
  }, [token, selectedProjectId, selectedQueueId]);

  useEffect(() => {
    if (!selectedQueue) return;
    setQueueConfigForm({
      description: selectedQueue.description ?? "",
      defaultPriority: selectedQueue.defaultPriority ?? 5,
      concurrencyLimit: selectedQueue.concurrencyLimit ?? 5,
      rateLimitCount:
        selectedQueue.rateLimitCount !== null &&
        selectedQueue.rateLimitCount !== undefined
          ? String(selectedQueue.rateLimitCount)
          : "",
      rateLimitWindowSec:
        selectedQueue.rateLimitWindowSec !== null &&
        selectedQueue.rateLimitWindowSec !== undefined
          ? String(selectedQueue.rateLimitWindowSec)
          : ""
    });
  }, [selectedQueue]);

  function showBanner(message: string) {
    setBanner(message);
    window.setTimeout(() => {
      setBanner((current) => (current === message ? "" : current));
    }, 3000);
  }

  async function refreshEverything() {
    if (!token) return;
    await loadProjectsAndGlobals(token);
    if (selectedProjectId) {
      await loadQueuesForProject(selectedProjectId, token);
    }
    if (selectedQueueId) {
      await loadQueueDetails(selectedQueueId, token);
    }
    showBanner("Dashboard refreshed");
  }

  async function createProject() {
    if (!token) return;
    if (!projectForm.name.trim() || !projectForm.slug.trim()) {
      setError("Project name and slug are required");
      return;
    }

    setError("");
    const res = await apiPost("/projects", token, {
      name: projectForm.name.trim(),
      slug: projectForm.slug.trim()
    });

    if (res?.error) {
      setError(res.error);
      return;
    }

    setProjectForm({ name: "", slug: "" });
    await loadProjectsAndGlobals(token);
    if (res.id) {
      setSelectedProjectId(res.id);
    }
    showBanner("Project created");
  }

  async function createQueue() {
    if (!token || !selectedProjectId) return;
    if (!queueForm.name.trim()) {
      setError("Queue name is required");
      return;
    }

    setError("");
    const res = await apiPost(`/projects/${selectedProjectId}/queues`, token, {
      name: queueForm.name.trim(),
      description: queueForm.description.trim() || null,
      defaultPriority: Number(queueForm.defaultPriority),
      concurrencyLimit: Number(queueForm.concurrencyLimit)
    });

    if (res?.error) {
      setError(res.error);
      return;
    }

    setQueueForm({
      name: "",
      description: "",
      defaultPriority: 5,
      concurrencyLimit: 5
    });

    await loadQueuesForProject(selectedProjectId, token);
    if (res.id) {
      setSelectedQueueId(res.id);
    }
    showBanner("Queue created");
  }

  async function updateQueueConfig() {
    if (!token || !selectedQueueId) return;

    setError("");

    const body: any = {
      description: queueConfigForm.description.trim() || null,
      defaultPriority: Number(queueConfigForm.defaultPriority),
      concurrencyLimit: Number(queueConfigForm.concurrencyLimit)
    };

    body.rateLimitCount =
      queueConfigForm.rateLimitCount.trim() === ""
        ? null
        : Number(queueConfigForm.rateLimitCount);

    body.rateLimitWindowSec =
      queueConfigForm.rateLimitWindowSec.trim() === ""
        ? null
        : Number(queueConfigForm.rateLimitWindowSec);

    const res = await apiPatch(`/queues/${selectedQueueId}`, token, body);
    if (res?.error) {
      setError(res.error);
      return;
    }

    await loadQueuesForProject(selectedProjectId, token);
    await loadQueueDetails(selectedQueueId, token);
    showBanner("Queue configuration updated");
  }

  async function createJob(jobType: "send-email" | "generate-report" | "fail-demo") {
    if (!token || !selectedQueueId) return;

    const payload =
      jobType === "send-email"
        ? { to: "demo@relay.dev", subject: `dashboard-${Date.now()}` }
        : jobType === "generate-report"
        ? { report: "dashboard-report" }
        : { reason: "intentional-failure-demo" };

    const res = await apiPost(`/queues/${selectedQueueId}/jobs`, token, {
      jobType,
      payload
    });

    if (res?.error) {
      setError(res.error);
      return;
    }

    await loadQueueDetails(selectedQueueId, token);
    await loadQueuesForProject(selectedProjectId, token);
    showBanner(`${jobType} job created`);
  }

  async function createRecurringScheduledJob() {
    if (!token || !selectedQueueId) return;
    if (!scheduledForm.jobType.trim() || !scheduledForm.cronExpression.trim()) {
      setError("Job type and cron expression are required");
      return;
    }

    let payload: any = {};
    try {
      payload = JSON.parse(scheduledForm.payloadJson);
    } catch {
      setError("Scheduled job payload must be valid JSON");
      return;
    }

    setError("");
    const res = await apiPost(`/queues/${selectedQueueId}/jobs`, token, {
      name: scheduledForm.name.trim() || null,
      jobType: scheduledForm.jobType.trim(),
      payload,
      priority: Number(scheduledForm.priority),
      maxAttempts: Number(scheduledForm.maxAttempts),
      cronExpression: scheduledForm.cronExpression.trim()
    });

    if (res?.error) {
      setError(res.error);
      return;
    }

    await loadQueueDetails(selectedQueueId, token);
    showBanner("Recurring scheduled job created");
  }

  async function toggleQueue(queueId: string, isPaused: boolean) {
    if (!token) return;
    const res = await apiPost(
      `/queues/${queueId}/${isPaused ? "resume" : "pause"}`,
      token
    );

    if (res?.error) {
      setError(res.error);
      return;
    }

    await loadQueuesForProject(selectedProjectId, token);
    await loadQueueDetails(queueId, token);
    showBanner(isPaused ? "Queue resumed" : "Queue paused");
  }

  async function toggleScheduledJob(jobId: string, isPaused: boolean) {
    if (!token || !selectedQueueId) return;
    const res = await apiPost(
      `/scheduled-jobs/${jobId}/${isPaused ? "resume" : "pause"}`,
      token
    );

    if (res?.error) {
      setError(res.error);
      return;
    }

    await loadQueueDetails(selectedQueueId, token);
    showBanner(isPaused ? "Scheduled job resumed" : "Scheduled job paused");
  }

  async function deleteScheduledJob(jobId: string) {
    if (!token || !selectedQueueId) return;
    const res = await apiDelete(`/scheduled-jobs/${jobId}`, token);

    if (res?.error) {
      setError(res.error);
      return;
    }

    await loadQueueDetails(selectedQueueId, token);
    showBanner("Scheduled job deleted");
  }

  async function requeueDlq(id: string) {
    if (!token) return;
    const res = await apiPost(`/dead-letter/${id}/requeue`, token);
    if (res?.error) {
      setError(res.error);
      return;
    }

    await refreshEverything();
    showBanner("Dead-letter job requeued");
  }

  if (booting) {
    return (
      <div style={pageShell}>
        <div style={centerCard}>
          <h2 style={{ margin: 0, color: "#f8fafc" }}>Relay Dashboard</h2>
          <p style={{ color: "#94a3b8", marginTop: 12 }}>Booting demo session…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={pageShell}>
      <div style={bgOrb1} />
      <div style={bgOrb2} />
      <div style={bgOrb3} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1450, margin: "0 auto", padding: 24 }}>
        <header style={heroCard}>
          <div style={{ flex: 1 }}>
            <div style={eyebrow}>DISTRIBUTED JOB SCHEDULER</div>
            <h1 style={heroTitle}>Relay Operations Dashboard</h1>
            <p style={heroSubtitle}>
              Monitor queues, create jobs, manage recurring schedules, inspect workers,
              and recover dead-letter jobs from a single operational surface.
            </p>
          </div>

          <div style={heroActions}>
            <button style={primaryButton} onClick={refreshEverything}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </header>

        {banner ? (
          <div style={successBanner}>
            {banner}
          </div>
        ) : null}

        {error ? (
          <div style={errorBanner}>
            {error}
          </div>
        ) : null}

        <section style={topGrid}>
          <div style={glassCard}>
            <SectionTitle
              title="Project Explorer"
              subtitle="Choose a project, create new projects, and manage queue ownership."
            />

            <div style={fieldGrid2}>
              <Field label="Selected Project">
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  style={inputStyle}
                >
                  {projects.length === 0 ? <option value="">No projects</option> : null}
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} ({project.slug})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Selected Queue">
                <select
                  value={selectedQueueId}
                  onChange={(e) => setSelectedQueueId(e.target.value)}
                  style={inputStyle}
                >
                  {queues.length === 0 ? <option value="">No queues</option> : null}
                  {queues.map((queue) => (
                    <option key={queue.id} value={queue.id}>
                      {queue.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div style={divider} />

            <h3 style={subsectionTitle}>Create Project</h3>
            <div style={fieldGrid2}>
              <Field label="Project Name">
                <input
                  style={inputStyle}
                  value={projectForm.name}
                  onChange={(e) =>
                    setProjectForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Payments Platform"
                />
              </Field>

              <Field label="Project Slug">
                <input
                  style={inputStyle}
                  value={projectForm.slug}
                  onChange={(e) =>
                    setProjectForm((prev) => ({ ...prev, slug: e.target.value }))
                  }
                  placeholder="payments-platform"
                />
              </Field>
            </div>

            <div style={{ marginTop: 14 }}>
              <button style={primaryButton} onClick={createProject}>
                Create Project
              </button>
            </div>
          </div>

          <div style={glassCard}>
            <SectionTitle
              title="Create Queue"
              subtitle="Provision a new queue under the selected project."
            />

            <div style={fieldGrid2}>
              <Field label="Queue Name">
                <input
                  style={inputStyle}
                  value={queueForm.name}
                  onChange={(e) =>
                    setQueueForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="invoice-emails"
                />
              </Field>

              <Field label="Description">
                <input
                  style={inputStyle}
                  value={queueForm.description}
                  onChange={(e) =>
                    setQueueForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Queue for invoice delivery"
                />
              </Field>

              <Field label="Default Priority">
                <input
                  type="number"
                  style={inputStyle}
                  value={queueForm.defaultPriority}
                  onChange={(e) =>
                    setQueueForm((prev) => ({
                      ...prev,
                      defaultPriority: Number(e.target.value)
                    }))
                  }
                />
              </Field>

              <Field label="Concurrency Limit">
                <input
                  type="number"
                  style={inputStyle}
                  value={queueForm.concurrencyLimit}
                  onChange={(e) =>
                    setQueueForm((prev) => ({
                      ...prev,
                      concurrencyLimit: Number(e.target.value)
                    }))
                  }
                />
              </Field>
            </div>

            <div style={{ marginTop: 14 }}>
              <button
                style={primaryButton}
                onClick={createQueue}
                disabled={!selectedProjectId}
              >
                Create Queue
              </button>
            </div>
          </div>
        </section>

        <section style={{ marginTop: 24 }}>
          <div style={glassCard}>
            <SectionTitle
              title="Queue Overview"
              subtitle="Operational summary of all queues under the selected project."
            />

            {queues.length === 0 ? (
              <EmptyState text="No queues found for this project yet." />
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                  gap: 18
                }}
              >
                {queues.map((queue) => (
                  <QueueCard
                    key={queue.id}
                    queue={queue}
                    stats={queueStats[queue.id]}
                    onPauseResume={toggleQueue}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <section style={twoColGrid}>
          <div style={glassCard}>
            <SectionTitle
              title="Queue Configuration"
              subtitle={
                selectedQueue
                  ? `Update settings for ${selectedQueue.name}`
                  : "Select a queue to edit its configuration"
              }
            />

            {!selectedQueue ? (
              <EmptyState text="Select a queue to edit configuration." />
            ) : (
              <>
                <div style={metricGrid}>
                  <MetricCard
                    label="Queued"
                    value={String(queueStats[selectedQueue.id]?.queued ?? 0)}
                    gradient="linear-gradient(135deg, #0ea5e9, #2563eb)"
                  />
                  <MetricCard
                    label="Running"
                    value={String(queueStats[selectedQueue.id]?.running ?? 0)}
                    gradient="linear-gradient(135deg, #8b5cf6, #7c3aed)"
                  />
                  <MetricCard
                    label="Completed"
                    value={String(queueStats[selectedQueue.id]?.completed ?? 0)}
                    gradient="linear-gradient(135deg, #22c55e, #14b8a6)"
                  />
                  <MetricCard
                    label="Dead Letter"
                    value={String(queueStats[selectedQueue.id]?.deadLetter ?? 0)}
                    gradient="linear-gradient(135deg, #ef4444, #f97316)"
                  />
                </div>

                <div style={{ marginTop: 18 }} />

                <div style={fieldGrid2}>
                  <Field label="Description">
                    <input
                      style={inputStyle}
                      value={queueConfigForm.description}
                      onChange={(e) =>
                        setQueueConfigForm((prev) => ({
                          ...prev,
                          description: e.target.value
                        }))
                      }
                    />
                  </Field>

                  <Field label="Default Priority">
                    <input
                      type="number"
                      style={inputStyle}
                      value={queueConfigForm.defaultPriority}
                      onChange={(e) =>
                        setQueueConfigForm((prev) => ({
                          ...prev,
                          defaultPriority: Number(e.target.value)
                        }))
                      }
                    />
                  </Field>

                  <Field label="Concurrency Limit">
                    <input
                      type="number"
                      style={inputStyle}
                      value={queueConfigForm.concurrencyLimit}
                      onChange={(e) =>
                        setQueueConfigForm((prev) => ({
                          ...prev,
                          concurrencyLimit: Number(e.target.value)
                        }))
                      }
                    />
                  </Field>

                  <Field label="Rate Limit Count">
                    <input
                      type="number"
                      style={inputStyle}
                      value={queueConfigForm.rateLimitCount}
                      onChange={(e) =>
                        setQueueConfigForm((prev) => ({
                          ...prev,
                          rateLimitCount: e.target.value
                        }))
                      }
                      placeholder="leave empty to disable"
                    />
                  </Field>

                  <Field label="Rate Limit Window (sec)">
                    <input
                      type="number"
                      style={inputStyle}
                      value={queueConfigForm.rateLimitWindowSec}
                      onChange={(e) =>
                        setQueueConfigForm((prev) => ({
                          ...prev,
                          rateLimitWindowSec: e.target.value
                        }))
                      }
                      placeholder="leave empty to disable"
                    />
                  </Field>
                </div>

                <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                  <button style={primaryButton} onClick={updateQueueConfig}>
                    Save Queue Config
                  </button>
                  <button
                    style={secondaryButton}
                    onClick={() =>
                      selectedQueue && toggleQueue(selectedQueue.id, selectedQueue.isPaused)
                    }
                  >
                    {selectedQueue.isPaused ? "Resume Queue" : "Pause Queue"}
                  </button>
                </div>
              </>
            )}
          </div>

          <div style={glassCard}>
            <SectionTitle
              title="Create Jobs"
              subtitle="Enqueue immediate jobs or register recurring cron schedules."
            />

            {!selectedQueue ? (
              <EmptyState text="Select a queue to create jobs." />
            ) : (
              <>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
                  <button style={primaryButton} onClick={() => createJob("send-email")}>
                    Create send-email
                  </button>
                  <button style={secondaryButton} onClick={() => createJob("generate-report")}>
                    Create generate-report
                  </button>
                  <button style={dangerButton} onClick={() => createJob("fail-demo")}>
                    Create fail-demo
                  </button>
                </div>

                <div style={divider} />

                <h3 style={subsectionTitle}>Create Recurring Scheduled Job</h3>

                <div style={fieldGrid2}>
                  <Field label="Schedule Name">
                    <input
                      style={inputStyle}
                      value={scheduledForm.name}
                      onChange={(e) =>
                        setScheduledForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                      placeholder="5-min invoice report"
                    />
                  </Field>

                  <Field label="Job Type">
                    <input
                      style={inputStyle}
                      value={scheduledForm.jobType}
                      onChange={(e) =>
                        setScheduledForm((prev) => ({ ...prev, jobType: e.target.value }))
                      }
                    />
                  </Field>

                  <Field label="Cron Expression">
                    <input
                      style={inputStyle}
                      value={scheduledForm.cronExpression}
                      onChange={(e) =>
                        setScheduledForm((prev) => ({
                          ...prev,
                          cronExpression: e.target.value
                        }))
                      }
                      placeholder="*/5 * * * *"
                    />
                  </Field>

                  <Field label="Priority">
                    <input
                      type="number"
                      style={inputStyle}
                      value={scheduledForm.priority}
                      onChange={(e) =>
                        setScheduledForm((prev) => ({
                          ...prev,
                          priority: Number(e.target.value)
                        }))
                      }
                    />
                  </Field>

                  <Field label="Max Attempts">
                    <input
                      type="number"
                      style={inputStyle}
                      value={scheduledForm.maxAttempts}
                      onChange={(e) =>
                        setScheduledForm((prev) => ({
                          ...prev,
                          maxAttempts: Number(e.target.value)
                        }))
                      }
                    />
                  </Field>
                </div>

                <Field label="Payload JSON" fullWidth>
                  <textarea
                    style={{ ...inputStyle, minHeight: 120, resize: "vertical" }}
                    value={scheduledForm.payloadJson}
                    onChange={(e) =>
                      setScheduledForm((prev) => ({
                        ...prev,
                        payloadJson: e.target.value
                      }))
                    }
                  />
                </Field>

                <div style={{ marginTop: 16 }}>
                  <button style={primaryButton} onClick={createRecurringScheduledJob}>
                    Create Recurring Job
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        <section style={twoColGrid}>
          <div style={glassCard}>
            <SectionTitle
              title="Jobs"
              subtitle={
                selectedQueue
                  ? `Recent jobs for ${selectedQueue.name}`
                  : "Select a queue to inspect jobs"
              }
            />
            <JobsTable jobs={jobs} />
          </div>

          <div style={glassCard}>
            <SectionTitle
              title="Scheduled Jobs"
              subtitle="Recurring cron definitions registered on the selected queue."
            />

            {!selectedQueue ? (
              <EmptyState text="Select a queue to inspect recurring schedules." />
            ) : scheduledJobs.length === 0 ? (
              <EmptyState text="No recurring scheduled jobs for this queue." />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={tableHeadRow}>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Type</th>
                      <th style={thStyle}>Cron</th>
                      <th style={thStyle}>Next Run</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduledJobs.map((job) => (
                      <tr key={job.id} style={tableRow}>
                        <td style={tdStyle}>{job.name || "-"}</td>
                        <td style={tdStyle}>{job.jobType}</td>
                        <td style={tdStyle}>{job.cronExpression}</td>
                        <td style={tdStyle}>{new Date(job.nextRunAt).toLocaleString()}</td>
                        <td style={tdStyle}>
                          <span
                            style={{
                              ...pillBase,
                              background: job.isPaused
                                ? "rgba(245, 158, 11, 0.18)"
                                : "rgba(34, 197, 94, 0.18)",
                              color: job.isPaused ? "#fcd34d" : "#86efac",
                              border: job.isPaused
                                ? "1px solid rgba(245, 158, 11, 0.28)"
                                : "1px solid rgba(34, 197, 94, 0.28)"
                            }}
                          >
                            {job.isPaused ? "PAUSED" : "ACTIVE"}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              style={smallActionButton}
                              onClick={() => toggleScheduledJob(job.id, job.isPaused)}
                            >
                              {job.isPaused ? "Resume" : "Pause"}
                            </button>
                            <button
                              style={smallDangerButton}
                              onClick={() => deleteScheduledJob(job.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section style={twoColGrid}>
          <div style={glassCard}>
            <SectionTitle
              title="Workers"
              subtitle="Heartbeat and worker execution status across the system."
            />
            <WorkersTable workers={workers} />
          </div>

          <div style={glassCard}>
            <DlqTable items={dlq} onRequeue={requeueDlq} />
          </div>
        </section>

        <footer
          style={{
            color: "#94a3b8",
            fontSize: 13,
            marginTop: 26,
            textAlign: "center",
            paddingBottom: 20
          }}
        >
          Relay MVP dashboard — auto-refreshes every 8 seconds. Built for queue operations,
          worker monitoring, recurring jobs, and dead-letter recovery.
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  fullWidth
}: {
  label: string;
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, gridColumn: fullWidth ? "1 / -1" : undefined }}>
      <label style={{ color: "#cbd5e1", fontSize: 13, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ margin: 0, color: "#f8fafc", fontSize: 22 }}>{title}</h2>
      {subtitle ? (
        <div style={{ marginTop: 6, color: "#94a3b8", fontSize: 14 }}>{subtitle}</div>
      ) : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  gradient
}: {
  label: string;
  value: string;
  gradient: string;
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: 18,
        background: gradient,
        color: "#fff",
        boxShadow: "0 18px 42px rgba(15, 23, 42, 0.28)"
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.9, letterSpacing: 0.5, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "22px 14px",
        borderRadius: 16,
        background: "rgba(15, 23, 42, 0.45)",
        border: "1px dashed rgba(148, 163, 184, 0.24)",
        color: "#94a3b8",
        textAlign: "center"
      }}
    >
      {text}
    </div>
  );
}

const pageShell: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top left, rgba(59,130,246,0.16), transparent 28%), radial-gradient(circle at top right, rgba(168,85,247,0.16), transparent 30%), linear-gradient(180deg, #020617 0%, #0f172a 45%, #111827 100%)",
  position: "relative",
  overflow: "hidden",
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
};

const bgOrbBase: React.CSSProperties = {
  position: "absolute",
  borderRadius: "50%",
  filter: "blur(70px)",
  opacity: 0.45,
  zIndex: 0
};

const bgOrb1: React.CSSProperties = {
  ...bgOrbBase,
  width: 280,
  height: 280,
  top: -60,
  left: -50,
  background: "rgba(59, 130, 246, 0.35)"
};

const bgOrb2: React.CSSProperties = {
  ...bgOrbBase,
  width: 340,
  height: 340,
  top: 120,
  right: -80,
  background: "rgba(168, 85, 247, 0.28)"
};

const bgOrb3: React.CSSProperties = {
  ...bgOrbBase,
  width: 260,
  height: 260,
  bottom: 40,
  left: "30%",
  background: "rgba(16, 185, 129, 0.22)"
};

const centerCard: React.CSSProperties = {
  maxWidth: 460,
  margin: "18vh auto 0",
  padding: 28,
  borderRadius: 24,
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  textAlign: "center",
  boxShadow: "0 24px 80px rgba(2, 6, 23, 0.45)"
};

const heroCard: React.CSSProperties = {
  display: "flex",
  gap: 24,
  justifyContent: "space-between",
  alignItems: "center",
  padding: 28,
  borderRadius: 28,
  background:
    "linear-gradient(135deg, rgba(15,23,42,0.86), rgba(30,41,59,0.78))",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  boxShadow: "0 24px 80px rgba(2, 6, 23, 0.42)"
};

const eyebrow: React.CSSProperties = {
  display: "inline-block",
  color: "#7dd3fc",
  fontWeight: 700,
  fontSize: 12,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  marginBottom: 12
};

const heroTitle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 38,
  lineHeight: 1.05
};

const heroSubtitle: React.CSSProperties = {
  color: "#cbd5e1",
  marginTop: 12,
  maxWidth: 760,
  lineHeight: 1.6,
  fontSize: 15
};

const heroActions: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12
};

const glassCard: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 24,
  padding: 22,
  boxShadow: "0 24px 70px rgba(2, 6, 23, 0.28)"
};

const topGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.1fr 1fr",
  gap: 24,
  marginTop: 24
};

const twoColGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 24,
  marginTop: 24
};

const fieldGrid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 16
};

const metricGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 14
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 14,
  border: "1px solid rgba(148, 163, 184, 0.22)",
  background: "rgba(2, 6, 23, 0.55)",
  color: "#f8fafc",
  padding: "12px 14px",
  fontSize: 14,
  outline: "none"
};

const primaryButton: React.CSSProperties = {
  border: "none",
  borderRadius: 14,
  padding: "12px 18px",
  cursor: "pointer",
  color: "#fff",
  fontWeight: 700,
  background: "linear-gradient(135deg, #2563eb, #7c3aed)",
  boxShadow: "0 16px 34px rgba(37, 99, 235, 0.30)"
};

const secondaryButton: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.24)",
  borderRadius: 14,
  padding: "12px 18px",
  cursor: "pointer",
  color: "#f8fafc",
  fontWeight: 700,
  background: "rgba(30, 41, 59, 0.85)"
};

const dangerButton: React.CSSProperties = {
  border: "none",
  borderRadius: 14,
  padding: "12px 18px",
  cursor: "pointer",
  color: "#fff",
  fontWeight: 700,
  background: "linear-gradient(135deg, #ef4444, #f97316)",
  boxShadow: "0 16px 34px rgba(239, 68, 68, 0.24)"
};

const smallActionButton: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.22)",
  borderRadius: 12,
  padding: "8px 12px",
  cursor: "pointer",
  color: "#f8fafc",
  fontWeight: 700,
  background: "rgba(30, 41, 59, 0.85)"
};

const smallDangerButton: React.CSSProperties = {
  border: "none",
  borderRadius: 12,
  padding: "8px 12px",
  cursor: "pointer",
  color: "#fff",
  fontWeight: 700,
  background: "linear-gradient(135deg, #ef4444, #f97316)"
};

const divider: React.CSSProperties = {
  height: 1,
  background: "rgba(148, 163, 184, 0.14)",
  margin: "18px 0"
};

const subsectionTitle: React.CSSProperties = {
  margin: "0 0 14px 0",
  color: "#f8fafc",
  fontSize: 18
};

const successBanner: React.CSSProperties = {
  marginTop: 18,
  borderRadius: 16,
  padding: "14px 16px",
  color: "#dcfce7",
  background: "rgba(22, 163, 74, 0.18)",
  border: "1px solid rgba(34, 197, 94, 0.28)"
};

const errorBanner: React.CSSProperties = {
  marginTop: 18,
  borderRadius: 16,
  padding: "14px 16px",
  color: "#fecaca",
  background: "rgba(127, 29, 29, 0.35)",
  border: "1px solid rgba(239, 68, 68, 0.28)"
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  color: "#e2e8f0"
};

const tableHeadRow: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid rgba(148, 163, 184, 0.18)"
};

const tableRow: React.CSSProperties = {
  borderBottom: "1px solid rgba(148, 163, 184, 0.10)"
};

const thStyle: React.CSSProperties = {
  padding: "12px 10px",
  color: "#94a3b8",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.6
};

const tdStyle: React.CSSProperties = {
  padding: "14px 10px",
  fontSize: 14,
  verticalAlign: "top"
};

const pillBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700
};

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);