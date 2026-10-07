import mongoose, { Schema, type Model, type Types } from "mongoose";

export type GoalPerson = "abigail" | "iam";

export function isGoalPerson(person: string): person is GoalPerson {
  return person === "abigail" || person === "iam";
}

export interface TaskItem {
  _id: Types.ObjectId;
  name: string;
  description: string;
  dueDate: string | null;
  isCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StageItem {
  _id: Types.ObjectId;
  name: string;
  description: string;
  order: number;
  tasks: Types.DocumentArray<TaskItem>;
  createdAt: Date;
  updatedAt: Date;
}

export interface GoalDocument extends mongoose.Document {
  person: GoalPerson;
  legacyId?: string;
  emoji: string;
  name: string;
  dueDate: string;
  successDefinition: string;
  color: string;
  stages: Types.DocumentArray<StageItem>;
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<TaskItem>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 600,
    },
    dueDate: {
      type: String,
      default: null,
      validate: {
        validator: (value: string | null) =>
          value === null || /^\d{4}-\d{2}-\d{2}$/.test(value),
        message: "A task due date must use the YYYY-MM-DD format.",
      },
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true, versionKey: false, _id: true },
);

const stageSchema = new Schema<StageItem>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 600,
    },
    order: {
      type: Number,
      required: true,
      min: 0,
    },
    tasks: {
      type: [taskSchema],
      default: [],
    },
  },
  { timestamps: true, versionKey: false, _id: true },
);

const goalSchema = new Schema<GoalDocument>(
  {
    person: {
      type: String,
      enum: ["abigail", "iam"],
      required: true,
      index: true,
    },
    legacyId: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    emoji: {
      type: String,
      required: true,
      trim: true,
      maxlength: 32,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    dueDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    successDefinition: {
      type: String,
      required: true,
      trim: true,
      maxlength: 400,
    },
    color: {
      type: String,
      required: true,
      uppercase: true,
      match: /^#(?:[0-9A-F]{3}|[0-9A-F]{6})$/,
    },
    stages: {
      type: [stageSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "goals",
  },
);

goalSchema.index({ person: 1, updatedAt: -1 });
goalSchema.index(
  { person: 1, legacyId: 1 },
  {
    unique: true,
    partialFilterExpression: { legacyId: { $type: "string" } },
  },
);

const Goal =
  (mongoose.models.Goal as Model<GoalDocument> | undefined) ??
  mongoose.model<GoalDocument>("Goal", goalSchema);

export default Goal;
