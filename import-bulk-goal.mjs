import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import mongoose from "mongoose";
import nextEnv from "@next/env";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const { loadEnvConfig } = nextEnv;

const GOAL_ID = "6ac5a1a5b9e2c61995baf5e4";
const EXPECTED_STAGE_COUNT = 5;
const EXPECTED_TASK_COUNT = 115;
const FALLBACK_DNS_SERVERS = ["1.1.1.1", "8.8.8.8", "1.0.0.1", "8.8.4.4"];

function parseCsv(content, filePath) {
  const rows = [];
  let row = [];
  let field = "";
  let insideQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (insideQuotes) {
      if (character === '"') {
        if (content[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          insideQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      insideQuotes = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (character === "\r" && content[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }

  if (insideQuotes) {
    throw new Error(`CSV con comillas sin cerrar: ${filePath}`);
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) {
    throw new Error(`El CSV está vacío: ${filePath}`);
  }

  const headers = rows.shift();
  headers[0] = headers[0].replace(/^\uFEFF/, "");
  const records = [];

  for (const [index, values] of rows.entries()) {
    if (values.length === 1 && values[0] === "") continue;
    if (values.length !== headers.length) {
      throw new Error(
        `Fila ${index + 2} inválida en ${filePath}: se esperaban ${headers.length} columnas y hay ${values.length}.`,
      );
    }

    records.push(
      Object.fromEntries(headers.map((header, column) => [header, values[column]])),
    );
  }

  return records;
}

function loadBulkData() {
  const bulkDirectory = path.join(scriptDirectory, "bulk");
  const stagesPath = path.join(bulkDirectory, "stages.csv");
  const tasksPath = path.join(bulkDirectory, "tasks.csv");
  const stageRows = parseCsv(fs.readFileSync(stagesPath, "utf8"), stagesPath);
  const taskRows = parseCsv(fs.readFileSync(tasksPath, "utf8"), tasksPath);

  const stagesByName = new Map();
  for (const stageRow of stageRows) {
    const name = stageRow["Block Name"]?.trim();
    const description = stageRow.Description?.trim();
    if (!name || !description) {
      throw new Error("Cada etapa debe tener Block Name y Description.");
    }
    if (stagesByName.has(name)) {
      throw new Error(`Nombre de etapa duplicado en stages.csv: ${name}`);
    }
    stagesByName.set(name, { name, description, tasks: [] });
  }

  for (const taskRow of taskRows) {
    const stageName = taskRow["Block Name"]?.trim();
    const name = taskRow["Task Name"]?.trim();
    const description = taskRow.Description?.trim();
    const stage = stagesByName.get(stageName);

    if (!stage) {
      throw new Error(`La tarea "${name || "(sin nombre)"}" apunta a una etapa desconocida: ${stageName}`);
    }
    if (!name || !description) {
      throw new Error("Cada tarea debe tener Task Name y Description.");
    }
    stage.tasks.push({ name, description });
  }

  const stages = [...stagesByName.values()];
  const taskCount = stages.reduce((total, stage) => total + stage.tasks.length, 0);
  if (stages.length !== EXPECTED_STAGE_COUNT || taskCount !== EXPECTED_TASK_COUNT) {
    throw new Error(
      `Los CSV deben contener ${EXPECTED_STAGE_COUNT} etapas y ${EXPECTED_TASK_COUNT} tareas; se encontraron ${stages.length} etapas y ${taskCount} tareas.`,
    );
  }
  if (stages.some((stage) => stage.tasks.length === 0)) {
    throw new Error("Cada etapa debe tener al menos una tarea.");
  }
  for (const stage of stages) {
    if (stage.name.length > 120 || stage.description.length > 600) {
      throw new Error(`La etapa "${stage.name}" excede los límites del modelo.`);
    }
    for (const task of stage.tasks) {
      if (task.name.length > 120 || task.description.length > 600) {
        throw new Error(`La tarea "${task.name}" excede los límites del modelo.`);
      }
    }
  }

  return { stages, taskCount };
}

function getDatabaseName(uri) {
  if (process.env.MONGODB_DATABASE) return process.env.MONGODB_DATABASE;

  const match = uri.match(
    /^mongodb(?:\+srv)?:\/\/(?:[^/@]+@)?[^/?#]+\/([^/?#]+)/i,
  );
  if (!match?.[1]) return "dream-tracker";

  try {
    return decodeURIComponent(match[1]);
  } catch {
    throw new Error("El nombre de base de datos en MONGODB_URI tiene una codificación inválida.");
  }
}

function ensureUsableDnsServers() {
  if (process.env.NODE_ENV === "production") return;

  const override = process.env.MONGODB_DNS_SERVERS?.split(",")
    .map((server) => server.trim())
    .filter(Boolean);
  const currentServers = dns.getServers();
  const usableServers = currentServers.filter((server) => {
    const address = server.trim().toLowerCase().replace(/^\[/, "").replace(/\](?::\d+)?$/, "");
    return (
      address.length > 0 &&
      address !== "::1" &&
      !/^127\./.test(address) &&
      !/^fe80:/.test(address)
    );
  });
  const servers = override?.length
    ? override
    : usableServers.length > 0
      ? null
      : FALLBACK_DNS_SERVERS;

  if (servers) {
    dns.setServers(servers);
    dnsPromises.setServers(servers);
    console.log(`DNS: usando servidores ${override?.length ? "configurados" : "de respaldo"}.`);
  }
}

async function buildDirectUriFromSrv(srvUri) {
  const { resolveSrv, resolveTxt } = dnsPromises;
  const parsed = new URL(srvUri.replace(/^mongodb\+srv:\/\//i, "mongodb://"));
  const srvRecords = await resolveSrv(`_mongodb._tcp.${parsed.hostname}`);
  if (!srvRecords.length) {
    throw new Error(`No se encontraron registros SRV para ${parsed.hostname}.`);
  }

  const hosts = srvRecords.map((record) => `${record.name}:${record.port}`).join(",");
  let txtOptions = "";
  try {
    txtOptions = (await resolveTxt(parsed.hostname)).flat().join("&");
  } catch {
    // Los registros TXT son opcionales en algunos clusters.
  }

  const params = new URLSearchParams(parsed.search);
  if (txtOptions) {
    for (const [key, value] of new URLSearchParams(txtOptions)) {
      if (!params.has(key)) params.set(key, value);
    }
  }
  if (!params.has("tls") && !params.has("ssl")) params.set("tls", "true");

  const auth = parsed.username
    ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ""}@`
    : "";
  const databasePath = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
  return `mongodb://${auth}${hosts}${databasePath}?${params.toString()}`;
}

async function connectToMongo(uri) {
  const dbName = getDatabaseName(uri);
  ensureUsableDnsServers();

  try {
    return await mongoose.connect(uri, { dbName });
  } catch (error) {
    const dnsFailure =
      error instanceof Error && /querySrv|queryTxt|ENODATA|ESERVFAIL|EREFUSED/i.test(error.message);
    if (!/^mongodb\+srv:\/\//i.test(uri) || !dnsFailure) throw error;

    console.warn("MongoDB: falló la resolución SRV inicial; intentando resolver los hosts directamente.");
    await mongoose.disconnect();
    const directUri = await buildDirectUriFromSrv(uri);
    return mongoose.connect(directUri, { dbName });
  }
}

async function insertStagesAndTasks(stages) {
  const uri = process.env.MONGODB_URI;
  if (!uri || !/^mongodb(?:\+srv)?:\/\//i.test(uri)) {
    throw new Error("Configura MONGODB_URI en .env.local o en el entorno.");
  }

  await connectToMongo(uri);
  const goals = mongoose.connection.collection("goals");
  const goalId = new mongoose.Types.ObjectId(GOAL_ID);
  const goal = await goals.findOne({ _id: goalId }, { projection: { stages: 1 } });

  if (!goal) {
    throw new Error(`No existe un goal con el id ${GOAL_ID}.`);
  }

  const existingStages = Array.isArray(goal.stages) ? goal.stages : [];
  const targetNames = stages.map((stage) => stage.name);
  const existingNames = new Set(existingStages.map((stage) => stage.name));
  const alreadyPresent = targetNames.filter((name) => existingNames.has(name));
  if (alreadyPresent.length > 0) {
    throw new Error(
      `No se insertó nada: ya existen etapas con estos nombres: ${alreadyPresent.join(", ")}.`,
    );
  }

  const now = new Date();
  const nextOrder =
    existingStages.length === 0
      ? 0
      : Math.max(...existingStages.map((stage) => stage.order ?? -1)) + 1;
  const newStages = stages.map((stage, stageIndex) => ({
    _id: new mongoose.Types.ObjectId(),
    name: stage.name,
    description: stage.description,
    order: nextOrder + stageIndex,
    tasks: stage.tasks.map((task) => ({
      _id: new mongoose.Types.ObjectId(),
      name: task.name,
      description: task.description,
      dueDate: null,
      isCompleted: false,
      createdAt: now,
      updatedAt: now,
    })),
    createdAt: now,
    updatedAt: now,
  }));

  const result = await goals.updateOne(
    {
      _id: goalId,
      stages: { $size: existingStages.length },
      "stages.name": { $nin: targetNames },
    },
    {
      $push: { stages: { $each: newStages } },
      $set: { updatedAt: now },
    },
  );

  if (result.modifiedCount !== 1) {
    throw new Error(
      "No se insertó nada: el goal cambió durante la operación o ya contiene alguna de las etapas del CSV. Vuelve a revisar el goal.",
    );
  }

  return newStages;
}

async function main() {
  loadEnvConfig(scriptDirectory);
  const { stages, taskCount } = loadBulkData();

  if (process.argv.includes("--dry-run")) {
    console.log(`Validación correcta: ${stages.length} etapas y ${taskCount} tareas.`);
    for (const stage of stages) {
      console.log(`- ${stage.name}: ${stage.tasks.length} tareas`);
    }
    return;
  }

  const insertedStages = await insertStagesAndTasks(stages);
  console.log(
    `Insertadas ${insertedStages.length} etapas y ${taskCount} tareas en el goal ${GOAL_ID}.`,
  );
  for (const stage of insertedStages) {
    console.log(`- ${stage.name}: ${stage.tasks.length} tareas`);
  }
}

main()
  .catch((error) => {
    console.error("Falló la importación:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
