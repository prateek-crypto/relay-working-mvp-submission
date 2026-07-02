type Props = { jobs: any[] };

export default function JobsTable({ jobs }: Props) {
  return (
    <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th>Job ID</th>
          <th>Type</th>
          <th>Status</th>
          <th>Attempts</th>
          <th>Priority</th>
          <th>Created At</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => (
          <tr key={job.id}>
            <td>{job.id.slice(0, 8)}</td>
            <td>{job.jobType}</td>
            <td>{job.status}</td>
            <td>{job.attemptCount}</td>
            <td>{job.priority}</td>
            <td>{new Date(job.createdAt).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
