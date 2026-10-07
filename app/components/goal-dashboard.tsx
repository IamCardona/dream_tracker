"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import {
  expandHexColor,
  formatDueDate,
  getGoalProgress,
  getLocalDate,
  getStageProgress,
  isGoalList,
  type Goal,
  type GoalTheme,
} from "@/lib/goal-types";

type GoalDashboardProps = {
  personName: string;
  theme: GoalTheme;
};

type GoalForm = Omit<Goal, "id" | "stages">;

/**
 * Goals saved in localStorage by older versions of the app have no `stages`
 * field, so they need a looser guard than the current API payload shape.
 */
function isLegacyGoalList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((goal: unknown) => {
      if (typeof goal !== "object" || goal === null) return false;
      const candidate = goal as Record<string, unknown>;

      return (
        typeof candidate.id === "string" &&
        typeof candidate.emoji === "string" &&
        typeof candidate.name === "string" &&
        typeof candidate.dueDate === "string" &&
        typeof candidate.successDefinition === "string" &&
        typeof candidate.color === "string" &&
        /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(candidate.color)
      );
    })
  );
}

const emptyForm: GoalForm = {
  emoji: "",
  name: "",
  dueDate: "",
  successDefinition: "",
  color: "#7C6EF6",
};

export default function GoalDashboard({
  personName,
  theme,
}: GoalDashboardProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [form, setForm] = useState<GoalForm>(emptyForm);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadGoals() {
      try {
        const response = await fetch(`/api/${theme}/goals`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result: unknown = await response.json();
        const payload =
          typeof result === "object" && result !== null
            ? (result as { goals?: unknown; error?: unknown })
            : {};

        if (!response.ok) {
          throw new Error(
            typeof payload.error === "string"
              ? payload.error
              : "Your goals could not be loaded from the cloud.",
          );
        }
        if (!isGoalList(payload.goals)) {
          throw new Error("The cloud database returned an invalid goals response.");
        }

        setGoals(payload.goals);
        setLoadError("");

        try {
          const legacyGoalsJson = window.localStorage.getItem(
            `dream-tracker-goals-${theme}`,
          );
          if (legacyGoalsJson) {
            const legacyGoals: unknown = JSON.parse(legacyGoalsJson);
            if (!isLegacyGoalList(legacyGoals)) {
              throw new Error("Previously saved browser goals have an invalid format.");
            }

            if ((legacyGoals as unknown[]).length > 0) {
              const migrationResponse = await fetch(`/api/${theme}/goals/import`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ goals: legacyGoals }),
                signal: controller.signal,
              });
              const migrationResult: unknown = await migrationResponse.json();
              const migrationPayload =
                typeof migrationResult === "object" && migrationResult !== null
                  ? (migrationResult as { goals?: unknown; error?: unknown })
                  : {};

              if (!migrationResponse.ok || !isGoalList(migrationPayload.goals)) {
                throw new Error(
                  typeof migrationPayload.error === "string"
                    ? migrationPayload.error
                    : "Previously saved browser goals could not be moved to the cloud.",
                );
              }

              setGoals(migrationPayload.goals);
            }

            window.localStorage.removeItem(`dream-tracker-goals-${theme}`);
          }
        } catch (error) {
          if (controller.signal.aborted) return;
          setLoadError(
            error instanceof Error
              ? `Cloud goals are loaded, but browser goals could not be migrated: ${error.message}`
              : "Cloud goals are loaded, but browser goals could not be migrated.",
          );
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : "Your goals could not be loaded from the cloud.",
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadGoals();
    return () => controller.abort();
  }, [loadAttempt, theme]);

  function openModal() {
    setFormError("");
    setForm(emptyForm);
    setEditingGoalId(null);
    setIsModalOpen(true);
  }

  function openEditModal(goal: Goal) {
    setFormError("");
    setForm({
      emoji: goal.emoji,
      name: goal.name,
      dueDate: goal.dueDate,
      successDefinition: goal.successDefinition,
      color: goal.color,
    });
    setEditingGoalId(goal.id);
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setFormError("");
    setEditingGoalId(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(form.color)) {
      setFormError("Enter a valid HEX color, such as #7C6EF6.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/${theme}/goals${editingGoalId ? `/${editingGoalId}` : ""}`,
        {
          method: editingGoalId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            color: form.color.toUpperCase(),
          }),
        },
      );
      const result: unknown = await response.json();
      const payload =
        typeof result === "object" && result !== null
          ? (result as { goal?: unknown; error?: unknown })
          : {};

      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "This goal could not be saved. Please try again.",
        );
      }
      if (!isGoalList([payload.goal])) {
        throw new Error("The cloud database returned an invalid goal response.");
      }

      const [savedGoal] = [payload.goal] as Goal[];
      setGoals((currentGoals) =>
        editingGoalId
          ? currentGoals.map((goal) => (goal.id === editingGoalId ? savedGoal : goal))
          : [savedGoal, ...currentGoals],
      );
      closeModal();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "This goal could not be saved to the cloud. Check your connection and try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className={`profile-page profile-page--${theme} dashboard-page`}>
      <div className="profile-glow" aria-hidden="true" />
      <header className="profile-header dashboard-header">
        <Link className="home-link" href="/" aria-label="Back to home" title="Back to home">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="m3.5 10 8.5-7 8.5 7v10a1 1 0 0 1-1 1h-5.25v-6.5h-4.5V21H4.5a1 1 0 0 1-1-1V10Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        </Link>
        <h1 className="profile-title dashboard-title">
          {personName}<span>.</span>
        </h1>
        <button
          className="create-goal-button"
          type="button"
          onClick={openModal}
          disabled={isLoading}
        >
          <span className="create-goal-plus" aria-hidden="true">+</span>
          <span>New goal</span>
        </button>
      </header>

      <section className="goals-section" aria-labelledby="goals-heading">
        <div className="goals-intro">
          <p className="profile-eyebrow">DREAM TRACKER</p>
          <h2 className="goals-heading" id="goals-heading">Your goals</h2>
          <p className="goals-description">Small steps, big dreams. Keep your next adventure in sight.</p>
        </div>

        {loadError && (
          <div className="storage-error" role="alert">
            <span>{loadError}</span>
            <button
              className="retry-goals-button"
              type="button"
              onClick={() => {
                setIsLoading(true);
                setLoadAttempt((attempt) => attempt + 1);
              }}
            >
              Retry
            </button>
          </div>
        )}

        {isLoading ? (
          <p className="empty-goals">Loading your goals...</p>
        ) : goals.length > 0 ? (
          <ul className="goal-list">
            {goals.map((goal) => (
              <li
                className="goal-list-item"
                key={goal.id}
                style={{ "--goal-color": goal.color } as CSSProperties}
              >
                <Link
                  className="goal-card"
                  href={`/${theme}/goals/${goal.id}`}
                  aria-label={`Open goal: ${goal.name}`}
                  title={`Open ${goal.name}`}
                >
                  <span className="goal-emoji" aria-hidden="true">{goal.emoji}</span>
                  <span className="goal-copy">
                    <span className="goal-name">{goal.name}</span>
                    <span className="goal-success">{goal.successDefinition}</span>

                    {goal.stages.length > 0 && (
                      <span className="goal-stage-bars">
                        {goal.stages.map((stage) => {
                          const stageProgress = getStageProgress(stage);
                          return (
                            <span
                              className="goal-stage-bar"
                              key={stage.id}
                              title={`${stage.name}: ${stageProgress}%`}
                            >
                              <span className="goal-stage-bar-label">{stage.name}</span>
                              <span className="progress-track progress-track--mini">
                                <span
                                  className="progress-fill"
                                  style={{ width: `${stageProgress}%` }}
                                />
                              </span>
                            </span>
                          );
                        })}
                      </span>
                    )}
                  </span>

                  <span className="goal-card-details">
                    <time className="goal-date" dateTime={goal.dueDate}>
                      <span className="goal-date-label">DUE DATE</span>
                      {formatDueDate(goal.dueDate)}
                    </time>
                    <span className="goal-progress-chip">
                      {getGoalProgress(goal)}% done
                    </span>
                    <span className="goal-open-hint">OPEN ↗</span>
                  </span>
                </Link>

                <button
                  className="goal-edit-button"
                  type="button"
                  aria-label={`Edit goal: ${goal.name}`}
                  title={`Edit ${goal.name}`}
                  onClick={() => openEditModal(goal)}
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
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-goals">
            <span className="empty-goals-icon" aria-hidden="true">✦</span>
            <h3>Your next big thing starts here</h3>
            <p>Create a goal and give your dreams a date, a plan, and a little color.</p>
            <button className="empty-create-button" type="button" onClick={openModal}>
              Create your first goal
            </button>
          </div>
        )}
      </section>

      {isModalOpen && (
        <div className="goal-modal-backdrop" onClick={closeModal}>
          <section
            className="goal-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="goal-modal-title"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeModal();
            }}
          >
            <div className="goal-modal-heading">
              <div>
                <p className="profile-eyebrow">
                  {editingGoalId ? "KEEP YOUR DREAM ON TRACK" : "MAKE IT HAPPEN"}
                </p>
                <h2 id="goal-modal-title">
                  {editingGoalId ? "Edit your goal" : "Create a new goal"}
                </h2>
                <p>
                  {editingGoalId
                    ? "Update the details and keep moving toward your dream."
                    : "Give your next big idea a name, a date, and a little color."}
                </p>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label="Close dialog"
                onClick={closeModal}
              >
                ×
              </button>
            </div>

            <form className="goal-form" onSubmit={handleSubmit}>
              <label className="goal-field goal-field--emoji">
                <span>Emoji</span>
                <input
                  autoFocus
                  type="text"
                  name="emoji"
                  placeholder="🌱"
                  aria-label="Goal emoji"
                  value={form.emoji}
                  onChange={(event) => setForm({ ...form, emoji: event.target.value })}
                  required
                />
              </label>
              <label className="goal-field goal-field--name">
                <span>Goal name</span>
                <input
                  type="text"
                  name="name"
                  placeholder="e.g. Run my first 5K"
                  maxLength={80}
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  required
                />
              </label>
              <label className="goal-field goal-field--date">
                <span>Target date</span>
                <input
                  type="date"
                  name="dueDate"
                  min={editingGoalId ? undefined : getLocalDate()}
                  value={form.dueDate}
                  onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                  required
                />
              </label>
              <label className="goal-field goal-field--success">
                <span>What does success look like?</span>
                <textarea
                  name="successDefinition"
                  placeholder="Describe how you’ll know you’ve reached your goal..."
                  rows={3}
                  maxLength={400}
                  value={form.successDefinition}
                  onChange={(event) => setForm({ ...form, successDefinition: event.target.value })}
                  required
                />
              </label>
              <label className="goal-field goal-field--color">
                <span>HEX color</span>
                <span className="color-input-wrap">
                  <input
                    className="color-swatch"
                    type="color"
                    aria-label="Choose goal color"
                    value={/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(form.color) ? expandHexColor(form.color) : "#7C6EF6"}
                    onChange={(event) => setForm({ ...form, color: event.target.value.toUpperCase() })}
                  />
                  <input
                    type="text"
                    name="color"
                    placeholder="#7C6EF6"
                    pattern="#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})"
                    title="Use a 3 or 6 digit HEX color, such as #7C6EF6"
                    maxLength={7}
                    value={form.color}
                    onChange={(event) => setForm({ ...form, color: event.target.value })}
                    required
                  />
                </span>
              </label>

              {formError && <p className="storage-error form-error" role="alert">{formError}</p>}

              <div className="goal-form-actions">
                <button className="cancel-goal-button" type="button" onClick={closeModal}>
                  Cancel
                </button>
                <button className="save-goal-button" type="submit" disabled={isSaving}>
                  {isSaving ? "Saving..." : editingGoalId ? "Save changes" : "Create goal"}
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
