import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = resolve(import.meta.dirname, "..");
const backendDir = resolve(root, "backend");
const frontendDir = resolve(root, "frontend");
const backendEntry = resolve(backendDir, "src", "index.js");
const frontendEntry = resolve(frontendDir, "node_modules", "vite", "bin", "vite.js");
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const processes = [];
let shuttingDown = false;

function log(message) {
  console.log(`[dev] ${message}`);
}

async function isHealthy(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

function startProcess(label, command, args, cwd, env = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
    windowsHide: false,
  });

  processes.push({ label, child });
  child.once("error", (error) => {
    console.error(`[${label}] failed to start: ${error.message}`);
    if (!shuttingDown) process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    if (!shuttingDown && code !== 0) {
      console.error(`[${label}] stopped unexpectedly (code=${code ?? "n/a"}, signal=${signal ?? "n/a"})`);
      void shutdown(code || 1);
    }
  });
  return child;
}

async function waitFor(url, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isHealthy(url)) return true;
    await delay(500);
  }
  console.error(`[dev] ${label} did not become available at ${url}`);
  return false;
}

async function ensureOllama() {
  if (await isHealthy(`${ollamaBaseUrl}/api/tags`)) {
    log(`Ollama is already running at ${ollamaBaseUrl}`);
    return true;
  }

  log("Starting Ollama...");
  startProcess("ollama", "ollama", ["serve"], root);
  return waitFor(`${ollamaBaseUrl}/api/tags`, "Ollama", 15_000);
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("Stopping local services...");
  for (const { child } of processes.slice().reverse()) {
    if (!child.killed) child.kill();
  }
  await delay(300);
  process.exit(code);
}

async function main() {
  if (!existsSync(resolve(backendDir, "node_modules"))) {
    throw new Error("Backend dependencies are missing. Run `npm install` from the project root first.");
  }
  if (!existsSync(frontendEntry)) {
    throw new Error("Frontend dependencies are missing. Run `npm install` from the project root first.");
  }

  if (!(await ensureOllama())) {
    throw new Error("Ollama is unavailable. Start Ollama or install it from https://ollama.com/download.");
  }

  if (await isHealthy("http://localhost:3001/health")) {
    log("Backend is already running at http://localhost:3001");
  } else {
    log("Starting backend on http://localhost:3001...");
    startProcess(
      "backend",
      process.execPath,
      ["--import", "./src/otel-preload.mjs", "--watch-path=src", "src/index.js"],
      backendDir,
    );

    if (!(await waitFor("http://localhost:3001/health", "backend"))) {
      throw new Error("Backend did not start. Check the backend output above.");
    }
  }

  if (await isHealthy("http://localhost:3000")) {
    log("Frontend is already running at http://localhost:3000");
  } else {
    log("Starting frontend on http://localhost:3000...");
    startProcess("frontend", process.execPath, [frontendEntry], frontendDir);
  }
  log("AI Powered QA Platform is starting. Open http://localhost:3000");
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

main().catch(async (error) => {
  console.error(`[dev] ${error.message}`);
  await shutdown(1);
});
