const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const action = process.argv[2];

if (!['start', 'stop'].includes(action)) {
  throw new Error('Usage: node frontend/scripts/frontend.js <start|stop>');
}

const frontendRoot = path.resolve(__dirname, '..');
const envFile = path.resolve(frontendRoot, '..', 'backend', '.env.dev');
const pidFile = path.join(frontendRoot, '.frontend-dev.pid');
const logFile = path.join(frontendRoot, '.frontend-dev.log');

process.loadEnvFile(envFile);

function requiredPort(name) {
  const value = Number(process.env[name]);

  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535 in ${envFile}.`);
  }

  return value;
}

function readManagedPid() {
  try {
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_error) {
    return false;
  }
}

function listeningPids(port) {
  if (process.platform === 'win32') {
    const command =
      `(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | ` +
      'Select-Object -ExpandProperty OwningProcess -Unique) -join "`n"';
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
      encoding: 'utf8',
      windowsHide: true
    });

    return String(result.stdout || '')
      .split(/\s+/)
      .map(Number)
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  }

  const result = spawnSync('lsof', [`-tiTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  return String(result.stdout || '')
    .split(/\s+/)
    .map(Number)
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

function stopProcess(pid) {
  if (!isRunning(pid)) {
    return;
  }

  if (process.platform === 'win32') {
    const result = spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'inherit',
      windowsHide: true
    });

    if (result.status !== 0 && isRunning(pid)) {
      throw new Error(`Could not stop frontend process ${pid}.`);
    }
    return;
  }

  process.kill(-pid, 'SIGTERM');
}

function removePidFile() {
  fs.rmSync(pidFile, { force: true });
}

function waitForPort(port, pid, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (!isRunning(pid)) {
        reject(new Error(`Frontend exited during startup. See ${logFile}.`));
        return;
      }

      const socket = net.createConnection({ host: 'localhost', port });
      socket.setTimeout(500);
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      const retry = () => {
        socket.destroy();
        if (Date.now() >= deadline) {
          reject(new Error(`Frontend did not start within ${timeoutMs / 1000} seconds. See ${logFile}.`));
          return;
        }
        setTimeout(attempt, 500);
      };
      socket.once('error', retry);
      socket.once('timeout', retry);
    };

    attempt();
  });
}

async function startFrontend() {
  const frontendPort = requiredPort('FRONTEND_PORT');
  requiredPort('BACKEND_PORT_HOST');

  const managedPid = readManagedPid();
  if (managedPid && isRunning(managedPid)) {
    console.log(`Frontend is already running on port ${frontendPort} (PID ${managedPid}).`);
    return;
  }
  removePidFile();

  const existingPids = listeningPids(frontendPort);
  if (existingPids.length > 0) {
    throw new Error(
      `FRONTEND_PORT ${frontendPort} is already in use by PID ${existingPids.join(', ')}. Run npm run frontend:stop first.`
    );
  }

  const angularCli = path.join(frontendRoot, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
  const logFd = fs.openSync(logFile, 'a');
  const child = spawn(
    process.execPath,
    [angularCli, 'serve', '--configuration', 'development', '--port', String(frontendPort), '--proxy-config', 'proxy.conf.js'],
    {
      cwd: frontendRoot,
      detached: true,
      env: process.env,
      stdio: ['ignore', logFd, logFd],
      windowsHide: true
    }
  );
  fs.closeSync(logFd);
  child.unref();
  fs.writeFileSync(pidFile, `${child.pid}\n`);

  try {
    await waitForPort(frontendPort, child.pid);
    console.log(`Frontend started at http://localhost:${frontendPort} (PID ${child.pid}).`);
  } catch (error) {
    stopProcess(child.pid);
    removePidFile();
    throw error;
  }
}

function stopFrontend() {
  const frontendPort = requiredPort('FRONTEND_PORT');
  const pids = new Set(listeningPids(frontendPort));
  const managedPid = readManagedPid();
  if (managedPid) {
    pids.add(managedPid);
  }

  const runningPids = [...pids].filter(isRunning);
  for (const pid of runningPids) {
    stopProcess(pid);
  }
  removePidFile();

  if (runningPids.length === 0) {
    console.log('Frontend is already stopped.');
    return;
  }

  console.log('Frontend stopped.');
}

Promise.resolve(action === 'start' ? startFrontend() : stopFrontend()).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
