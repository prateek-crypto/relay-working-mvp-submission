type Props = { workers: any[] };

export default function WorkersTable({ workers }: Props) {
  return (
    <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th>Worker Name</th>
          <th>Status</th>
          <th>Last Heartbeat</th>
        </tr>
      </thead>
      <tbody>
        {workers.map((worker) => (
          <tr key={worker.id}>
            <td>{worker.workerName}</td>
            <td>{worker.status}</td>
            <td>{worker.lastHeartbeatAt ? new Date(worker.lastHeartbeatAt).toLocaleString() : "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
