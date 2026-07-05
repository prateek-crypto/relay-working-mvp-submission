type Props = {
  items: any[];
  onRequeue: (id: string) => void;
};

export default function DlqTable({ items, onRequeue }: Props) {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: "#f8fafc", fontSize: 22 }}>
          Dead Letter Queue
        </h2>
        <div style={{ marginTop: 6, color: "#94a3b8", fontSize: 14 }}>
          Permanently failed jobs that can be requeued for another attempt.
        </div>
      </div>

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
            minWidth: 920
          }}
        >
          <thead>
            <tr
              style={{
                background: "rgba(15,23,42,0.72)",
                borderBottom: "1px solid rgba(148,163,184,0.14)"
              }}
            >
              <Th>DLQ ID</Th>
              <Th>Job ID</Th>
              <Th>Failure Reason</Th>
              <Th>Final Attempt</Th>
              <Th>Created At</Th>
              <Th>Action</Th>
            </tr>
          </thead>

          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: "28px 16px",
                    textAlign: "center",
                    color: "#94a3b8"
                  }}
                >
                  No dead-letter jobs found.
                </td>
              </tr>
            ) : (
              items.map((item, index) => (
                <tr
                  key={item.id}
                  style={{
                    borderBottom: "1px solid rgba(148,163,184,0.08)",
                    background:
                      index % 2 === 0
                        ? "rgba(15,23,42,0.18)"
                        : "rgba(30,41,59,0.10)"
                  }}
                >
                  <Td mono>{item.id}</Td>
                  <Td mono>{item.jobId}</Td>
                  <Td>{item.failureReason}</Td>
                  <Td>{item.finalAttempt}</Td>
                  <Td>{formatDate(item.createdAt)}</Td>
                  <Td>
                    <button
                      style={{
                        border: "none",
                        borderRadius: 12,
                        padding: "10px 14px",
                        cursor: "pointer",
                        color: "#fff",
                        fontWeight: 700,
                        background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                        boxShadow: "0 10px 24px rgba(37,99,235,0.24)"
                      }}
                      onClick={() => onRequeue(item.id)}
                    >
                      Requeue
                    </button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}