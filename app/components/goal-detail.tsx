"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
} from "react";
import {
  formatDueDate,
  getGoalProgress,
  getStageProgress,
  isGoal,
  readGoalResponse,
  type Goal,
  type GoalTheme,
  type Stage,
  type Task,
} from "@/lib/goal-types";

type GoalDetailProps = {
  personName: string;
  theme: GoalTheme;
  goalId: string;
};

type StageForm = { name: string; description: string };
type TaskForm = { name: string; description: string; dueDate: string };

const emptyStageForm: StageForm = { name: "", description: "" };
const emptyTaskForm: TaskForm = { name: "", description: "", dueDate: "" };

/** Tracks which stage/task is being edited inside each dialog. */
type TaskDialogState = { stageId: string; taskId: string | null } | null;
type StageDialogState = { stageId: string | null } | null;

export default function GoalDetail({ personName, theme, goalId }: GoalDetailProps) {
  const [goal, setGoal] = useState<Goal | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [actionError, setActionError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [stageDialog, setStageDialog] = useState<StageDialogState>(null);
  const [stageForm, setStageForm] = useState<StageForm>(emptyStageForm);
  const [taskDialog, setTaskDialog] = useState<TaskDialogState>(null);
  const [taskForm, setTaskForm] = useState<TaskForm>(emptyTaskForm);
  const [formError, setFormError] = useState("");

  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
  const [draggedStageId, setDraggedStageId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(new Set());

  const basePath = `/api/${theme}/goals/${goalId}`;
  const goalRef = useRef<Goal | null>(null);

  // Keep the ref in sync *after* render, never mutate it while rendering.
  useEffect(() => {
    goalRef.current = goal;
  }, [goal]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadGoal() {
      try {
        const response = await fetch(basePath, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result: unknown = await response.json();
        const payload =
          typeof result === "object" && result !== null
            ? (result as { goal?: unknown; error?: unknown })
            : {};

        if (!response.ok) {
          throw new Error(
            typeof payload.error === "string"
              ? payload.error
              : "This goal could not be loaded from the cloud.",
          );
        }
        if (!isGoal(payload.goal)) {
          throw new Error("The cloud database returned an invalid goal response.");
        }

        setGoal(payload.goal);
        setLoadError("");
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : "This goal could not be loaded from the cloud.",
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadGoal();
    return () => controller.abort();
  }, [basePath, loadAttempt]);

  /** Shared fetch helper: every mutation returns the full updated goal. */
  const sendRequest = useCallback(
    async (
      path: string,
      method: "POST" | "PUT" | "PATCH" | "DELETE",
      body?: unknown,
      fallbackMessage = "This change could not be saved. Please try again.",
    ): Promise<Goal> => {
      const response = await fetch(path, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return readGoalResponse(response, fallbackMessage);
    },
    [],
  );

  const stages = useMemo(
    () => (goal ? [...goal.stages].sort((a, b) => a.order - b.order) : []),
    [goal],
  );
  const goalProgress = goal ? getGoalProgress(goal) : 0;
  const totalTasks = stages.reduce((sum, stage) => sum + stage.tasks.length, 0);
  const completedTasks = stages.reduce(
    (sum, stage) => sum + stage.tasks.filter((task) => task.isCompleted).length,
    0,
  );

  // ─── Stage dialog ──────────────────────────────────────────────────────────
  function openCreateStage() {
    setFormError("");
    setStageForm(emptyStageForm);
    setStageDialog({ stageId: null });
  }

  function openEditStage(stage: Stage) {
    setFormError("");
    setStageForm({ name: stage.name, description: stage.description });
    setStageDialog({ stageId: stage.id });
  }

  function closeStageDialog() {
    setStageDialog(null);
    setFormError("");
  }

  async function submitStage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stageDialog) return;

    const name = stageForm.name.trim();
    if (!name) {
      setFormError("The stage name is required.");
      return;
    }

    setIsSaving(true);
    setFormError("");
    try {
      const isEditing = stageDialog.stageId !== null;
      const updated = await sendRequest(
        isEditing ? `${basePath}/stages/${stageDialog.stageId}` : `${basePath}/stages`,
        isEditing ? "PUT" : "POST",
        { name, description: stageForm.description.trim() },
        "This stage could not be saved. Please try again.",
      );
      setGoal(updated);
      closeStageDialog();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "This stage could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteStage(stage: Stage) {
    const confirmed = window.confirm(
      `Delete the stage "${stage.name}" and its ${stage.tasks.length} task(s)?`,
    );
    if (!confirmed) return;

    setActionError("");
    try {
      const updated = await sendRequest(
        `${basePath}/stages/${stage.id}`,
        "DELETE",
        undefined,
        "This stage could not be deleted.",
      );
      setGoal(updated);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "This stage could not be deleted.",
      );
    }
  }

  // ─── Task dialog ───────────────────────────────────────────────────────────
  function openCreateTask(stageId: string) {
    setFormError("");
    setTaskForm(emptyTaskForm);
    setTaskDialog({ stageId, taskId: null });
  }

  function openEditTask(stageId: string, task: Task) {
    setFormError("");
    setTaskForm({
      name: task.name,
      description: task.description,
      dueDate: task.dueDate ?? "",
    });
    setTaskDialog({ stageId, taskId: task.id });
  }

  function closeTaskDialog() {
    setTaskDialog(null);
    setFormError("");
  }

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taskDialog) return;

    const name = taskForm.name.trim();
    if (!name) {
      setFormError("The task name is required.");
      return;
    }

    setIsSaving(true);
    setFormError("");
    try {
      const { stageId, taskId } = taskDialog;
      const updated = await sendRequest(
        taskId
          ? `${basePath}/stages/${stageId}/tasks/${taskId}`
          : `${basePath}/stages/${stageId}/tasks`,
        taskId ? "PUT" : "POST",
        {
          name,
          description: taskForm.description.trim(),
          dueDate: taskForm.dueDate.trim() || null,
        },
        "This task could not be saved. Please try again.",
      );
      setGoal(updated);
      closeTaskDialog();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "This task could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  /** Optimistically toggles a task so the progress bar reacts instantly. */
  async function toggleTask(stageId: string, task: Task) {
    const previous = goalRef.current;
    setPendingTaskIds((current) => new Set(current).add(task.id));
    setGoal((current) =>
      current
        ? {
            ...current,
            stages: current.stages.map((stage) =>
              stage.id === stageId
                ? {
                    ...stage,
                    tasks: stage.tasks.map((item) =>
                      item.id === task.id
                        ? { ...item, isCompleted: !item.isCompleted }
                        : item,
                    ),
                  }
                : stage,
            ),
          }
        : current,
    );
    setActionError("");

    try {
      const updated = await sendRequest(
        `${basePath}/stages/${stageId}/tasks/${task.id}`,
        "PATCH",
        { isCompleted: !task.isCompleted },
        "This task could not be updated.",
      );
      setGoal(updated);
    } catch (error) {
      setGoal(previous); // roll back the optimistic change
      setActionError(
        error instanceof Error ? error.message : "This task could not be updated.",
      );
    } finally {
      setPendingTaskIds((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
    }
  }

  async function deleteTask(stageId: string, task: Task) {
    if (!window.confirm(`Delete the task "${task.name}"?`)) return;

    setActionError("");
    try {
      const updated = await sendRequest(
        `${basePath}/stages/${stageId}/tasks/${task.id}`,
        "DELETE",
        undefined,
        "This task could not be deleted.",
      );
      setGoal(updated);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "This task could not be deleted.",
      );
    }
  }

  // ─── Drag and drop reordering ──────────────────────────────────────────────
  async function persistOrder(orderedStages: Stage[]) {
    const previous = goalRef.current;
    setGoal((current) =>
      current
        ? {
            ...current,
            stages: orderedStages.map((stage, index) => ({ ...stage, order: index })),
          }
        : current,
    );
    setActionError("");

    try {
      const updated = await sendRequest(
        `${basePath}/stages`,
        "PATCH",
        { stageIds: orderedStages.map((stage) => stage.id) },
        "The new stage order could not be saved.",
      );
      setGoal(updated);
    } catch (error) {
      setGoal(previous); // roll back
      setActionError(
        error instanceof Error
          ? error.message
          : "The new stage order could not be saved.",
      );
    }
  }

  function handleDrop(event: DragEvent<HTMLLIElement>, targetStageId: string) {
    event.preventDefault();
    setDragOverStageId(null);

    const sourceId = draggedStageId;
    setDraggedStageId(null);
    if (!sourceId || sourceId === targetStageId) return;

    const fromIndex = stages.findIndex((stage) => stage.id === sourceId);
    const toIndex = stages.findIndex((stage) => stage.id === targetStageId);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...stages];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    void persistOrder(reordered);
  }

  /** Keyboard-accessible alternative to dragging. */
  function moveStage(stageId: string, direction: -1 | 1) {
    const index = stages.findIndex((stage) => stage.id === stageId);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= stages.length) return;

    const reordered = [...stages];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    void persistOrder(reordered);
  }

  function toggleCollapse(stageId: string) {
    setCollapsedStages((current) => {
      const next = new Set(current);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <main className={`profile-page profile-page--${theme} detail-page`}>
        <div className="profile-glow" aria-hidden="true" />
        <p className="empty-goals">Loading this goal...</p>
      </main>
    );
  }

  if (!goal) {
    return (
      <main className={`profile-page profile-page--${theme} detail-page`}>
        <div className="profile-glow" aria-hidden="true" />
        <div className="empty-goals">
          <span className="empty-goals-icon" aria-hidden="true">✦</span>
          <h3>We couldn&apos;t open this goal</h3>
          <p>{loadError || "This goal is no longer available."}</p>
          <div className="detail-error-actions">
            <button
              className="empty-create-button"
              type="button"
              onClick={() => {
                setIsLoading(true);
                setLoadAttempt((attempt) => attempt + 1);
              }}
            >
              Try again
            </button>
            <Link className="detail-back-link" href={`/${theme}`}>
              Back to goals
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`profile-page profile-page--${theme} detail-page`}
      style={{ "--goal-color": goal.color } as CSSProperties}
    >
      <div className="detail-aura" aria-hidden="true" />
      <div className="detail-aura detail-aura--secondary" aria-hidden="true" />

      <header className="detail-header">
        <Link
          className="home-link"
          href={`/${theme}`}
          aria-label={`Back to ${personName}'s goals`}
          title="Back to goals"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 5 8 12l7 7"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.9"
            />
          </svg>
        </Link>
        <span className="detail-breadcrumb">{personName} · Goal</span>
        <button className="detail-add-stage" type="button" onClick={openCreateStage}>
          <span aria-hidden="true">+</span>
          <span>New stage</span>
        </button>
      </header>

      <section className="detail-hero" aria-labelledby="detail-title">
        <span className="detail-hero-emoji" aria-hidden="true">{goal.emoji}</span>
        <div className="detail-hero-copy">
          <h1 className="detail-title" id="detail-title">{goal.name}</h1>
          <p className="detail-success">{goal.successDefinition}</p>
        </div>

        <dl className="detail-meta">
          <div className="detail-meta-item">
            <dt>Target date</dt>
            <dd><time dateTime={goal.dueDate}>{formatDueDate(goal.dueDate)}</time></dd>
          </div>
          <div className="detail-meta-item">
            <dt>Stages</dt>
            <dd>{stages.length}</dd>
          </div>
          <div className="detail-meta-item">
            <dt>Tasks done</dt>
            <dd>{completedTasks} / {totalTasks}</dd>
          </div>
        </dl>

        <div className="detail-overall">
          <div className="detail-overall-top">
            <span>Overall progress</span>
            <strong>{goalProgress}%</strong>
          </div>
          <div
            className="progress-track progress-track--large"
            role="progressbar"
            aria-valuenow={goalProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Overall goal progress"
          >
            <span className="progress-fill" style={{ width: `${goalProgress}%` }}>
              <span className="progress-shine" aria-hidden="true" />
            </span>
          </div>
        </div>
      </section>

      {actionError && (
        <div className="storage-error detail-action-error" role="alert">
          <span>{actionError}</span>
          <button
            className="retry-goals-button"
            type="button"
            onClick={() => setActionError("")}
          >
            Dismiss
          </button>
        </div>
      )}

      <section className="stages-section" aria-labelledby="stages-heading">
        <div className="stages-intro">
          <h2 className="stages-heading" id="stages-heading">Stages</h2>
          <p className="stages-description">
            Break this dream into blocks. Drag a stage to reorder your roadmap.
          </p>
        </div>

        {stages.length === 0 ? (
          <div className="empty-goals empty-stages">
            <span className="empty-goals-icon" aria-hidden="true">◇</span>
            <h3>No stages yet</h3>
            <p>Add your first stage and start shaping the path to this goal.</p>
            <button className="empty-create-button" type="button" onClick={openCreateStage}>
              Create your first stage
            </button>
          </div>
        ) : (
          <ol className="stage-list">
            {stages.map((stage, index) => {
              const progress = getStageProgress(stage);
              const isCollapsed = collapsedStages.has(stage.id);
              const isComplete = progress === 100 && stage.tasks.length > 0;

              return (
                <li
                  key={stage.id}
                  className={[
                    "stage-card",
                    draggedStageId === stage.id ? "is-dragging" : "",
                    dragOverStageId === stage.id ? "is-drop-target" : "",
                    isComplete ? "is-complete" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ animationDelay: `${index * 60}ms` }}
                  draggable
                  onDragStart={(event) => {
                    setDraggedStageId(stage.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", stage.id);
                  }}
                  onDragEnd={() => {
                    setDraggedStageId(null);
                    setDragOverStageId(null);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    if (dragOverStageId !== stage.id) setDragOverStageId(stage.id);
                  }}
                  onDragLeave={() => {
                    if (dragOverStageId === stage.id) setDragOverStageId(null);
                  }}
                  onDrop={(event) => handleDrop(event, stage.id)}
                >
                  <div className="stage-top">
                    <span className="stage-grip" aria-hidden="true" title="Drag to reorder">
                      <span /><span /><span />
                      <span /><span /><span />
                    </span>

                    <span className="stage-index">{String(index + 1).padStart(2, "0")}</span>

                    <button
                      className="stage-title-button"
                      type="button"
                      onClick={() => toggleCollapse(stage.id)}
                      aria-expanded={!isCollapsed}
                    >
                      <span className="stage-name">{stage.name}</span>
                      <span
                        className={`stage-chevron ${isCollapsed ? "is-collapsed" : ""}`}
                        aria-hidden="true"
                      >
                        ⌄
                      </span>
                    </button>

                    <div className="stage-actions">
                      <button
                        className="icon-button"
                        type="button"
                        title="Move stage up"
                        aria-label={`Move stage ${stage.name} up`}
                        disabled={index === 0}
                        onClick={() => moveStage(stage.id, -1)}
                      >
                        ↑
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        title="Move stage down"
                        aria-label={`Move stage ${stage.name} down`}
                        disabled={index === stages.length - 1}
                        onClick={() => moveStage(stage.id, 1)}
                      >
                        ↓
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        title="Edit stage"
                        aria-label={`Edit stage ${stage.name}`}
                        onClick={() => openEditStage(stage)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path
                            d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.7"
                          />
                        </svg>
                      </button>
                      <button
                        className="icon-button icon-button--danger"
                        type="button"
                        title="Delete stage"
                        aria-label={`Delete stage ${stage.name}`}
                        onClick={() => deleteStage(stage)}
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  <div className="stage-progress">
                    <div
                      className="progress-track"
                      role="progressbar"
                      aria-valuenow={progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Progress for stage ${stage.name}`}
                    >
                      <span className="progress-fill" style={{ width: `${progress}%` }}>
                        <span className="progress-shine" aria-hidden="true" />
                      </span>
                    </div>
                    <span className="stage-progress-value">
                      {progress}%
                      {isComplete && <span className="stage-complete-badge">Done ✓</span>}
                    </span>
                  </div>

                  {!isCollapsed && (
                    <div className="stage-body">
                      {stage.description && (
                        <p className="stage-description">{stage.description}</p>
                      )}

                      {stage.tasks.length > 0 ? (
                        <ul className="task-list">
                          {stage.tasks.map((task) => (
                            <li
                              key={task.id}
                              className={`task-row ${task.isCompleted ? "is-done" : ""}`}
                            >
                              <button
                                className="task-check"
                                type="button"
                                role="checkbox"
                                aria-checked={task.isCompleted}
                                aria-label={`Mark ${task.name} as ${
                                  task.isCompleted ? "pending" : "complete"
                                }`}
                                disabled={pendingTaskIds.has(task.id)}
                                onClick={() => toggleTask(stage.id, task)}
                              >
                                <span className="task-check-mark" aria-hidden="true">✓</span>
                              </button>

                              <span className="task-copy">
                                <span className="task-name">{task.name}</span>
                                {task.description && (
                                  <span className="task-description">{task.description}</span>
                                )}
                                {task.dueDate && (
                                  <time className="task-due" dateTime={task.dueDate}>
                                    ◷ {formatDueDate(task.dueDate)}
                                  </time>
                                )}
                              </span>

                              <span className="task-actions">
                                <button
                                  className="icon-button"
                                  type="button"
                                  title="Edit task"
                                  aria-label={`Edit task ${task.name}`}
                                  onClick={() => openEditTask(stage.id, task)}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <path
                                      d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z"
                                      stroke="currentColor"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="1.7"
                                    />
                                  </svg>
                                </button>
                                <button
                                  className="icon-button icon-button--danger"
                                  type="button"
                                  title="Delete task"
                                  aria-label={`Delete task ${task.name}`}
                                  onClick={() => deleteTask(stage.id, task)}
                                >
                                  ×
                                </button>
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="stage-empty">No tasks in this stage yet.</p>
                      )}

                      <button
                        className="add-task-button"
                        type="button"
                        onClick={() => openCreateTask(stage.id)}
                      >
                        <span aria-hidden="true">+</span> Add task
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {stageDialog && (
        <div className="goal-modal-backdrop" onClick={closeStageDialog}>
          <section
            className="goal-modal stage-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stage-modal-title"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeStageDialog();
            }}
          >
            <div className="goal-modal-heading">
              <div>
                <p className="profile-eyebrow">BUILD YOUR ROADMAP</p>
                <h2 id="stage-modal-title">
                  {stageDialog.stageId ? "Edit stage" : "Create a new stage"}
                </h2>
                <p>Group related tasks into a meaningful block of progress.</p>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label="Close dialog"
                onClick={closeStageDialog}
              >
                ×
              </button>
            </div>

            <form className="stack-form" onSubmit={submitStage}>
              <label className="goal-field">
                <span>Stage name</span>
                <input
                  autoFocus
                  type="text"
                  name="stageName"
                  placeholder="e.g. Research and planning"
                  maxLength={120}
                  value={stageForm.name}
                  onChange={(event) =>
                    setStageForm({ ...stageForm, name: event.target.value })
                  }
                  required
                />
              </label>
              <label className="goal-field">
                <span>Description</span>
                <textarea
                  name="stageDescription"
                  placeholder="What does this stage cover?"
                  rows={3}
                  maxLength={600}
                  value={stageForm.description}
                  onChange={(event) =>
                    setStageForm({ ...stageForm, description: event.target.value })
                  }
                />
              </label>

              {formError && (
                <p className="storage-error form-error" role="alert">{formError}</p>
              )}

              <div className="goal-form-actions">
                <button
                  className="cancel-goal-button"
                  type="button"
                  onClick={closeStageDialog}
                >
                  Cancel
                </button>
                <button className="save-goal-button" type="submit" disabled={isSaving}>
                  {isSaving
                    ? "Saving..."
                    : stageDialog.stageId
                      ? "Save changes"
                      : "Create stage"}
                  <span aria-hidden="true">↗</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {taskDialog && (
        <div className="goal-modal-backdrop" onClick={closeTaskDialog}>
          <section
            className="goal-modal stage-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-modal-title"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeTaskDialog();
            }}
          >
            <div className="goal-modal-heading">
              <div>
                <p className="profile-eyebrow">ONE STEP AT A TIME</p>
                <h2 id="task-modal-title">
                  {taskDialog.taskId ? "Edit task" : "Create a new task"}
                </h2>
                <p>Small, clear actions make big dreams feel reachable.</p>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label="Close dialog"
                onClick={closeTaskDialog}
              >
                ×
              </button>
            </div>

            <form className="stack-form" onSubmit={submitTask}>
              <label className="goal-field">
                <span>Task name</span>
                <input
                  autoFocus
                  type="text"
                  name="taskName"
                  placeholder="e.g. Book the training plan"
                  maxLength={120}
                  value={taskForm.name}
                  onChange={(event) =>
                    setTaskForm({ ...taskForm, name: event.target.value })
                  }
                  required
                />
              </label>
              <label className="goal-field">
                <span>Description</span>
                <textarea
                  name="taskDescription"
                  placeholder="Add any detail that helps you start."
                  rows={3}
                  maxLength={600}
                  value={taskForm.description}
                  onChange={(event) =>
                    setTaskForm({ ...taskForm, description: event.target.value })
                  }
                />
              </label>
              <label className="goal-field">
                <span>
                  Due date <em className="field-optional">(optional)</em>
                </span>
                <input
                  type="date"
                  name="taskDueDate"
                  value={taskForm.dueDate}
                  onChange={(event) =>
                    setTaskForm({ ...taskForm, dueDate: event.target.value })
                  }
                />
              </label>

              {formError && (
                <p className="storage-error form-error" role="alert">{formError}</p>
              )}

              <div className="goal-form-actions">
                <button
                  className="cancel-goal-button"
                  type="button"
                  onClick={closeTaskDialog}
                >
                  Cancel
                </button>
                <button className="save-goal-button" type="submit" disabled={isSaving}>
                  {isSaving
                    ? "Saving..."
                    : taskDialog.taskId
                      ? "Save changes"
                      : "Create task"}
                  <span aria-hidden="true">↗</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

