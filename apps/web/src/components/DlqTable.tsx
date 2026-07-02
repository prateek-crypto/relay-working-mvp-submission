type Props = {
  items: any[];
  onRequeue: (id: string) => void;
};

export default function DlqTable({ items, onRequeue }: Props) {
  return (
    <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th>Job ID</th>
          <th>Failure reason</th>
          <th>Final attempt</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td>{item.jobId.slice(0, 8)}</td>
            <td>{item.failureReason}</td>
            <td>{item.finalAttempt}</td>
            <td><button onClick={() => onRequeue(item.id)}>Requeue</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
