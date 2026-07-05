type Props = { workers: any[] };

export default function WorkersTable({ workers }: Props) {
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
          minWidth: 760
        }}
      >
        <thead>
          <tr
            style={{
              background: "rgba(15,23,42,0.72)",
              borderBottom: "1px solid rgba(148,163,184,0.14)"
            }}
          >
            <Th>Worker Name</Th>
            <Th>Status</Th>
            <Th>Started At</Th>
            <Th>Last Heartbeat</Th>
            <Th>Worker ID</Th>
          </tr>
        </thead>

        <tbody>
          {workers.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                style={{
                  padding: "28px 16px",
                  textAlign: "center",
                  color: "#94a3b8"
                }}
              >
                No workers found.
              </td>
            </tr>
          ) : (
            workers.map((worker, index) => (
              <tr
                key={worker.id}
                style={{
                  borderBottom: "1px solid rgba(148,163,184,0.08)",
                  background:
                    index % 2 === 0
                      ? "rgba(15,23,42,0.18)"
                      : "rgba(30,41,59,0.10)"
                }}
              >
                <Td>{worker.workerName}</Td>
                <Td>
                  <WorkerStatusPill status={worker.status} />
                </Td>
                <Td>{worker.startedAt ? formatDate(worker.startedAt) : "-"}</Td>
                <Td>
                  {worker.lastHeartbeatAt ? formatDate(worker.lastHeartbeatAt) : "-"}
                </Td>
                <Td mono>{worker.id}</Td>
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

function WorkerStatusPill({ status }: { status: string }) {
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
    case "ACTIVE":
      return {
        background: "rgba(34,197,94,0.16)",
        color: "#86efac",
        border: "1px solid rgba(34,197,94,0.28)"
      };
    case "DRAINING":
      return {
        background: "rgba(245,158,11,0.16)",
        color: "#fcd34d",
        border: "1px solid rgba(245,158,11,0.28)"
      };
    case "STOPPED":
      return {
        background: "rgba(239,68,68,0.16)",
        color: "#fca5a5",
        border: "1px solid rgba(239,68,68,0.28)"
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