type Props = {
  queue: any;
  stats?: { queued: number; running: number; completed: number; deadLetter: number };
  onPauseResume: (queueId: string, isPaused: boolean) => void;
};

export default function QueueCard({ queue, stats, onPauseResume }: Props) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>{queue.name}</h3>
      <div>Status: {queue.isPaused ? "Paused" : "Active"}</div>
      <div>Queued: {stats?.queued ?? 0}</div>
      <div>Running: {stats?.running ?? 0}</div>
      <div>Completed: {stats?.completed ?? 0}</div>
      <div>Dead Letter: {stats?.deadLetter ?? 0}</div>
      <button style={{ marginTop: 12 }} onClick={() => onPauseResume(queue.id, queue.isPaused)}>
        {queue.isPaused ? "Resume queue" : "Pause queue"}
      </button>
    </div>
  );
}
