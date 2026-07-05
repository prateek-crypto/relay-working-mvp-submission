type Props = {
  queue: any;
  stats?: {
    queued?: number;
    running?: number;
    completed?: number;
    deadLetter?: number;
    claimed?: number;
    scheduled?: number;
  };
  onPauseResume: (queueId: string, isPaused: boolean) => void;
};

export default function QueueCard({ queue, stats, onPauseResume }: Props) {
  const statusColor = queue.isPaused ? "#f59e0b" : "#22c55e";
  const statusBg = queue.isPaused
    ? "rgba(245, 158, 11, 0.16)"
    : "rgba(34, 197, 94, 0.16)";
  const statusBorder = queue.isPaused
    ? "1px solid rgba(245, 158, 11, 0.28)"
    : "1px solid rgba(34, 197, 94, 0.28)";

  return (
    <div
      style={{
        borderRadius: 24,
        padding: 20,
        background:
          "linear-gradient(180deg, rgba(15,23,42,0.92), rgba(30,41,59,0.78))",
        border: "1px solid rgba(148,163,184,0.14)",
        boxShadow: "0 18px 50px rgba(2,6,23,0.30)",
        position: "relative",
        overflow: "hidden"
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 120,
          height: 120,
          right: -25,
          top: -25,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(59,130,246,0.25), transparent 70%)",
          filter: "blur(10px)"
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                color: "#f8fafc",
                fontSize: 20,
                lineHeight: 1.2
              }}
            >
              {queue.name}
            </h3>

            <div
              style={{
                color: "#94a3b8",
                marginTop: 6,
                fontSize: 14,
                minHeight: 20
              }}
            >
              {queue.description || "No description"}
            </div>
          </div>

          <span
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              color: statusColor,
              background: statusBg,
              border: statusBorder,
              whiteSpace: "nowrap"
            }}
          >
            {queue.isPaused ? "PAUSED" : "ACTIVE"}
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 12,
            marginTop: 18
          }}
        >
          <StatTile
            label="Queued"
            value={stats?.queued ?? 0}
            gradient="linear-gradient(135deg, rgba(37,99,235,0.22), rgba(59,130,246,0.08))"
          />
          <StatTile
            label="Running"
            value={stats?.running ?? 0}
            gradient="linear-gradient(135deg, rgba(124,58,237,0.22), rgba(168,85,247,0.08))"
          />
          <StatTile
            label="Completed"
            value={stats?.completed ?? 0}
            gradient="linear-gradient(135deg, rgba(16,185,129,0.22), rgba(34,197,94,0.08))"
          />
          <StatTile
            label="Dead Letter"
            value={stats?.deadLetter ?? 0}
            gradient="linear-gradient(135deg, rgba(239,68,68,0.22), rgba(249,115,22,0.08))"
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 12,
            marginTop: 14
          }}
        >
          <InfoRow label="Priority" value={queue.defaultPriority} />
          <InfoRow label="Concurrency" value={queue.concurrencyLimit} />
          <InfoRow
            label="Rate Limit"
            value={
              queue.rateLimitCount && queue.rateLimitWindowSec
                ? `${queue.rateLimitCount} / ${queue.rateLimitWindowSec}s`
                : "Disabled"
            }
          />
          <InfoRow
            label="Updated"
            value={new Date(queue.updatedAt).toLocaleString()}
          />
        </div>

        <button
          style={{
            marginTop: 18,
            width: "100%",
            border: "none",
            borderRadius: 14,
            padding: "12px 16px",
            cursor: "pointer",
            color: "#fff",
            fontWeight: 700,
            background: queue.isPaused
              ? "linear-gradient(135deg, #10b981, #22c55e)"
              : "linear-gradient(135deg, #f59e0b, #f97316)",
            boxShadow: queue.isPaused
              ? "0 12px 30px rgba(16,185,129,0.22)"
              : "0 12px 30px rgba(245,158,11,0.22)"
          }}
          onClick={() => onPauseResume(queue.id, queue.isPaused)}
        >
          {queue.isPaused ? "Resume Queue" : "Pause Queue"}
        </button>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  gradient
}: {
  label: string;
  value: number | string;
  gradient: string;
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: 14,
        background: gradient,
        border: "1px solid rgba(148,163,184,0.12)"
      }}
    >
      <div
        style={{
          color: "#94a3b8",
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.7
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: "#f8fafc",
          fontSize: 24,
          fontWeight: 800,
          marginTop: 6
        }}
      >
        {value}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div
      style={{
        borderRadius: 16,
        padding: 12,
        background: "rgba(2,6,23,0.34)",
        border: "1px solid rgba(148,163,184,0.10)"
      }}
    >
      <div style={{ color: "#94a3b8", fontSize: 12 }}>{label}</div>
      <div
        style={{
          color: "#e2e8f0",
          fontSize: 14,
          fontWeight: 600,
          marginTop: 4,
          wordBreak: "break-word"
        }}
      >
        {value}
      </div>
    </div>
  );
}