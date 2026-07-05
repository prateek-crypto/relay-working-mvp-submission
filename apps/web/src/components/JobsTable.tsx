type Props = { jobs: any[] };

export default function JobsTable({ jobs }: Props) {
  return (
    <div
      style={{
        overflowX: "auto",
        borderRadius: 20,
        border: "1px solid rgba(148,163,184,0.12)",
        background: "rgba(2,6,23,0.28)"
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          minWidth: 980
        }}
      >
        <thead>
          <tr
            style={{
              background: "rgba(15,23,42,0.72)",
              borderBottom: "1px solid rgba(148,163,184,0.14)"
            }}
          >
            <Th>Job ID</Th>
            <Th>Type</Th>
            <Th>Status</Th>
            <Th>Attempts</Th>
            <Th>Priority</Th>
            <Th>Queue</Th>
            <Th>Available At</Th>
            <Th>Created At</Th>
            <Th>Completed At</Th>
          </tr>
        </thead>

        <tbody>
          {jobs.length === 0 ? (
            <tr>
              <td
                colSpan={9}
                style={{
                  padding: "28px 16px",
                  textAlign: "center",
                  color: "#94a3b8"
                }}
              >
                No jobs found for the selected queue.
              </td>
            </tr>
          ) : (
            jobs.map((job, index) => (
              <tr
                key={job.id}
                style={{
                  borderBottom: "1px solid rgba(148,163,184,0.08)",
                  background:
                    index % 2 === 0
                      ? "rgba(15,23,42,0.18)"
                      : "rgba(30,41,59,0.10)"
                }}
              >
                <Td mono>{job.id}</Td>
                <Td>{job.jobType}</Td>
                <Td>
                  <StatusPill status={job.status} />
                </Td>
                <Td>
                  {job.attemptCount} / {job.maxAttempts}
                </Td>
                <Td>{job.priority}</Td>
                <Td mono>{job.queueId?.slice(0, 8) || "-"}</Td>
                <Td>{formatDate(job.availableAt)}</Td>
                <Td>{formatDate(job.createdAt)}</Td>
                <Td>{job.completedAt ? formatDate(job.completedAt) : "-"}</Td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        padding: "14px 12px",
        textAlign: "left",
        color: "#94a3b8",
        fontSize: 12,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.8
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  mono
}: {
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <td
      style={{
        padding: "14px 12px",
        color: "#e2e8f0",
        fontSize: 14,
        verticalAlign: "top",
        fontFamily: mono
          ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
          : undefined,
        wordBreak: "break-word"
      }}
    >
      {mono && typeof children === "string" ? children.slice(0, 12) : children}
    </td>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles = getStatusStyle(status);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: styles.background,
        color: styles.color,
        border: styles.border
      }}
    >
      {status}
    </span>
  );
}

function getStatusStyle(status: string) {
  switch (status) {
    case "QUEUED":
      return {
        background: "rgba(59,130,246,0.16)",
        color: "#93c5fd",
        border: "1px solid rgba(59,130,246,0.28)"
      };
    case "SCHEDULED":
      return {
        background: "rgba(168,85,247,0.16)",
        color: "#d8b4fe",
        border: "1px solid rgba(168,85,247,0.28)"
      };
    case "CLAIMED":
    case "RUNNING":
      return {
        background: "rgba(245,158,11,0.16)",
        color: "#fcd34d",
        border: "1px solid rgba(245,158,11,0.28)"
      };
    case "COMPLETED":
      return {
        background: "rgba(34,197,94,0.16)",
        color: "#86efac",
        border: "1px solid rgba(34,197,94,0.28)"
      };
    case "FAILED":
      return {
        background: "rgba(239,68,68,0.16)",
        color: "#fca5a5",
        border: "1px solid rgba(239,68,68,0.28)"
      };
    case "DEAD_LETTER":
      return {
        background: "rgba(249,115,22,0.16)",
        color: "#fdba74",
        border: "1px solid rgba(249,115,22,0.28)"
      };
    default:
      return {
        background: "rgba(148,163,184,0.16)",
        color: "#cbd5e1",
        border: "1px solid rgba(148,163,184,0.22)"
      };
  }
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}