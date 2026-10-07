import mongoose, { Schema, type Model } from "mongoose";

export type GoalPerson = "abigail" | "iam";

export interface GoalDocument extends mongoose.Document {
  person: GoalPerson;
  legacyId?: string;
  emoji: string;
  name: string;
  dueDate: string;
  successDefinition: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

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
