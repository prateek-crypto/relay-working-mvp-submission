import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { apiGet, apiPost, loginDemo } from "./api";
import QueueCard from "./components/QueueCard";
import JobsTable from "./components/JobsTable";
import WorkersTable from "./components/WorkersTable";
import DlqTable from "./components/DlqTable";

function App() {
  const [token, setToken] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const [queues, setQueues] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [dlq, setDlq] = useState<any[]>([]);
  const [queueStats, setQueueStats] = useState<Record<string, any>>({});

  async function loadAll(t: string) {
    const projectsRes = await apiGet("/projects", t);
    const projectItems = projectsRes.items || [];
    setProjects(projectItems);

    let queueItems: any[] = [];
    if (projectItems[0]) {
      const queuesRes = await apiGet(`/projects/${projectItems[0].id}/queues`, t);
      queueItems = queuesRes.items || [];
      setQueues(queueItems);

      if (queueItems[0]) {
        const jobsRes = await apiGet(`/queues/${queueItems[0].id}/jobs`, t);
        setJobs(jobsRes.items || []);
      }

      const statsEntries = await Promise.all(
        queueItems.map(async (queue) => {
          const stats = await apiGet(`/queues/${queue.id}/stats`, t);
          return [queue.id, stats] as const;
        })
      );

      setQueueStats(Object.fromEntries(statsEntries));
    }

    const workersRes = await apiGet("/workers", t);
    setWorkers(workersRes.items || []);

    const dlqRes = await apiGet("/dead-letter", t);
    setDlq(dlqRes.items || []);
  }

  async function boot() {
    const auth = await loginDemo();
    setToken(auth.token);
  }

  useEffect(() => {
    boot();
  }, []);

  useEffect(() => {
    if (!token) return;
    loadAll(token);
    const id = setInterval(() => loadAll(token), 8000);
    return () => clearInterval(id);
  }, [token]);

  async function createJob(jobType: "send-email" | "generate-report" | "fail-demo") {
    if (!token || !queues[0]) return;
    await apiPost(`/queues/${queues[0].id}/jobs`, token, {
      jobType,
      payload: { demo: true }
    });
    await loadAll(token);
  }

  async function toggleQueue(queueId: string, isPaused: boolean) {
    if (!token) return;
    await apiPost(`/queues/${queueId}/${isPaused ? "resume" : "pause"}`, token);
    await loadAll(token);
  }

  async function requeueDlq(id: string) {
    if (!token) return;
    await apiPost(`/dead-letter/${id}/requeue`, token);
    await loadAll(token);
  }

  return (
    <div style={{ fontFamily: "Arial", padding: 24 }}>
      <h1>Relay — Distributed Job Scheduler (Node.js MVP)</h1>
      <p>
        Demo login is automatic using <code>demo@relay.dev</code>. This dashboard focuses on queue state,
        job execution, workers, and dead-letter recovery.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button onClick={() => createJob("send-email")}>Create send-email</button>
        <button onClick={() => createJob("generate-report")}>Create generate-report</button>
        <button onClick={() => createJob("fail-demo")}>Create fail-demo</button>
        <button onClick={() => token && loadAll(token)}>Refresh</button>
      </div>

      <h2>Queues</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16, marginBottom: 24 }}>
        {queues.map((queue) => (
          <QueueCard
            key={queue.id}
            queue={queue}
            stats={queueStats[queue.id]}
            onPauseResume={toggleQueue}
          />
        ))}
      </div>

      <h2>Jobs (first queue)</h2>
      <JobsTable jobs={jobs} />

      <h2 style={{ marginTop: 32 }}>Workers</h2>
      <WorkersTable workers={workers} />

      <h2 style={{ marginTop: 32 }}>Dead Letter Queue</h2>
      <DlqTable items={dlq} onRequeue={requeueDlq} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
