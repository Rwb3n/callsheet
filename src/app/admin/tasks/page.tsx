// Admin tasks — S7 §2.2, placeholder (no tRPC list route for task_specs yet)

export default function AdminTasksPage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Task Specs</h1>
      <p className="text-muted-foreground">
        Human procurement task queue. Tasks are created by the entity when automated
        resolution is insufficient (claim disputes, manual reviews, compliance checks).
        No tasks currently queued.
      </p>
    </div>
  )
}
