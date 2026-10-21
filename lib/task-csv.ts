export type CsvTask = {
  name: string;
  description: string;
  dueDate: string | null;
  isCompleted: boolean;
};

const MAX_TASKS_PER_IMPORT = 500;
const TASK_CSV_HEADERS = ["name", "description", "dueDate", "isCompleted"];

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];

    if (inQuotes) {
      if (character === '"') {
        if (csv[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (afterQuote && character !== "," && character !== "\r" && character !== "\n") {
      throw new Error("The CSV has unexpected characters after a quoted value.");
    }

    if (character === '"' && field.length === 0 && !afterQuote) {
      inQuotes = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
      afterQuote = false;
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
      afterQuote = false;
    } else {
      if (character === '"') {
        throw new Error("The CSV has a quote inside an unquoted value.");
      }
      field += character;
    }
  }

  if (inQuotes) throw new Error("The CSV has an unclosed quoted value.");

  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseTaskCsv(csv: string): CsvTask[] {
  const rows = parseCsvRows(csv.replace(/^\uFEFF/, ""));
  const header = rows.shift();
  if (!header) throw new Error("The CSV file is empty.");

  const headers = header.map((value) => value.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) {
    throw new Error("The CSV contains duplicate column names.");
  }

  const nameIndex = headers.indexOf("name");
  if (nameIndex === -1) {
    throw new Error('The CSV must include a "name" column.');
  }

  const descriptionIndex = headers.indexOf("description");
  const dueDateIndex = headers.indexOf("duedate");
  const completedIndex = headers.indexOf("iscompleted");
  const taskRows = rows.filter((values) => values.some((value) => value.trim() !== ""));

  if (taskRows.length === 0) {
    throw new Error("Add at least one task row to the CSV before importing.");
  }
  if (taskRows.length > MAX_TASKS_PER_IMPORT) {
    throw new Error(`A CSV can contain at most ${MAX_TASKS_PER_IMPORT} tasks.`);
  }

  return taskRows.map((values, index) => {
    const rowNumber = index + 2;
    const name = (values[nameIndex] ?? "").trim();
    const description =
      descriptionIndex === -1 ? "" : (values[descriptionIndex] ?? "").trim();
    const rawDueDate =
      dueDateIndex === -1 ? "" : (values[dueDateIndex] ?? "").trim();
    const rawCompleted =
      completedIndex === -1 ? "" : (values[completedIndex] ?? "").trim().toLowerCase();

    if (!name) throw new Error(`Row ${rowNumber}: task name is required.`);
    if (name.length > 120) {
      throw new Error(`Row ${rowNumber}: task name cannot exceed 120 characters.`);
    }
    if (description.length > 600) {
      throw new Error(`Row ${rowNumber}: description cannot exceed 600 characters.`);
    }
    if (rawDueDate && !isValidDate(rawDueDate)) {
      throw new Error(`Row ${rowNumber}: due date must be a real date in YYYY-MM-DD format.`);
    }
    if (rawCompleted && rawCompleted !== "true" && rawCompleted !== "false") {
      throw new Error(`Row ${rowNumber}: isCompleted must be true or false.`);
    }

    return {
      name,
      description,
      dueDate: rawDueDate || null,
      isCompleted: rawCompleted === "true",
    };
  });
}

function escapeCsvValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function createTaskCsv(tasks: CsvTask[]): string {
  return [
    TASK_CSV_HEADERS.join(","),
    ...tasks.map((task) =>
      [
        task.name,
        task.description,
        task.dueDate ?? "",
        String(task.isCompleted),
      ]
        .map(escapeCsvValue)
        .join(","),
    ),
  ].join("\r\n");
}

export function createTaskCsvTemplate(): string {
  return `${TASK_CSV_HEADERS.join(",")}\r\n`;
}
