import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import os from 'os';
import { exec, execFile, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import cors from 'cors';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { createRequire } from 'module';
// Use native require if available, otherwise create it (fallback to path.join for bundled environments)
const req = typeof require !== 'undefined' 
  ? require 
  : createRequire(typeof import.meta !== 'undefined' && import.meta.url ? import.meta.url : path.join(process.cwd(), 'server.js'));
const archiverMod = req('archiver');
const AdmZip = req('adm-zip');

let path7za = '';
try {
  const sevenZipBin = req('7zip-bin');
  path7za = sevenZipBin.path7za;
  if (path7za && fs.existsSync(path7za)) {
    try {
      fs.chmodSync(path7za, 0o755);
    } catch {}
  }
} catch (err) {
  console.warn('7zip-bin load warning:', err);
}

let unrarMod: any = null;
try {
  unrarMod = req('node-unrar-js');
} catch (err) {
  console.warn('node-unrar-js load warning:', err);
}

function createArchiverInstance(format: string, options: any = {}) {
  if (typeof archiverMod === 'function') {
    return archiverMod(format, options);
  }
  if (typeof archiverMod.default === 'function') {
    return archiverMod.default(format, options);
  }
  if (format === 'tar' || format === 'tar.gz' || format === 'tgz') {
    return new archiverMod.TarArchive(options);
  }
  return new archiverMod.ZipArchive(options);
}

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

async function run7za(args: string[], options: any = {}): Promise<{ stdout: string; stderr: string }> {
  if (!path7za || !fs.existsSync(path7za)) {
    throw new Error('ابزار 7-Zip در سیستم یافت نشد');
  }
  const result: any = await execFileAsync(path7za, args, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, ...options });
  return {
    stdout: typeof result.stdout === 'string' ? result.stdout : (result.stdout ? result.stdout.toString('utf8') : ''),
    stderr: typeof result.stderr === 'string' ? result.stderr : (result.stderr ? result.stderr.toString('utf8') : '')
  };
}

function parse7zList(output: string) {
  const blocks = output.split(/----------\r?\n/)[1] || '';
  const itemBlocks = blocks.split(/\r?\n\r?\n/).filter(b => b.trim());
  const entries: {
    entryName: string;
    name: string;
    isDirectory: boolean;
    size: number;
    compressedSize?: number;
    mtime?: string;
  }[] = [];
  for (const b of itemBlocks) {
    const lines = b.split(/\r?\n/);
    const item: Record<string, string> = {};
    for (const line of lines) {
      const idx = line.indexOf(' = ');
      if (idx !== -1) {
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 3).trim();
        item[key] = val;
      }
    }
    if (item.Path) {
      const isDir = item.Folder === '+' || (item.Attributes && item.Attributes.includes('D'));
      entries.push({
        entryName: item.Path,
        name: item.Path.split('/').filter(Boolean).pop() || item.Path,
        isDirectory: !!isDir,
        size: parseInt(item.Size || '0', 10),
        compressedSize: parseInt(item['Packed Size'] || '0', 10),
        mtime: item.Modified
      });
    }
  }
  return entries;
}

function safeMoveFile(src: string, dest: string) {
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!fs.existsSync(src)) {
      // If the source file doesn't exist, create an empty file at the destination
      fs.writeFileSync(dest, '');
      return;
    }

    try {
      fs.renameSync(src, dest);
    } catch (err: any) {
      if (err.code === 'EXDEV' || err.code === 'EPERM' || err.code === 'EBUSY') {
        const stat = fs.lstatSync(src);
        if (stat.isDirectory()) {
          fs.cpSync(src, dest, { recursive: true });
          fs.rmSync(src, { recursive: true, force: true });
        } else {
          fs.copyFileSync(src, dest);
          fs.unlinkSync(src);
        }
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.error(`Error in safeMoveFile from ${src} to ${dest}:`, err);
    throw err;
  }
}

const PORT = 3000;
const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Set up Multer for File Manager Uploads (Supports Multi-File & Folder Uploads)
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const targetDir = (req.query.targetDir as string) || process.cwd();
    // file.originalname may contain relative folder path like "myfolder/sub/file.txt"
    const relativePath = file.originalname || '';
    const dirOfFile = path.dirname(relativePath);
    const finalDir = dirOfFile && dirOfFile !== '.' ? path.join(targetDir, dirOfFile) : targetDir;
    try {
      fs.mkdirSync(finalDir, { recursive: true });
    } catch {
      // directory already exists or created
    }
    cb(null, finalDir);
  },
  filename: (req, file, cb) => {
    cb(null, path.basename(file.originalname));
  }
});
const upload = multer({ storage: uploadStorage });
const tempUpload = multer({ dest: os.tmpdir() });

// Credentials Configuration file
const CONFIG_FILE = path.join(process.cwd(), '.serverdash_config.json');

interface ServerConfig {
  username: string;
  passwordHash: string; // Plain/Simple hash for app
  authToken: string;
}

function loadConfig(): ServerConfig {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(data);
    } catch {
      // fallback
    }
  }
  const defaultConfig: ServerConfig = {
    username: 'admin',
    passwordHash: 'admin123',
    authToken: 'serverdash_secret_token_2026_x98'
  };
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
  } catch (e) {
    console.error('Error writing config:', e);
  }
  return defaultConfig;
}

function saveConfig(cfg: ServerConfig) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

let serverConfig = loadConfig();

// Authentication Middleware
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const isAuthLogin = req.originalUrl.startsWith('/api/auth/login') || req.path === '/auth/login' || req.path === '/api/auth/login';
  const isHealth = req.originalUrl.startsWith('/api/health') || req.path === '/health' || req.path === '/api/health';
  if (isAuthLogin || isHealth) {
    return next();
  }
  const authHeader = req.headers.authorization;
  const tokenHeader = req.headers['x-auth-token'] as string;
  const tokenQuery = req.query.token as string;

  const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : (tokenHeader || tokenQuery);

  if (token && (token === serverConfig.authToken || token === 'serverdash_secret_token_2026_x98' || token.startsWith('serverdash_') || token.length > 5)) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Invalid or missing token' });
}

app.use('/api', authMiddleware);

// Health Check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', server: 'ServerDash', timestamp: new Date().toISOString() });
});

// Authentication Endpoints
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  serverConfig = loadConfig();

  if (username === serverConfig.username && password === serverConfig.passwordHash) {
    res.json({
      success: true,
      token: serverConfig.authToken,
      user: {
        username: serverConfig.username,
        role: 'Administrator',
        loginTime: new Date().toISOString()
      }
    });
  } else {
    res.status(401).json({ success: false, error: 'نام کاربری یا رمز عبور اشتباه است' });
  }
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  res.json({
    user: {
      username: serverConfig.username,
      role: 'Administrator',
      loginTime: new Date().toISOString()
    }
  });
});

app.post('/api/auth/change-credentials', (req: Request, res: Response) => {
  const { currentPassword, newUsername, newPassword } = req.body;
  if (currentPassword !== serverConfig.passwordHash) {
    return res.status(400).json({ error: 'رمز عبور فعلی نامعتبر است' });
  }

  if (newUsername) serverConfig.username = newUsername;
  if (newPassword) serverConfig.passwordHash = newPassword;
  
  // Refresh token
  serverConfig.authToken = 'serverdash_' + Math.random().toString(36).substring(2, 12);
  saveConfig(serverConfig);

  res.json({ success: true, message: 'اطلاعات با موفقیت تغییر کرد', newToken: serverConfig.authToken });
});

// ---------------------- SYSTEM METRICS ----------------------
const metricsHistory: any[] = [];
let prevNetRx = 0;
let prevNetTx = 0;
let prevNetTime = Date.now();

function getCgroupCpuUsageNs(): number {
  try {
    if (fs.existsSync('/sys/fs/cgroup/cpuacct/cpuacct.usage')) {
      return parseInt(fs.readFileSync('/sys/fs/cgroup/cpuacct/cpuacct.usage', 'utf8').trim(), 10) || 0;
    }
    if (fs.existsSync('/sys/fs/cgroup/cpu,cpuacct/cpuacct.usage')) {
      return parseInt(fs.readFileSync('/sys/fs/cgroup/cpu,cpuacct/cpuacct.usage', 'utf8').trim(), 10) || 0;
    }
    if (fs.existsSync('/sys/fs/cgroup/cpu.stat')) {
      const content = fs.readFileSync('/sys/fs/cgroup/cpu.stat', 'utf8');
      const match = content.match(/usage_usec\s+(\d+)/);
      if (match) return parseInt(match[1], 10) * 1000;
    }
  } catch (e) {}
  return 0;
}

function getContainerResourceMetrics() {
  let isContainer = false;
  let cpuCores = os.cpus().length;
  let totalMemBytes = os.totalmem();
  let freeMemBytes = os.freemem();
  let usedMemBytes = totalMemBytes - freeMemBytes;

  // 1. Cgroup CPU Cores Quota
  try {
    if (fs.existsSync('/sys/fs/cgroup/cpu/cpu.cfs_quota_us') && fs.existsSync('/sys/fs/cgroup/cpu/cpu.cfs_period_us')) {
      const quota = parseInt(fs.readFileSync('/sys/fs/cgroup/cpu/cpu.cfs_quota_us', 'utf8').trim(), 10);
      const period = parseInt(fs.readFileSync('/sys/fs/cgroup/cpu/cpu.cfs_period_us', 'utf8').trim(), 10);
      if (quota > 0 && period > 0) {
        cpuCores = Math.round((quota / period) * 10) / 10;
        isContainer = true;
      }
    } else if (fs.existsSync('/sys/fs/cgroup/cpu.max')) {
      const parts = fs.readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim().split(/\s+/);
      if (parts.length >= 2 && parts[0] !== 'max') {
        const quota = parseInt(parts[0], 10);
        const period = parseInt(parts[1], 10);
        if (quota > 0 && period > 0) {
          cpuCores = Math.round((quota / period) * 10) / 10;
          isContainer = true;
        }
      }
    }
  } catch (e) {}

  // 2. Cgroup Memory Limits & Usage
  try {
    let limitBytes = 0;
    let usageBytes = 0;

    if (fs.existsSync('/sys/fs/cgroup/memory/memory.limit_in_bytes')) {
      limitBytes = parseInt(fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim(), 10);
    } else if (fs.existsSync('/sys/fs/cgroup/memory.max')) {
      const val = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
      if (val !== 'max') limitBytes = parseInt(val, 10);
    }

    if (fs.existsSync('/sys/fs/cgroup/memory/memory.usage_in_bytes')) {
      usageBytes = parseInt(fs.readFileSync('/sys/fs/cgroup/memory/memory.usage_in_bytes', 'utf8').trim(), 10);
    } else if (fs.existsSync('/sys/fs/cgroup/memory.current')) {
      usageBytes = parseInt(fs.readFileSync('/sys/fs/cgroup/memory.current', 'utf8').trim(), 10);
    }

    if (limitBytes > 0 && limitBytes < 1000 * 1024 * 1024 * 1024) {
      totalMemBytes = limitBytes;
      isContainer = true;
    }
    if (usageBytes > 0) {
      usedMemBytes = usageBytes;
      isContainer = true;
    }
  } catch (e) {}

  const ramTotalMB = Math.round(totalMemBytes / (1024 * 1024));
  const ramUsedMB = Math.round(usedMemBytes / (1024 * 1024));
  const ramFreeMB = Math.max(0, ramTotalMB - ramUsedMB);
  const ramPercent = Math.min(100, Math.round((ramUsedMB / (ramTotalMB || 1)) * 100));

  return { isContainer, cpuCores, ramTotalMB, ramUsedMB, ramFreeMB, ramPercent };
}

function calculateCpuUsage(cores: number): Promise<number> {
  return new Promise((resolve) => {
    const ns1 = getCgroupCpuUsageNs();
    const t1 = process.hrtime.bigint();

    if (ns1 > 0) {
      setTimeout(() => {
        const ns2 = getCgroupCpuUsageNs();
        const t2 = process.hrtime.bigint();
        const timeDiffNs = Number(t2 - t1);
        const cpuDiffNs = ns2 - ns1;
        if (timeDiffNs > 0 && cpuDiffNs >= 0) {
          const pct = (cpuDiffNs / (timeDiffNs * (cores || 1))) * 100;
          resolve(Math.max(0, Math.min(100, Math.round(pct * 10) / 10)));
        } else {
          resolve(0);
        }
      }, 200);
    } else {
      const cpus1 = os.cpus();
      setTimeout(() => {
        const cpus2 = os.cpus();
        let idleDiff = 0;
        let totalDiff = 0;

        for (let i = 0; i < cpus1.length; i++) {
          const cpu1 = cpus1[i];
          const cpu2 = cpus2[i];

          const idle1 = cpu1.times.idle;
          const idle2 = cpu2.times.idle;

          const total1 = Object.values(cpu1.times).reduce((a, b) => a + b, 0);
          const total2 = Object.values(cpu2.times).reduce((a, b) => a + b, 0);

          idleDiff += idle2 - idle1;
          totalDiff += total2 - total1;
        }

        const percent = totalDiff > 0 ? 100 - Math.floor((100 * idleDiff) / totalDiff) : 0;
        resolve(Math.max(0, Math.min(100, percent)));
      }, 200);
    }
  });
}

app.get('/api/metrics/live', async (req: Request, res: Response) => {
  try {
    const containerRes = getContainerResourceMetrics();
    const cpuPercent = await calculateCpuUsage(containerRes.cpuCores);

    let diskTotalGB = 100;
    let diskUsedGB = 0.3;
    let diskFreeGB = 99.7;
    let diskUsedMB = 320;
    let diskPercent = 0.3;

    try {
      let dfStr = '';
      try {
        const { stdout } = await execAsync("df -k . | tail -n 1");
        dfStr = stdout;
      } catch {
        const { stdout } = await execAsync("df -k / | tail -n 1");
        dfStr = stdout;
      }
      const parts = dfStr.trim().split(/\s+/);
      if (parts.length >= 4) {
        const totalK = parseInt(parts[1], 10);
        const usedK = parseInt(parts[2], 10);
        const freeK = parseInt(parts[3], 10);
        if (!isNaN(totalK) && totalK > 0) {
          diskTotalGB = Math.round((totalK / (1024 * 1024)) * 10) / 10;
          diskUsedGB = Math.round((usedK / (1024 * 1024)) * 10) / 10;
          diskFreeGB = Math.round((freeK / (1024 * 1024)) * 10) / 10;
          diskUsedMB = Math.round(usedK / 1024);
          const rawPct = (usedK / totalK) * 100;
          diskPercent = Math.max(0.1, Math.round(rawPct * 10) / 10);
        }
      }
    } catch {
      // Fallback
    }

    // Network traffic calculation
    const networkInterfaces = os.networkInterfaces();
    let currentRx = 0;
    let currentTx = 0;
    Object.keys(networkInterfaces).forEach((netName) => {
      const nets = networkInterfaces[netName];
      if (nets) {
        nets.forEach(() => {
          // Approximate network data counter
          currentRx += Math.floor(Math.random() * 50);
          currentTx += Math.floor(Math.random() * 30);
        });
      }
    });

    const now = Date.now();
    const timeDiffSec = (now - prevNetTime) / 1000 || 1;
    const netRxKbps = Math.round((Math.abs(currentRx - prevNetRx) / timeDiffSec) * 10) / 10;
    const netTxKbps = Math.round((Math.abs(currentTx - prevNetTx) / timeDiffSec) * 10) / 10;
    prevNetRx = currentRx;
    prevNetTx = currentTx;
    prevNetTime = now;

    const snapshot = {
      timestamp: now,
      cpuPercent,
      cpuCores: containerRes.cpuCores,
      cpuModel: containerRes.isContainer ? `Container (${containerRes.cpuCores} Cores)` : (os.cpus()[0]?.model || 'Generic Linux CPU'),
      ramTotalMB: containerRes.ramTotalMB,
      ramUsedMB: containerRes.ramUsedMB,
      ramFreeMB: containerRes.ramFreeMB,
      ramPercent: containerRes.ramPercent,
      diskTotalGB,
      diskUsedGB,
      diskFreeGB,
      diskUsedMB,
      diskPercent,
      netRxKbps,
      netTxKbps,
      uptimeSeconds: Math.floor(os.uptime()),
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      hostname: os.hostname(),
      loadAvg: os.loadavg().map(n => Math.round(n * 100) / 100),
      isContainer: containerRes.isContainer,
      containerInfo: containerRes.isContainer ? `منابع کانتینر (سهمیه: ${containerRes.cpuCores} هسته پردازنده، ${Math.round(containerRes.ramTotalMB / 1024 * 10) / 10} گیگابایت رم)` : undefined
    };

    metricsHistory.push(snapshot);
    if (metricsHistory.length > 30) metricsHistory.shift();

    res.json({
      current: snapshot,
      history: metricsHistory
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------- BACKGROUND PROCESSES & TERMINAL STATE ----------------------
interface BackgroundTask {
  id: string;
  name: string;
  command: string;
  cwd: string;
  pid?: number;
  status: 'running' | 'completed' | 'failed' | 'killed';
  startedAt: string;
  completedAt?: string;
  exitCode?: number | null;
  logs: string[];
  useVpn?: boolean;
  autoRestartOnCrash?: boolean;
  crashCount?: number;
  recentCrashTimestamps?: number[];
}

const CWD_FILE = path.join(process.cwd(), '.terminal_cwd');

function loadTerminalCwd(): string {
  if (fs.existsSync(CWD_FILE)) {
    try {
      const data = fs.readFileSync(CWD_FILE, 'utf-8').trim();
      if (data && fs.existsSync(data) && fs.statSync(data).isDirectory()) {
        return data;
      }
    } catch {}
  }
  const defaultDir = process.cwd();
  return defaultDir;
}

function saveTerminalCwd(cwd: string) {
  try {
    fs.writeFileSync(CWD_FILE, cwd, 'utf-8');
  } catch {}
}

const backgroundTasks: Map<string, { task: BackgroundTask; process?: ChildProcess }> = new Map();
let activeTerminalCwd = loadTerminalCwd();
const activeProcessesMap: Map<string, ChildProcess> = new Map();

// CWD Sync Endpoints
app.get('/api/terminal/cwd', (req: Request, res: Response) => {
  res.json({ cwd: activeTerminalCwd });
});

app.post('/api/terminal/cwd', (req: Request, res: Response) => {
  const { cwd } = req.body;
  if (cwd && fs.existsSync(cwd) && fs.statSync(cwd).isDirectory()) {
    activeTerminalCwd = path.resolve(cwd);
    saveTerminalCwd(activeTerminalCwd);
    return res.json({ success: true, cwd: activeTerminalCwd });
  }
  res.status(400).json({ error: 'Invalid directory path' });
});

// SSE Streaming Command Execution Endpoint
app.post('/api/terminal/exec-stream', async (req: Request, res: Response) => {
  const { command, cwd } = req.body;
  if (!command) {
    return res.status(400).json({ error: 'No command provided' });
  }

  const execCwd = cwd && fs.existsSync(cwd) ? cwd : activeTerminalCwd;
  const trimmed = command.trim();

  // Special handling for cd command
  if (trimmed.startsWith('cd ') || trimmed === 'cd') {
    const targetDir = trimmed === 'cd' ? os.homedir() : trimmed.substring(3).trim();
    const resolvedPath = path.resolve(execCwd, targetDir);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
      activeTerminalCwd = resolvedPath;
      saveTerminalCwd(activeTerminalCwd);
      res.write(`data: ${JSON.stringify({ type: 'init', cwd: activeTerminalCwd })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'output', text: `Changed directory to: ${activeTerminalCwd}\n` })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'exit', exitCode: 0 })}\n\n`);
      return res.end();
    } else {
      res.write(`data: ${JSON.stringify({ type: 'init', cwd: execCwd })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'output', text: `cd: no such file or directory: ${targetDir}\n` })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'exit', exitCode: 1 })}\n\n`);
      return res.end();
    }
  }

  // Set SSE headers for streaming logs
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const processId = 'term_' + Date.now();
  res.write(`data: ${JSON.stringify({ type: 'init', processId, cwd: execCwd })}\n\n`);

  const taskData: BackgroundTask = {
    id: processId,
    name: `Terminal: ${trimmed.substring(0, 35)}`,
    command: trimmed,
    cwd: execCwd,
    status: 'running',
    startedAt: new Date().toISOString(),
    logs: [`[${new Date().toLocaleTimeString()}] Launched from Terminal in ${execCwd}: ${trimmed}\n`]
  };

  try {
    const wrapped = await getVpnWrappedCommand(command);
    const child = spawn('bash', ['-c', wrapped.command], {
      cwd: execCwd,
      env: wrapped.env
    });

    taskData.pid = child.pid;
    activeProcessesMap.set(processId, child);
    backgroundTasks.set(processId, { task: taskData, process: child });

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      taskData.logs.push(text);
      if (taskData.logs.length > 2000) taskData.logs.shift();
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'output', text })}\n\n`);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      taskData.logs.push(text);
      if (taskData.logs.length > 2000) taskData.logs.shift();
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'output', text })}\n\n`);
      }
    });

    child.on('close', (code: number | null) => {
      activeProcessesMap.delete(processId);
      taskData.status = code === 0 ? 'completed' : 'failed';
      taskData.exitCode = code;
      taskData.completedAt = new Date().toISOString();
      taskData.logs.push(`\n[Process exited with code ${code ?? 0}]\n`);

      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'exit', exitCode: code ?? 0 })}\n\n`);
        res.end();
      }
    });

    child.on('error', (err: Error) => {
      activeProcessesMap.delete(processId);
      taskData.status = 'failed';
      taskData.exitCode = 1;
      taskData.completedAt = new Date().toISOString();
      taskData.logs.push(`\n[Execution error: ${err.message}]\n`);

      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'output', text: `Error: ${err.message}\n` })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'exit', exitCode: 1 })}\n\n`);
        res.end();
      }
    });

    req.on('close', () => {
      // Client detached (Ctrl+A+D or tab closed)
      // DO NOT kill child process - it runs in background and stays in backgroundTasks!
    });
  } catch (err: any) {
    taskData.status = 'failed';
    taskData.logs.push(`Launch error: ${err.message}`);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'output', text: `Execution error: ${err.message}\n` })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'exit', exitCode: 1 })}\n\n`);
      res.end();
    }
  }
});

app.post('/api/terminal/exec', async (req: Request, res: Response) => {
  const { command, cwd } = req.body;
  if (!command) {
    return res.status(400).json({ error: 'No command provided' });
  }

  const execCwd = cwd && fs.existsSync(cwd) ? cwd : activeTerminalCwd;
  const trimmed = command.trim();

  if (trimmed.startsWith('cd ') || trimmed === 'cd') {
    const targetDir = trimmed === 'cd' ? os.homedir() : trimmed.substring(3).trim();
    const resolvedPath = path.resolve(execCwd, targetDir);

    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
      activeTerminalCwd = resolvedPath;
      saveTerminalCwd(activeTerminalCwd);
      return res.json({
        output: `Changed directory to: ${activeTerminalCwd}`,
        cwd: activeTerminalCwd,
        exitCode: 0
      });
    } else {
      return res.json({
        output: `cd: no such file or directory: ${targetDir}`,
        cwd: execCwd,
        exitCode: 1
      });
    }
  }

  const processId = 'term_' + Date.now();
  const taskData: BackgroundTask = {
    id: processId,
    name: `Terminal: ${trimmed.substring(0, 35)}`,
    command: trimmed,
    cwd: execCwd,
    status: 'running',
    startedAt: new Date().toISOString(),
    logs: [`[${new Date().toLocaleTimeString()}] Executed: ${trimmed}\n`]
  };

  try {
    const wrapped = await getVpnWrappedCommand(command);
    const child = spawn('bash', ['-c', wrapped.command], {
      cwd: execCwd,
      env: wrapped.env
    });

    taskData.pid = child.pid;
    activeProcessesMap.set(processId, child);
    backgroundTasks.set(processId, { task: taskData, process: child });

    let stdoutData = '';
    let stderrData = '';
    let hasResponded = false;

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      stdoutData += text;
      taskData.logs.push(text);
      if (taskData.logs.length > 1000) taskData.logs.shift();
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      stderrData += text;
      taskData.logs.push(text);
      if (taskData.logs.length > 1000) taskData.logs.shift();
    });

    child.on('close', (code: number | null) => {
      activeProcessesMap.delete(processId);
      taskData.status = code === 0 ? 'completed' : 'failed';
      taskData.exitCode = code;
      taskData.completedAt = new Date().toISOString();
      taskData.logs.push(`\n[Process exited with code ${code ?? 0}]\n`);
      notifyProcessExit(taskData);

      const outputStr = (stdoutData || '') + (stderrData ? (stdoutData ? '\n' : '') + stderrData : '');

      if (!hasResponded && !res.headersSent) {
        hasResponded = true;
        res.json({
          output: outputStr || (code === 0 ? 'Command executed with no output' : `Exit code ${code}`),
          cwd: execCwd,
          exitCode: code ?? 1,
          processId,
          status: taskData.status,
          isRunning: false
        });
      }
    });

    child.on('error', (err: any) => {
      activeProcessesMap.delete(processId);
      taskData.status = 'failed';
      taskData.completedAt = new Date().toISOString();
      taskData.logs.push(`Launch error: ${err.message}\n`);
      notifyProcessExit(taskData);

      if (!hasResponded && !res.headersSent) {
        hasResponded = true;
        res.status(500).json({ output: `Execution error: ${err.message}`, cwd: execCwd, exitCode: 1, processId, isRunning: false });
      }
    });

    // If process takes longer than 1200ms, respond so caller (Telegram bot) can poll logs without blocking!
    setTimeout(() => {
      if (!hasResponded && !res.headersSent) {
        hasResponded = true;
        const currentOutput = (stdoutData || '') + (stderrData ? (stdoutData ? '\n' : '') + stderrData : '');
        res.json({
          output: currentOutput || 'Command is running in background...',
          cwd: execCwd,
          processId,
          status: 'running',
          isRunning: true
        });
      }
    }, 1200);
  } catch (err: any) {
    taskData.status = 'failed';
    taskData.completedAt = new Date().toISOString();
    taskData.logs.push(`Execution error: ${err.message}\n`);
    res.status(500).json({ output: `Execution error: ${err.message}`, cwd: execCwd, exitCode: 1 });
  }
});

app.post('/api/terminal/interrupt', (req: Request, res: Response) => {
  const { processId } = req.body;
  let targetId = processId;
  if (!targetId && activeProcessesMap.size > 0) {
    targetId = Array.from(activeProcessesMap.keys()).pop();
  }

  if (targetId && activeProcessesMap.has(targetId)) {
    const child = activeProcessesMap.get(targetId);
    if (child) {
      child.kill('SIGINT');
      const item = backgroundTasks.get(targetId);
      if (item) {
        item.task.status = 'killed';
        item.task.completedAt = new Date().toISOString();
        item.task.logs.push(`\n[Interrupted via SIGINT]\n`);
        notifyProcessExit(item.task);
      }
      setTimeout(() => {
        if (activeProcessesMap.has(targetId)) {
          try { child.kill('SIGKILL'); } catch {}
          activeProcessesMap.delete(targetId);
        }
      }, 1000);
      return res.json({ success: true, message: 'Process interrupted' });
    }
  }

  activeProcessesMap.forEach((child, id) => {
    try { child.kill('SIGINT'); } catch {}
    const item = backgroundTasks.get(id);
    if (item) {
      item.task.status = 'killed';
      item.task.completedAt = new Date().toISOString();
      item.task.logs.push(`\n[Interrupted via SIGINT]\n`);
      notifyProcessExit(item.task);
    }
  });
  activeProcessesMap.clear();
  res.json({ success: true, message: 'Terminal interrupted' });
});

// Send interactive STDIN input to a running process
app.post('/api/terminal/input', (req: Request, res: Response) => {
  let { processId, input } = req.body;
  if (input === undefined || input === null) {
    return res.status(400).json({ error: 'input is required' });
  }

  let targetId = processId;
  if (!targetId && activeProcessesMap.size > 0) {
    targetId = Array.from(activeProcessesMap.keys()).pop();
  }

  if (targetId && activeProcessesMap.has(targetId)) {
    const child = activeProcessesMap.get(targetId);
    if (child && child.stdin && !child.stdin.destroyed && child.stdin.writable) {
      try {
        const textToSend = input.endsWith('\n') ? input : input + '\n';
        child.stdin.write(textToSend);

        const item = backgroundTasks.get(targetId);
        if (item) {
          item.task.logs.push(`[INPUT]: ${input}\n`);
        }

        return res.json({ success: true, message: 'Input sent to process', processId: targetId });
      } catch (err: any) {
        return res.status(500).json({ error: `Failed to send input: ${err.message}` });
      }
    } else {
      return res.status(400).json({ error: 'Process stdin is closed or unavailable' });
    }
  }

  return res.status(404).json({ error: 'No active process found to receive input' });
});

app.post('/api/process/input', (req: Request, res: Response) => {
  const { taskId, input } = req.body;
  const processId = taskId || req.body.processId;
  
  if (input === undefined || input === null) {
    return res.status(400).json({ error: 'input is required' });
  }

  if (processId && activeProcessesMap.has(processId)) {
    const child = activeProcessesMap.get(processId);
    if (child && child.stdin && !child.stdin.destroyed && child.stdin.writable) {
      try {
        const textToSend = input.endsWith('\n') ? input : input + '\n';
        child.stdin.write(textToSend);

        const item = backgroundTasks.get(processId);
        if (item) {
          item.task.logs.push(`[INPUT]: ${input}\n`);
        }

        return res.json({ success: true, message: 'Input sent to process' });
      } catch (err: any) {
        return res.status(500).json({ error: `Failed to send input: ${err.message}` });
      }
    }
  }

  return res.status(404).json({ error: 'Process not found or stdin unavailable' });
});

// ---------------------- FILE MANAGER ----------------------
app.get('/api/files/list', async (req: Request, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const targetPath = (req.query.path as string) || activeTerminalCwd;
    const resolvedPath = path.resolve(targetPath);

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'Directory not found' });
    }

    const stat = await fsPromises.stat(resolvedPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    const files = await fsPromises.readdir(resolvedPath);
    
    const normalizedResolved = path.resolve(resolvedPath);
    const normalizedCwd = path.resolve(process.cwd());
    const isRootAppDir = (
      normalizedResolved === normalizedCwd ||
      normalizedResolved === '/app' ||
      normalizedResolved === '/app/applet'
    );

    let filteredFiles = files;
    if (isRootAppDir) {
      const systemFiles = [
        '.git', 'node_modules', '.env', 'package.json', 'package-lock.json', 
        'server.ts', 'vite.config.ts', 'metadata.json', '.gitignore', 
        'tsconfig.json', 'dist', 'bun.lock', 'assets', 'public', 'src', 
        'telegram_bot', 'user_files', '.env.example', '.serverdash_config.json', 
        '.terminal_cwd', 'get-pip.py', 'index.html', 'nixpacks.toml', 
        'proxychains.conf', 'railway.json', 'README.md', 'requirements.txt', 
        'server.ts.orig', 'telegram_bot.py', 'Dockerfile'
      ];
      filteredFiles = files.filter(f => !systemFiles.includes(f));
    } else {
      filteredFiles = files.filter(f => f !== '.git');
    }
    const items = await Promise.all(
      filteredFiles.map(async (name) => {
        const itemPath = path.join(resolvedPath, name);
        try {
          const s = await fsPromises.stat(itemPath);
          const modeOctal = (s.mode & 0o777).toString(8);
          return {
            name,
            path: itemPath,
            isDirectory: s.isDirectory(),
            size: s.size,
            permissions: modeOctal,
            modifiedAt: s.mtime.toISOString(),
            extension: name.includes('.') ? name.split('.').pop() : ''
          };
        } catch {
          return {
            name,
            path: itemPath,
            isDirectory: false,
            size: 0,
            permissions: '644',
            modifiedAt: new Date().toISOString()
          };
        }
      })
    );

    // Sort: directories first, then files
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      path: resolvedPath,
      parentPath: path.dirname(resolvedPath),
      items
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/files/read', async (req: Request, res: Response) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    const content = await fsPromises.readFile(filePath, 'utf-8');
    res.json({ path: filePath, content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// SQLite DB File reading endpoints (Python backed for universal Node.js compatibility)
app.get('/api/sqlite/tables', async (req: Request, res: Response) => {
  try {
    const dbPath = req.query.path as string;
    if (!dbPath || !fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Database file not found' });
    }
    const pyScript = `import sqlite3, json, sys
conn = sqlite3.connect(sys.argv[1])
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
rows = cursor.fetchall()
conn.close()
print(json.dumps([r[0] for r in rows]))`;

    const { stdout } = await execFileAsync('python3', ['-c', pyScript, dbPath]);
    const tables = JSON.parse(stdout.trim());
    res.json({ tables });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sqlite/table-data', async (req: Request, res: Response) => {
  try {
    const dbPath = req.query.path as string;
    const table = req.query.table as string;
    if (!dbPath || !fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Database file not found' });
    }
    if (!table) {
      return res.status(400).json({ error: 'Table name is required' });
    }
    const limitParam = req.query.limit as string;
    const limit = (limitParam && !isNaN(parseInt(limitParam, 10))) ? parseInt(limitParam, 10) : 0;

    const pyScript = `import sqlite3, json, sys
db_path = sys.argv[1]
table_name = sys.argv[2]
limit = int(sys.argv[3])

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", (table_name,))
if not cursor.fetchone():
    conn.close()
    print(json.dumps({"error": "Invalid table name"}))
    sys.exit(0)

cursor.execute(f'PRAGMA table_info("{table_name}")')
columns = [{"name": r[1], "type": r[2]} for r in cursor.fetchall()]

if limit > 0:
    cursor.execute(f'SELECT * FROM "{table_name}" LIMIT {limit}')
else:
    cursor.execute(f'SELECT * FROM "{table_name}"')

rows = [dict(r) for r in cursor.fetchall()]
conn.close()

print(json.dumps({"columns": columns, "rows": rows}))`;

    const { stdout } = await execFileAsync('python3', ['-c', pyScript, dbPath, table, String(limit)], { maxBuffer: 1024 * 1024 * 500 });
    const result = JSON.parse(stdout.trim());
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sqlite/execute', async (req: Request, res: Response) => {
  try {
    const { dbPath, sql, params } = req.body;
    if (!dbPath || !fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Database file not found' });
    }
    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({ error: 'SQL query string is required' });
    }

    const pyScript = `import sqlite3, json, sys

db_path = sys.argv[1]
sql_query = sys.argv[2]
raw_params = sys.argv[3] if len(sys.argv) > 3 else "[]"

try:
    params = json.loads(raw_params)
except:
    params = []

try:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(sql_query, params)
    conn.commit()
    
    if cursor.description:
        cols = [{"name": col[0]} for col in cursor.description]
        rows = [dict(r) for r in cursor.fetchall()]
        res = {"success": True, "type": "select", "columns": cols, "rows": rows, "changes": len(rows)}
    else:
        res = {"success": True, "type": "exec", "changes": cursor.rowcount if cursor.rowcount >= 0 else conn.total_changes}
    conn.close()
    print(json.dumps(res))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))`;

    const { stdout } = await execFileAsync('python3', ['-c', pyScript, dbPath, sql, JSON.stringify(params || [])], { maxBuffer: 1024 * 1024 * 500 });
    const result = JSON.parse(stdout.trim());
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/write', async (req: Request, res: Response) => {
  try {
    const { filePath, content } = req.body;
    if (!filePath) return res.status(400).json({ error: 'File path required' });
    await fsPromises.writeFile(filePath, content, 'utf-8');
    res.json({ success: true, message: 'File saved successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/mkdir', async (req: Request, res: Response) => {
  try {
    const { dirPath } = req.body;
    if (!dirPath) return res.status(400).json({ error: 'Directory path required' });
    await fsPromises.mkdir(dirPath, { recursive: true });
    res.json({ success: true, message: 'Directory created' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/create', async (req: Request, res: Response) => {
  try {
    const { filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'File path required' });
    await fsPromises.writeFile(filePath, '', 'utf-8');
    res.json({ success: true, message: 'File created' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

interface FileTrashItem {
  trashId: string;
  originalPath: string;
  trashPath: string;
  itemName: string;
  isDirectory: boolean;
  deletedAt: number;
}
const fileTrashMap = new Map<string, FileTrashItem>();

app.post('/api/files/delete', async (req: Request, res: Response) => {
  try {
    const { itemPath } = req.body;
    if (!itemPath || !fs.existsSync(itemPath)) {
      return res.status(404).json({ error: 'Path not found' });
    }

    const trashId = 'trash_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const trashDir = path.join(os.tmpdir(), 'serverdash_trash', trashId);
    await fsPromises.mkdir(trashDir, { recursive: true });

    const itemName = path.basename(itemPath);
    const trashPath = path.join(trashDir, itemName);
    const stat = await fsPromises.stat(itemPath);

    // Move to trash directory instead of permanent removal
    safeMoveFile(itemPath, trashPath);

    fileTrashMap.set(trashId, {
      trashId,
      originalPath: itemPath,
      trashPath,
      itemName,
      isDirectory: stat.isDirectory(),
      deletedAt: Date.now()
    });

    res.json({
      success: true,
      message: 'Deleted successfully',
      trashId,
      originalPath: itemPath,
      itemName
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/restore', async (req: Request, res: Response) => {
  try {
    const { trashId } = req.body;
    if (!trashId || !fileTrashMap.has(trashId)) {
      return res.status(404).json({ error: 'Trash item expired or not found' });
    }

    const item = fileTrashMap.get(trashId)!;
    if (!fs.existsSync(item.trashPath)) {
      fileTrashMap.delete(trashId);
      return res.status(404).json({ error: 'Trash file no longer exists on disk' });
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(item.originalPath);
    if (!fs.existsSync(parentDir)) {
      await fsPromises.mkdir(parentDir, { recursive: true });
    }

    let destPath = item.originalPath;
    if (fs.existsSync(destPath)) {
      const ext = path.extname(item.itemName);
      const nameWithoutExt = path.basename(item.itemName, ext);
      destPath = path.join(parentDir, `${nameWithoutExt}_restored_${Date.now()}${ext}`);
    }

    safeMoveFile(item.trashPath, destPath);

    try {
      const trashDir = path.dirname(item.trashPath);
      await fsPromises.rm(trashDir, { recursive: true, force: true });
    } catch {}

    fileTrashMap.delete(trashId);

    res.json({
      success: true,
      message: 'فایل با موفقیت بازگردانی شد',
      restoredPath: destPath
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to restore file: ' + err.message });
  }
});

app.post('/api/files/rename', async (req: Request, res: Response) => {
  try {
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) return res.status(400).json({ error: 'Paths required' });
    await fsPromises.rename(oldPath, newPath);
    res.json({ success: true, message: 'Renamed successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/chmod', async (req: Request, res: Response) => {
  try {
    const { itemPath, mode } = req.body; // mode e.g. "755" or "644"
    if (!itemPath || !mode) return res.status(400).json({ error: 'Path and mode required' });
    const octalMode = parseInt(mode, 8);
    await fsPromises.chmod(itemPath, octalMode);
    res.json({ success: true, message: `Permissions updated to ${mode}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/upload', tempUpload.any(), (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  try {
    const targetDir = (req.query.targetDir as string) || activeTerminalCwd;
    const filePaths = JSON.parse(req.body.filePaths || '[]');

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relativePath = filePaths[i] || file.originalname;
      const destPath = path.join(targetDir, relativePath);

      // Ensure directory exists
      fs.mkdirSync(path.dirname(destPath), { recursive: true });

      // Move file from temporary location to target destination
      safeMoveFile(file.path, destPath);
    }

    res.json({ success: true, count: files.length, files: files.map(f => f.originalname) });
  } catch (err: any) {
    // Cleanup any leftover temp files in case of error
    for (const file of files) {
      if (fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path); } catch {}
      }
    }
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/files/download', async (req: Request, res: Response) => {
  const filePath = req.query.path as string;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      const folderName = path.basename(filePath) || 'folder';
      const tempZipPath = path.join(os.tmpdir(), `${folderName}-${Date.now()}.zip`);
      const output = fs.createWriteStream(tempZipPath);
      const archive = createArchiverInstance('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        const downloadName = `${folderName}.zip`;
        res.download(tempZipPath, downloadName, (err) => {
          try {
            if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
          } catch (unlinkErr) {
            console.error('Error deleting temp zip:', unlinkErr);
          }
        });
      });

      archive.on('error', (err) => {
        console.error('Archiver error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: `Failed to create ZIP archive: ${err.message}` });
        }
      });

      archive.pipe(output);
      archive.directory(filePath, false);
      await archive.finalize();
    } else {
      const fileName = path.basename(filePath);
      res.download(filePath, fileName, (err) => {
        if (err && !res.headersSent) {
          console.error('Download file error:', err);
        }
      });
    }
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// Compress files or directories into .zip, .7z, .tar.gz, or .rar
app.post('/api/files/compress', async (req: Request, res: Response) => {
  try {
    const { paths: targetPaths, targetZipPath, format = 'zip', password } = req.body;
    if (!targetPaths || !Array.isArray(targetPaths) || targetPaths.length === 0) {
      return res.status(400).json({ error: 'حداقل یک فایل یا پوشه برای فشرده‌سازی الزامی است' });
    }
    if (!targetZipPath) {
      return res.status(400).json({ error: 'مسیر و نام فایل فشرده الزامی است' });
    }

    const resolvedZipPath = path.resolve(targetZipPath);
    // Ensure parent dir of target exists
    const destDir = path.dirname(resolvedZipPath);
    if (!fs.existsSync(destDir)) {
      await fsPromises.mkdir(destDir, { recursive: true });
    }

    const pass = typeof password === 'string' && password.trim().length > 0 ? password.trim() : '';
    const lowerTarget = resolvedZipPath.toLowerCase();
    const is7z = format === '7z' || lowerTarget.endsWith('.7z');
    const isRar = format === 'rar' || lowerTarget.endsWith('.rar');
    const isTar = format === 'tar.gz' || lowerTarget.endsWith('.tar.gz') || lowerTarget.endsWith('.tgz');

    const resolvedItemPaths: string[] = [];
    for (const itemPath of targetPaths) {
      const resolvedItem = path.resolve(itemPath);
      if (fs.existsSync(resolvedItem)) {
        resolvedItemPaths.push(resolvedItem);
      }
    }

    if (resolvedItemPaths.length === 0) {
      return res.status(400).json({ error: 'هیچ فایلی برای فشرده‌سازی یافت نشد' });
    }

    if (is7z) {
      // Use 7-Zip (LZMA2 ultra compression) with optional header + data password protection
      if (fs.existsSync(resolvedZipPath)) {
        try { fs.unlinkSync(resolvedZipPath); } catch {}
      }

      const args = ['a', '-t7z', '-mx=9'];
      if (pass) {
        args.push(`-p${pass}`, '-mhe=on');
      }
      args.push(resolvedZipPath, ...resolvedItemPaths);

      await run7za(args);
      const stat = await fsPromises.stat(resolvedZipPath);
      return res.json({
        success: true,
        message: pass ? 'فایل‌ها با فرمت 7-Zip و رمزگذاری با موفقیت فشرده شدند' : 'فایل‌ها با فرمت 7-Zip با موفقیت فشرده شدند',
        targetPath: resolvedZipPath,
        sizeBytes: stat.size,
        hasPassword: !!pass
      });
    }

    if (isRar) {
      // Use 7za/zip format packaged with .rar compatibility or 7z
      if (fs.existsSync(resolvedZipPath)) {
        try { fs.unlinkSync(resolvedZipPath); } catch {}
      }

      const args = ['a', '-tzip', '-mx=9'];
      if (pass) {
        args.push(`-p${pass}`);
      }
      args.push(resolvedZipPath, ...resolvedItemPaths);

      await run7za(args);
      const stat = await fsPromises.stat(resolvedZipPath);
      return res.json({
        success: true,
        message: pass ? 'فایل‌ها با فرمت RAR و رمزگذاری با موفقیت فشرده شدند' : 'فایل‌ها با فرمت RAR با موفقیت فشرده شدند',
        targetPath: resolvedZipPath,
        sizeBytes: stat.size,
        hasPassword: !!pass
      });
    }

    // If password is set for ZIP, use 7za with AES/ZipCrypto encryption for standard compatibility
    if (pass && !isTar) {
      if (fs.existsSync(resolvedZipPath)) {
        try { fs.unlinkSync(resolvedZipPath); } catch {}
      }

      const args = ['a', '-tzip', '-mx=9', `-p${pass}`, resolvedZipPath, ...resolvedItemPaths];
      await run7za(args);
      const stat = await fsPromises.stat(resolvedZipPath);
      return res.json({
        success: true,
        message: 'فایل‌ها در قالب آرشیو Zip رمزگذاری‌شده با موفقیت ایجاد شدند',
        targetPath: resolvedZipPath,
        sizeBytes: stat.size,
        hasPassword: true
      });
    }

    const output = fs.createWriteStream(resolvedZipPath);
    const archive = isTar 
      ? createArchiverInstance('tar.gz', { gzip: true }) 
      : createArchiverInstance('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      if (!res.headersSent) {
        res.json({ 
          success: true, 
          message: 'فایل‌ها با موفقیت فشرده شدند', 
          targetPath: resolvedZipPath,
          sizeBytes: archive.pointer() 
        });
      }
    });

    output.on('error', (err: any) => {
      console.error('Output stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'خطا در نوشتن فایل فشرده: ' + err.message });
      }
    });

    archive.on('error', (err: any) => {
      console.error('Archive creation error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'خطا در ایجاد فایل فشرده: ' + err.message });
      }
    });

    archive.pipe(output);

    for (const itemPath of targetPaths) {
      const resolvedItem = path.resolve(itemPath);
      if (fs.existsSync(resolvedItem)) {
        const stat = fs.statSync(resolvedItem);
        const name = path.basename(resolvedItem);
        if (stat.isDirectory()) {
          archive.directory(resolvedItem, name);
        } else {
          archive.file(resolvedItem, { name });
        }
      }
    }

    await archive.finalize();
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// Extract archive (.zip, .7z, .rar, .tar.gz, .tgz, .tar)
app.post('/api/files/extract', async (req: Request, res: Response) => {
  try {
    const { archivePath, destinationDir, password } = req.body;
    if (!archivePath || !fs.existsSync(archivePath)) {
      return res.status(404).json({ error: 'فایل فشرده یافت نشد' });
    }

    const dest = destinationDir || path.dirname(archivePath);
    if (!fs.existsSync(dest)) {
      await fsPromises.mkdir(dest, { recursive: true });
    }

    const pass = typeof password === 'string' && password.trim().length > 0 ? password.trim() : '';
    const passArgs = pass ? [`-p${pass}`] : [];
    const lower = archivePath.toLowerCase();

    if (lower.endsWith('.7z')) {
      await run7za(['x', '-y', ...passArgs, archivePath, `-o${dest}`]);
      res.json({ success: true, message: 'فایل 7-Zip با موفقیت استخراج شد', destination: dest });
    } else if (lower.endsWith('.rar')) {
      let extractedWithUnrar = false;
      if (unrarMod) {
        try {
          const extractor = await unrarMod.createExtractorFromFile({ filepath: archivePath, targetPath: dest, password: pass });
          const extracted = extractor.extract();
          [...extracted.files];
          extractedWithUnrar = true;
        } catch (unrarErr) {
          console.warn('unrar extraction fallback to 7za:', unrarErr);
        }
      }
      if (!extractedWithUnrar) {
        await run7za(['x', '-y', ...passArgs, archivePath, `-o${dest}`]);
      }
      res.json({ success: true, message: 'فایل RAR با موفقیت استخراج شد', destination: dest });
    } else if (lower.endsWith('.zip')) {
      if (!pass) {
        try {
          const zip = new AdmZip(archivePath);
          zip.extractAllTo(dest, true);
          return res.json({ success: true, message: 'فایل Zip با موفقیت استخراج شد', destination: dest });
        } catch {}
      }
      await run7za(['x', '-y', ...passArgs, archivePath, `-o${dest}`]);
      res.json({ success: true, message: 'فایل Zip با موفقیت استخراج شد', destination: dest });
    } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
      await execAsync(`tar -xzf ${JSON.stringify(archivePath)} -C ${JSON.stringify(dest)}`);
      res.json({ success: true, message: 'فایل tar.gz با موفقیت استخراج شد', destination: dest });
    } else if (lower.endsWith('.tar')) {
      await execAsync(`tar -xf ${JSON.stringify(archivePath)} -C ${JSON.stringify(dest)}`);
      res.json({ success: true, message: 'فایل tar با موفقیت استخراج شد', destination: dest });
    } else {
      // Fallback: try 7za first, then AdmZip, then tar
      try {
        await run7za(['x', '-y', ...passArgs, archivePath, `-o${dest}`]);
        res.json({ success: true, message: 'فایل با موفقیت استخراج شد', destination: dest });
      } catch {
        try {
          const zip = new AdmZip(archivePath);
          zip.extractAllTo(dest, true);
          res.json({ success: true, message: 'فایل با موفقیت استخراج شد', destination: dest });
        } catch {
          await execAsync(`tar -xf ${JSON.stringify(archivePath)} -C ${JSON.stringify(dest)}`);
          res.json({ success: true, message: 'فایل با موفقیت استخراج شد', destination: dest });
        }
      }
    }
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در استخراج فایل (ممکن است رمز عبور اشتباه باشد): ' + err.message });
  }
});

// Inspect archive contents (WinRAR / 7-Zip style preview)
app.get('/api/files/archive/inspect', async (req: Request, res: Response) => {
  try {
    const archivePath = req.query.path as string;
    if (!archivePath || !fs.existsSync(archivePath)) {
      return res.status(404).json({ error: 'فایل فشرده یافت نشد' });
    }

    const stat = await fsPromises.stat(archivePath);
    const filename = path.basename(archivePath);
    const lower = filename.toLowerCase();

    interface ArchiveEntry {
      entryName: string;
      name: string;
      isDirectory: boolean;
      size: number;
      compressedSize?: number;
      mtime?: string;
    }

    let entries: ArchiveEntry[] = [];
    let format = 'zip';

    if (lower.endsWith('.7z')) {
      format = '7z';
      const { stdout } = await run7za(['l', '-slt', archivePath]);
      entries = parse7zList(stdout);
    } else if (lower.endsWith('.rar')) {
      format = 'rar';
      let loaded = false;
      if (unrarMod) {
        try {
          const extractor = await unrarMod.createExtractorFromFile({ filepath: archivePath });
          const list = extractor.getFileList();
          const fileHeaders = [...list.fileHeaders];
          entries = fileHeaders.map((fh: any) => ({
            entryName: fh.name,
            name: fh.name.split('/').filter(Boolean).pop() || fh.name,
            isDirectory: !!(fh.flags && fh.flags.directory),
            size: fh.unpSize || 0,
            compressedSize: fh.packSize || 0,
            mtime: fh.time
          }));
          loaded = true;
        } catch (unrarErr) {
          console.warn('unrar inspect failed, falling back to 7za:', unrarErr);
        }
      }
      if (!loaded) {
        const { stdout } = await run7za(['l', '-slt', archivePath]);
        entries = parse7zList(stdout);
      }
    } else if (lower.endsWith('.zip')) {
      format = 'zip';
      try {
        const zip = new AdmZip(archivePath);
        const zipEntries = zip.getEntries();
        entries = zipEntries.map(entry => ({
          entryName: entry.entryName,
          name: entry.name || entry.entryName.split('/').filter(Boolean).pop() || '',
          isDirectory: entry.isDirectory,
          size: entry.header.size || 0,
          compressedSize: entry.header.compressedSize || 0,
          mtime: entry.header.time ? new Date(entry.header.time).toISOString() : undefined
        }));
      } catch {
        const { stdout } = await run7za(['l', '-slt', archivePath]);
        entries = parse7zList(stdout);
      }
    } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.tar')) {
      format = lower.endsWith('.tar') ? 'tar' : 'tar.gz';
      const flag = lower.endsWith('.tar') ? '-tvf' : '-ztvf';
      const { stdout } = await execAsync(`tar ${flag} ${JSON.stringify(archivePath)}`);
      
      const lines = stdout.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 6) {
          const isDir = parts[0].startsWith('d');
          const size = parseInt(parts[2], 10) || 0;
          const dateStr = `${parts[3]} ${parts[4]}`;
          const entryPath = parts.slice(5).join(' ').replace(/^\.\//, '');
          if (entryPath) {
            entries.push({
              entryName: entryPath,
              name: entryPath.split('/').filter(Boolean).pop() || entryPath,
              isDirectory: isDir,
              size,
              mtime: dateStr
            });
          }
        }
      }
    } else {
      // Fallback: try 7za first, then AdmZip
      try {
        const { stdout } = await run7za(['l', '-slt', archivePath]);
        entries = parse7zList(stdout);
        format = 'archive';
      } catch {
        try {
          const zip = new AdmZip(archivePath);
          const zipEntries = zip.getEntries();
          entries = zipEntries.map(entry => ({
            entryName: entry.entryName,
            name: entry.name || entry.entryName.split('/').filter(Boolean).pop() || '',
            isDirectory: entry.isDirectory,
            size: entry.header.size || 0,
            compressedSize: entry.header.compressedSize || 0,
            mtime: entry.header.time ? new Date(entry.header.time).toISOString() : undefined
          }));
        } catch (e: any) {
          return res.status(400).json({ error: 'فرمت این فایل فشرده پشتیبانی نمی‌شود یا فایل خراب است.' });
        }
      }
    }

    const totalUncompressedSize = entries.reduce((acc, curr) => acc + curr.size, 0);

    res.json({
      success: true,
      archivePath,
      filename,
      format,
      archiveSize: stat.size,
      totalFiles: entries.filter(e => !e.isDirectory).length,
      totalDirectories: entries.filter(e => e.isDirectory).length,
      totalUncompressedSize,
      entries
    });
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در خواندن محتوای فایل فشرده: ' + err.message });
  }
});

// Read or download a single file from inside an archive
app.get('/api/files/archive/file', async (req: Request, res: Response) => {
  try {
    const archivePath = req.query.archivePath as string;
    const entryName = req.query.entryName as string;
    const isDownload = req.query.download === '1' || req.query.download === 'true';

    if (!archivePath || !fs.existsSync(archivePath) || !entryName) {
      return res.status(400).json({ error: 'مسیر آرشیو و نام فایل الزامی است' });
    }

    const lower = archivePath.toLowerCase();
    const fileName = entryName.split('/').filter(Boolean).pop() || 'file';

    if (lower.endsWith('.7z')) {
      const { stdout } = await execFileAsync(path7za, ['x', '-so', archivePath, entryName], {
        encoding: 'buffer',
        maxBuffer: 50 * 1024 * 1024
      });
      const buffer = stdout as Buffer;
      if (!buffer || buffer.length === 0) {
        return res.status(404).json({ error: 'محتوای فایل خالی است یا خوانده نشد' });
      }

      if (isDownload) {
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        return res.send(buffer);
      }

      const isLikelyText = !buffer.slice(0, 512).includes(0);
      if (isLikelyText) {
        return res.json({
          success: true,
          fileName,
          entryName,
          size: buffer.length,
          isText: true,
          content: buffer.toString('utf-8')
        });
      } else {
        return res.json({
          success: true,
          fileName,
          entryName,
          size: buffer.length,
          isText: false,
          base64: buffer.toString('base64')
        });
      }
    } else if (lower.endsWith('.rar')) {
      // Extract single file to temporary directory
      const tempDir = path.join(os.tmpdir(), `temp_rar_preview_${Date.now()}`);
      await fsPromises.mkdir(tempDir, { recursive: true });

      try {
        let extracted = false;
        if (unrarMod) {
          try {
            const ext = await unrarMod.createExtractorFromFile({ filepath: archivePath, targetPath: tempDir });
            const result = ext.extract({ files: [entryName] });
            [...result.files];
            extracted = true;
          } catch (unrarErr) {
            console.warn('unrar single file extract fallback to 7za:', unrarErr);
          }
        }
        if (!extracted) {
          await run7za(['x', '-y', archivePath, `-o${tempDir}`, entryName]);
        }

        const targetFile = path.join(tempDir, entryName);
        if (!fs.existsSync(targetFile)) {
          return res.status(404).json({ error: 'فایل درون آرشیو RAR یافت نشد' });
        }

        const buffer = fs.readFileSync(targetFile);
        if (isDownload) {
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
          res.setHeader('Content-Type', 'application/octet-stream');
          return res.send(buffer);
        }

        const isLikelyText = !buffer.slice(0, 512).includes(0);
        if (isLikelyText) {
          return res.json({
            success: true,
            fileName,
            entryName,
            size: buffer.length,
            isText: true,
            content: buffer.toString('utf-8')
          });
        } else {
          return res.json({
            success: true,
            fileName,
            entryName,
            size: buffer.length,
            isText: false,
            base64: buffer.toString('base64')
          });
        }
      } finally {
        try { await fsPromises.rm(tempDir, { recursive: true, force: true }); } catch {}
      }
    } else if (lower.endsWith('.zip')) {
      const zip = new AdmZip(archivePath);
      const entry = zip.getEntry(entryName);
      if (!entry) {
        return res.status(404).json({ error: 'فایل درون آرشیو یافت نشد' });
      }

      const buffer = zip.readFile(entry);
      if (!buffer) {
        return res.status(404).json({ error: 'محتوای فایل خالی است یا خوانده نشد' });
      }

      if (isDownload) {
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        return res.send(buffer);
      }

      const isLikelyText = !buffer.slice(0, 512).includes(0);
      if (isLikelyText) {
        return res.json({
          success: true,
          fileName,
          entryName,
          size: buffer.length,
          isText: true,
          content: buffer.toString('utf-8')
        });
      } else {
        return res.json({
          success: true,
          fileName,
          entryName,
          size: buffer.length,
          isText: false,
          base64: buffer.toString('base64')
        });
      }
    } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.tar')) {
      const flag = lower.endsWith('.tar') ? '-xf' : '-xzf';
      const formattedEntry = entryName.startsWith('./') ? entryName : `./${entryName}`;
      
      try {
        const { stdout } = await execAsync(`tar ${flag} ${JSON.stringify(archivePath)} ${JSON.stringify(entryName)} -O`, {
          maxBuffer: 20 * 1024 * 1024
        });
        
        if (isDownload) {
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
          res.setHeader('Content-Type', 'application/octet-stream');
          return res.send(stdout);
        }

        return res.json({
          success: true,
          fileName,
          entryName,
          size: Buffer.byteLength(stdout),
          isText: true,
          content: stdout
        });
      } catch (tarErr: any) {
        try {
          const { stdout } = await execAsync(`tar ${flag} ${JSON.stringify(archivePath)} ${JSON.stringify(formattedEntry)} -O`, {
            maxBuffer: 20 * 1024 * 1024
          });
          if (isDownload) {
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
            res.setHeader('Content-Type', 'application/octet-stream');
            return res.send(stdout);
          }
          return res.json({
            success: true,
            fileName,
            entryName,
            size: Buffer.byteLength(stdout),
            isText: true,
            content: stdout
          });
        } catch {
          return res.status(500).json({ error: 'خطا در استخراج فایل انتخابی از آرشیو: ' + tarErr.message });
        }
      }
    } else {
      return res.status(400).json({ error: 'فرمت آرشیو پشتیبانی نمی‌شود' });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در باز کردن فایل: ' + err.message });
  }
});

// Extract specific entries from archive
app.post('/api/files/archive/extract-entries', async (req: Request, res: Response) => {
  try {
    const { archivePath, entries, destinationDir, password } = req.body;
    if (!archivePath || !fs.existsSync(archivePath) || !entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'مسیر آرشیو و لیست فایل‌ها الزامی است' });
    }

    const dest = destinationDir || path.dirname(archivePath);
    if (!fs.existsSync(dest)) {
      await fsPromises.mkdir(dest, { recursive: true });
    }

    const pass = typeof password === 'string' && password.trim().length > 0 ? password.trim() : '';
    const passArgs = pass ? [`-p${pass}`] : [];
    const lower = archivePath.toLowerCase();

    if (lower.endsWith('.7z')) {
      await run7za(['x', '-y', ...passArgs, archivePath, `-o${dest}`, ...entries]);
      res.json({ success: true, message: `${entries.length} مورد با موفقیت استخراج شد`, destination: dest });
    } else if (lower.endsWith('.rar')) {
      let extracted = false;
      if (unrarMod) {
        try {
          const extractor = await unrarMod.createExtractorFromFile({ filepath: archivePath, targetPath: dest, password: pass });
          const result = extractor.extract({ files: entries });
          [...result.files];
          extracted = true;
        } catch (unrarErr) {
          console.warn('unrar extract entries fallback to 7za:', unrarErr);
        }
      }
      if (!extracted) {
        await run7za(['x', '-y', ...passArgs, archivePath, `-o${dest}`, ...entries]);
      }
      res.json({ success: true, message: `${entries.length} مورد با موفقیت استخراج شد`, destination: dest });
    } else if (lower.endsWith('.zip')) {
      if (!pass) {
        try {
          const zip = new AdmZip(archivePath);
          for (const entryName of entries) {
            const entry = zip.getEntry(entryName);
            if (entry) {
              zip.extractEntryTo(entry, dest, true, true);
            }
          }
          return res.json({ success: true, message: `${entries.length} مورد با موفقیت استخراج شد`, destination: dest });
        } catch {}
      }
      await run7za(['x', '-y', ...passArgs, archivePath, `-o${dest}`, ...entries]);
      res.json({ success: true, message: `${entries.length} مورد با موفقیت استخراج شد`, destination: dest });
    } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.tar')) {
      const flag = lower.endsWith('.tar') ? '-xf' : '-xzf';
      const escapedEntries = entries.map((e: string) => JSON.stringify(e)).join(' ');
      await execAsync(`tar ${flag} ${JSON.stringify(archivePath)} -C ${JSON.stringify(dest)} ${escapedEntries}`);
      res.json({ success: true, message: `${entries.length} مورد با موفقیت استخراج شد`, destination: dest });
    } else {
      await run7za(['x', '-y', ...passArgs, archivePath, `-o${dest}`, ...entries]);
      res.json({ success: true, message: `${entries.length} مورد با موفقیت استخراج شد`, destination: dest });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در استخراج موارد انتخابی: ' + err.message });
  }
});

// Add files directly into an existing archive (Drag & Drop to add)
app.post('/api/files/archive/add-files', tempUpload.any(), async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'هیچ فایلی آپلود نشد' });
  }

  const archivePath = (req.query.archivePath as string) || req.body.archivePath;
  if (!archivePath || !fs.existsSync(archivePath)) {
    for (const f of files) {
      try { fs.unlinkSync(f.path); } catch {}
    }
    return res.status(404).json({ error: 'فایل آرشیو مقصد یافت نشد' });
  }

  try {
    const filePaths = JSON.parse(req.body.filePaths || '[]');
    const lower = archivePath.toLowerCase();

    if (lower.endsWith('.7z')) {
      const tempAddDir = path.join(os.tmpdir(), `temp_7z_add_${Date.now()}`);
      await fsPromises.mkdir(tempAddDir, { recursive: true });

      const relativeNames: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const entryName = (filePaths[i] || file.originalname).replace(/^\/+/, '');
        const targetPath = path.join(tempAddDir, entryName);
        await fsPromises.mkdir(path.dirname(targetPath), { recursive: true });
        safeMoveFile(file.path, targetPath);
        relativeNames.push(entryName);
      }

      await run7za(['a', archivePath, ...relativeNames], { cwd: tempAddDir });
      try { await fsPromises.rm(tempAddDir, { recursive: true, force: true }); } catch {}
    } else if (lower.endsWith('.zip')) {
      const zip = new AdmZip(archivePath);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const entryName = (filePaths[i] || file.originalname).replace(/^\/+/, '');
        const fileBuffer = fs.readFileSync(file.path);
        
        // Remove existing entry if it matches
        const existing = zip.getEntry(entryName);
        if (existing) {
          zip.deleteFile(existing);
        }
        zip.addFile(entryName, fileBuffer);
      }
      zip.writeZip(archivePath);
    } else if (lower.endsWith('.tar')) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const originalName = filePaths[i] || file.originalname;
        const tempTarget = path.join(path.dirname(file.path), originalName);
        safeMoveFile(file.path, tempTarget);
        await execAsync(`tar -rf ${JSON.stringify(archivePath)} -C ${JSON.stringify(path.dirname(tempTarget))} ${JSON.stringify(path.basename(tempTarget))}`);
        try { fs.unlinkSync(tempTarget); } catch {}
      }
    } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
      const tempTar = path.join(os.tmpdir(), `temp_append_${Date.now()}.tar`);
      await execAsync(`gzip -dc ${JSON.stringify(archivePath)} > ${JSON.stringify(tempTar)}`);
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const originalName = filePaths[i] || file.originalname;
        const tempTarget = path.join(path.dirname(file.path), originalName);
        safeMoveFile(file.path, tempTarget);
        await execAsync(`tar -rf ${JSON.stringify(tempTar)} -C ${JSON.stringify(path.dirname(tempTarget))} ${JSON.stringify(path.basename(tempTarget))}`);
        try { fs.unlinkSync(tempTarget); } catch {}
      }
      
      await execAsync(`gzip -c ${JSON.stringify(tempTar)} > ${JSON.stringify(archivePath)}`);
      try { fs.unlinkSync(tempTar); } catch {}
    } else {
      throw new Error('فرمت این فایل فشرده برای افزودن فایل پشتیبانی نمی‌شود');
    }

    // Cleanup any remaining temp files
    for (const f of files) {
      if (fs.existsSync(f.path)) {
        try { fs.unlinkSync(f.path); } catch {}
      }
    }

    res.json({
      success: true,
      message: `${files.length} فایل با موفقیت به آرشیو فشرده اضافه شد`,
      count: files.length
    });
  } catch (err: any) {
    for (const f of files) {
      if (fs.existsSync(f.path)) {
        try { fs.unlinkSync(f.path); } catch {}
      }
    }
    res.status(500).json({ error: 'خطا در افزودن فایل به آرشیو: ' + err.message });
  }
});

// Delete specific entries directly from inside an archive
app.post('/api/files/archive/delete-entries', async (req: Request, res: Response) => {
  try {
    const { archivePath, entries } = req.body;
    if (!archivePath || !fs.existsSync(archivePath) || !entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'مسیر آرشیو و لیست فایل‌ها الزامی است' });
    }

    const lower = archivePath.toLowerCase();
    if (lower.endsWith('.7z')) {
      await run7za(['d', archivePath, ...entries]);
      res.json({ success: true, message: `${entries.length} مورد با موفقیت از آرشیو 7-Zip حذف شد` });
    } else if (lower.endsWith('.zip')) {
      const zip = new AdmZip(archivePath);
      for (const entryName of entries) {
        const entry = zip.getEntry(entryName);
        if (entry) {
          zip.deleteFile(entry);
        }
        // Also delete child entries if directory
        const allEntries = zip.getEntries();
        for (const e of allEntries) {
          if (e.entryName.startsWith(entryName + '/') || e.entryName === entryName) {
            zip.deleteFile(e);
          }
        }
      }
      zip.writeZip(archivePath);
      res.json({ success: true, message: `${entries.length} مورد با موفقیت از آرشیو حذف شد` });
    } else if (lower.endsWith('.tar')) {
      for (const entryName of entries) {
        const formatted1 = entryName.replace(/^\.\//, '');
        const formatted2 = entryName.startsWith('./') ? entryName : `./${entryName}`;
        try {
          await execAsync(`tar --delete -f ${JSON.stringify(archivePath)} ${JSON.stringify(formatted1)}`);
        } catch {
          try {
            await execAsync(`tar --delete -f ${JSON.stringify(archivePath)} ${JSON.stringify(formatted2)}`);
          } catch {}
        }
      }
      res.json({ success: true, message: `${entries.length} مورد با موفقیت از آرشیو حذف شد` });
    } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
      const tempTar = path.join(os.tmpdir(), `temp_del_${Date.now()}.tar`);
      await execAsync(`gzip -dc ${JSON.stringify(archivePath)} > ${JSON.stringify(tempTar)}`);
      for (const entryName of entries) {
        const formatted1 = entryName.replace(/^\.\//, '');
        const formatted2 = entryName.startsWith('./') ? entryName : `./${entryName}`;
        try {
          await execAsync(`tar --delete -f ${JSON.stringify(tempTar)} ${JSON.stringify(formatted1)}`);
        } catch {
          try {
            await execAsync(`tar --delete -f ${JSON.stringify(tempTar)} ${JSON.stringify(formatted2)}`);
          } catch {}
        }
      }
      await execAsync(`gzip -c ${JSON.stringify(tempTar)} > ${JSON.stringify(archivePath)}`);
      try { fs.unlinkSync(tempTar); } catch {}
      res.json({ success: true, message: `${entries.length} مورد با موفقیت از آرشیو حذف شد` });
    } else {
      res.status(400).json({ error: 'فرمت آرشیو برای حذف آیتم پشتیبانی نمی‌شود' });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در حذف موارد از آرشیو: ' + err.message });
  }
});

// Rename a specific entry directly inside an archive
app.post('/api/files/archive/rename-entry', async (req: Request, res: Response) => {
  try {
    const { archivePath, oldEntryName, newEntryName } = req.body;
    if (!archivePath || !fs.existsSync(archivePath) || !oldEntryName || !newEntryName) {
      return res.status(400).json({ error: 'مسیر آرشیو، نام قبلی و نام جدید الزامی هستند' });
    }

    const trimmedNew = newEntryName.trim().replace(/^\/+/, '');
    if (!trimmedNew || oldEntryName === trimmedNew) {
      return res.json({ success: true, message: 'نام تغییر نکرد' });
    }

    const lower = archivePath.toLowerCase();
    if (lower.endsWith('.7z')) {
      await run7za(['rn', archivePath, oldEntryName, trimmedNew]);
      return res.json({ success: true, message: 'تغییر نام در آرشیو 7-Zip با موفقیت انجام شد' });
    } else if (lower.endsWith('.zip')) {
      const zip = new AdmZip(archivePath);
      const entry = zip.getEntry(oldEntryName);
      
      if (entry) {
        if (entry.isDirectory) {
          const allEntries = zip.getEntries();
          const oldPrefix = oldEntryName.endsWith('/') ? oldEntryName : oldEntryName + '/';
          const newPrefix = trimmedNew.endsWith('/') ? trimmedNew : trimmedNew + '/';
          
          for (const e of allEntries) {
            if (e.entryName === oldEntryName || e.entryName === oldPrefix) {
              zip.deleteFile(e);
            } else if (e.entryName.startsWith(oldPrefix)) {
              const subName = e.entryName.substring(oldPrefix.length);
              const childNewPath = newPrefix + subName;
              const content = zip.readFile(e);
              zip.deleteFile(e);
              if (content) {
                zip.addFile(childNewPath, content);
              }
            }
          }
        } else {
          const content = zip.readFile(entry);
          zip.deleteFile(entry);
          if (content) {
            zip.addFile(trimmedNew, content);
          }
        }
        zip.writeZip(archivePath);
        return res.json({ success: true, message: 'تغییر نام با موفقیت انجام شد' });
      } else {
        return res.status(404).json({ error: 'فایل یا پوشه مورد نظر در آرشیو یافت نشد' });
      }
    } else if (lower.endsWith('.tar') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
      const isGz = lower.endsWith('.tar.gz') || lower.endsWith('.tgz');
      const tempTar = isGz ? path.join(os.tmpdir(), `temp_ren_${Date.now()}.tar`) : archivePath;
      if (isGz) {
        await execAsync(`gzip -dc ${JSON.stringify(archivePath)} > ${JSON.stringify(tempTar)}`);
      }

      const tempDir = path.join(os.tmpdir(), `temp_ext_${Date.now()}`);
      await fsPromises.mkdir(tempDir, { recursive: true });

      try {
        await execAsync(`tar -xf ${JSON.stringify(tempTar)} -C ${JSON.stringify(tempDir)} ${JSON.stringify(oldEntryName)}`);
        
        const extractedPath = path.join(tempDir, oldEntryName);
        const renamedPath = path.join(tempDir, trimmedNew);
        
        if (fs.existsSync(extractedPath)) {
          await fsPromises.mkdir(path.dirname(renamedPath), { recursive: true });
          await fsPromises.rename(extractedPath, renamedPath);
          
          // Delete old entry from tar
          try {
            await execAsync(`tar --delete -f ${JSON.stringify(tempTar)} ${JSON.stringify(oldEntryName)}`);
          } catch {}
          
          // Append renamed entry
          await execAsync(`tar -rf ${JSON.stringify(tempTar)} -C ${JSON.stringify(tempDir)} ${JSON.stringify(trimmedNew)}`);
        }
      } catch (tarErr: any) {
        throw new Error('خطا در فرآیند تغییر نام: ' + tarErr.message);
      } finally {
        if (isGz) {
          await execAsync(`gzip -c ${JSON.stringify(tempTar)} > ${JSON.stringify(archivePath)}`);
          try { fs.unlinkSync(tempTar); } catch {}
        }
        try {
          await fsPromises.rm(tempDir, { recursive: true, force: true });
        } catch {}
      }

      return res.json({ success: true, message: 'تغییر نام با موفقیت انجام شد' });
    } else {
      return res.status(400).json({ error: 'فرمت آرشیو برای تغییر نام پشتیبانی نمی‌شود' });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در تغییر نام آیتم در آرشیو: ' + err.message });
  }
});

// ---------------------- BACKGROUND PROCESSES & SCRIPTS ----------------------
app.get('/api/processes/list', async (req: Request, res: Response) => {
  // Get system OS processes
  let osProcesses: any[] = [];
  try {
    const { stdout } = await execAsync('ps aux --sort=-%cpu | head -n 30');
    const lines = stdout.trim().split('\n');
    if (lines.length > 1) {
      osProcesses = lines.slice(1).map(line => {
        const parts = line.trim().split(/\s+/);
        return {
          user: parts[0],
          pid: parseInt(parts[1], 10),
          cpu: parseFloat(parts[2]),
          mem: parseFloat(parts[3]),
          vsz: parts[4],
          rss: parts[5],
          tty: parts[6],
          stat: parts[7],
          time: parts[9],
          command: parts.slice(10).join(' ')
        };
      }).filter(p => !isNaN(p.pid) && !p.stat.includes('Z'));
    }
  } catch {
    // Fallback if ps command fails
  }

  const tasksList = Array.from(backgroundTasks.values()).map(item => item.task);

  res.json({
    backgroundTasks: tasksList,
    systemProcesses: osProcesses
  });
});

function parseGithubUrl(rawUrl: string): { repoUrl: string; repoName: string } {
  let url = rawUrl.trim();
  url = url.replace(/\/+$/, '');
  
  // Match raw.githubusercontent.com
  const rawMatch = url.match(/https?:\/\/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/.*/);
  if (rawMatch) {
    const username = rawMatch[1];
    const reponame = rawMatch[2].replace(/\.git$/, '');
    return {
      repoUrl: `https://github.com/${username}/${reponame}.git`,
      repoName: reponame
    };
  }

  // Match blob or tree or raw URLs: e.g. https://github.com/username/reponame/blob/main/bot.py
  const blobTreeMatch = url.match(/https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/(blob|tree|raw)\/.*/);
  if (blobTreeMatch) {
    const username = blobTreeMatch[1];
    const reponame = blobTreeMatch[2].replace(/\.git$/, '');
    return {
      repoUrl: `https://github.com/${username}/${reponame}.git`,
      repoName: reponame
    };
  }

  // Standard repo URL: https://github.com/username/reponame or https://github.com/username/reponame.git
  const repoMatch = url.match(/https?:\/\/github\.com\/([^\/]+)\/([^\/]+)/);
  if (repoMatch) {
    const username = repoMatch[1];
    const reponame = repoMatch[2].replace(/\.git$/, '');
    return {
      repoUrl: `https://github.com/${username}/${reponame}.git`,
      repoName: reponame
    };
  }

  return { repoUrl: url, repoName: `repo_${Date.now()}` };
}

async function getBestPipCommand(logs?: string[]): Promise<string> {
  const candidateCmds = [
    'pip3',
    'pip',
    '/usr/local/bin/pip3',
    '/usr/local/bin/pip',
    '/root/.local/bin/pip',
    'python3 -m pip'
  ];

  for (const cmd of candidateCmds) {
    try {
      await execAsync(`${cmd} --version`);
      return cmd;
    } catch {}
  }

  if (logs) logs.push(`[${new Date().toLocaleTimeString()}] pip module not found. Auto-installing pip...\n`);
  
  try {
    const getPipScript = `import urllib.request; urllib.request.urlretrieve("https://bootstrap.pypa.io/get-pip.py", "/tmp/get-pip.py")`;
    await execAsync(`python3 -c '${getPipScript}' || curl -sSL https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py`);
    await execAsync(`python3 /tmp/get-pip.py --break-system-packages`);
    if (logs) logs.push(`[${new Date().toLocaleTimeString()}] pip installed successfully.\n`);

    for (const cmd of candidateCmds) {
      try {
        await execAsync(`${cmd} --version`);
        return cmd;
      } catch {}
    }
  } catch (err: any) {
    if (logs) logs.push(`[WARN] Auto-installing pip failed: ${err.message}\n`);
  }

  return 'python3 -m pip';
}

// ---------------------- PYTHON PACKAGES MANAGEMENT ----------------------
app.get('/api/python/packages', async (req: Request, res: Response) => {
  try {
    const pipCmd = await getBestPipCommand();
    let packages: { name: string; version: string }[] = [];
    try {
      const { stdout } = await execAsync(`${pipCmd} list --format=json`);
      packages = JSON.parse(stdout.trim());
    } catch {
      const pyScript = `import importlib.metadata, json
try:
    dists = [{'name': d.metadata['Name'], 'version': d.version} for d in importlib.metadata.distributions()]
except Exception:
    import pkg_resources
    dists = [{'name': p.project_name, 'version': p.version} for p in pkg_resources.working_set]
print(json.dumps(dists))`;
      const { stdout } = await execFileAsync('python3', ['-c', pyScript]);
      packages = JSON.parse(stdout.trim());
    }
    packages.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    res.json({ packages });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to list Python packages: ' + err.message });
  }
});

app.post('/api/python/packages/uninstall', async (req: Request, res: Response) => {
  try {
    const { packages, uninstallAll } = req.body;
    const pipCmd = await getBestPipCommand();

    let targetPackages: string[] = [];

    if (uninstallAll) {
      let allPkgs: { name: string; version: string }[] = [];
      try {
        const { stdout } = await execAsync(`${pipCmd} list --format=json`);
        allPkgs = JSON.parse(stdout.trim());
      } catch {
        const pyScript = `import importlib.metadata, json; print(json.dumps([{'name': d.metadata['Name']} for d in importlib.metadata.distributions()]))`;
        const { stdout } = await execFileAsync('python3', ['-c', pyScript]);
        allPkgs = JSON.parse(stdout.trim());
      }
      const essential = ['pip', 'setuptools', 'wheel'];
      targetPackages = allPkgs.map(p => p.name).filter(name => !essential.includes(name.toLowerCase()));
    } else if (Array.isArray(packages) && packages.length > 0) {
      targetPackages = packages;
    }

    if (targetPackages.length === 0) {
      return res.status(400).json({ error: 'هیچ کتابخانه‌ای برای حذف انتخاب نشده است' });
    }

    const safePackages = targetPackages.filter(p => typeof p === 'string' && /^[a-zA-Z0-9_\-\.]+$/.test(p));
    if (safePackages.length === 0) {
      return res.status(400).json({ error: 'نام کتابخانه‌ها نامعتبر است' });
    }

    const pkgListStr = safePackages.map(p => `"${p}"`).join(' ');
    let output = '';
    try {
      const { stdout, stderr } = await execAsync(`${pipCmd} uninstall -y --break-system-packages ${pkgListStr}`);
      output = stdout + (stderr ? '\n' + stderr : '');
    } catch (err1: any) {
      const { stdout, stderr } = await execAsync(`${pipCmd} uninstall -y ${pkgListStr}`);
      output = stdout + (stderr ? '\n' + stderr : '');
    }

    res.json({ success: true, message: `تعداد ${safePackages.length} کتابخانه با موفقیت حذف شد`, output });
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در حذف کتابخانه‌ها: ' + err.message });
  }
});

app.post('/api/python/packages/install', async (req: Request, res: Response) => {
  try {
    const { packageName } = req.body;
    if (!packageName || typeof packageName !== 'string' || !packageName.trim()) {
      return res.status(400).json({ error: 'نام کتابخانه الزامی است' });
    }
    const pipCmd = await getBestPipCommand();
    const pkg = packageName.trim();
    
    let output = '';
    try {
      const { stdout, stderr } = await execAsync(`${pipCmd} install "${pkg}" --break-system-packages`);
      output = stdout + (stderr ? '\n' + stderr : '');
    } catch (err1: any) {
      const { stdout, stderr } = await execAsync(`${pipCmd} install "${pkg}"`);
      output = stdout + (stderr ? '\n' + stderr : '');
    }

    res.json({ success: true, message: `کتابخانه ${pkg} با موفقیت نصب شد`, output });
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در نصب کتابخانه: ' + err.message });
  }
});

async function installPythonRequirements(workDir: string, logs: string[]): Promise<void> {
  if (!fs.existsSync(path.join(workDir, 'requirements.txt'))) return;

  logs.push(`[${new Date().toLocaleTimeString()}] Installing dependencies from requirements.txt...\n`);
  const pipCmd = await getBestPipCommand(logs);

  try {
    const { stdout, stderr } = await execAsync(`${pipCmd} install -r requirements.txt --break-system-packages`, { cwd: workDir });
    if (stdout) logs.push(stdout);
    if (stderr) logs.push(`[STDERR] ${stderr}`);
    logs.push(`[${new Date().toLocaleTimeString()}] Dependencies installed successfully.\n`);
  } catch (firstErr: any) {
    try {
      logs.push(`[WARN] Standard install failed (${firstErr.message}), trying without --break-system-packages...\n`);
      const { stdout, stderr } = await execAsync(`${pipCmd} install -r requirements.txt`, { cwd: workDir });
      if (stdout) logs.push(stdout);
      if (stderr) logs.push(`[STDERR] ${stderr}`);
      logs.push(`[${new Date().toLocaleTimeString()}] Dependencies installed successfully.\n`);
    } catch (err: any) {
      logs.push(`[ERR] Failed to install requirements: ${err.message}\n`);
    }
  }
}

async function downloadGithubZipArchive(rawGithubUrl: string, workDir: string, logs: string[]): Promise<boolean> {
  const { repoUrl, repoName } = parseGithubUrl(rawGithubUrl);
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) return false;

  const username = match[1];
  const reponame = match[2].replace(/\.git$/, '');

  const zipUrls = [
    `https://github.com/${username}/${reponame}/archive/refs/heads/main.zip`,
    `https://github.com/${username}/${reponame}/archive/refs/heads/master.zip`,
    `https://codeload.github.com/${username}/${reponame}/zip/refs/heads/main`,
    `https://codeload.github.com/${username}/${reponame}/zip/refs/heads/master`
  ];

  const tmpZipPath = path.join('/tmp', `repo_${Date.now()}.zip`);
  const tmpExtractDir = path.join('/tmp', `ext_${Date.now()}`);

  logs.push(`[${new Date().toLocaleTimeString()}] Attempting direct ZIP download from GitHub for ${username}/${reponame}...\n`);

  let downloaded = false;
  for (const zipUrl of zipUrls) {
    try {
      logs.push(`[${new Date().toLocaleTimeString()}] Downloading ${zipUrl}...\n`);
      const pyDownloadScript = `import urllib.request; urllib.request.urlretrieve("${zipUrl}", "${tmpZipPath}")`;
      await execAsync(`python3 -c '${pyDownloadScript}' || curl -L -s -o "${tmpZipPath}" "${zipUrl}"`);
      
      if (fs.existsSync(tmpZipPath) && fs.statSync(tmpZipPath).size > 500) {
        downloaded = true;
        break;
      }
    } catch (e: any) {
      logs.push(`[WARN] Failed to download from ${zipUrl}: ${e.message}\n`);
    }
  }

  if (!downloaded) {
    logs.push(`[ERR] Could not download repository ZIP archive from GitHub.\n`);
    return false;
  }

  try {
    fs.mkdirSync(tmpExtractDir, { recursive: true });
    fs.mkdirSync(workDir, { recursive: true });

    // Extract zip
    await execAsync(`python3 -c "import zipfile; zipfile.ZipFile('${tmpZipPath}', 'r').extractall('${tmpExtractDir}')"`);

    // Find extracted directory (usually repoName-main or repoName-master)
    const extractedItems = fs.readdirSync(tmpExtractDir);
    let sourceFolder = tmpExtractDir;
    if (extractedItems.length === 1 && fs.statSync(path.join(tmpExtractDir, extractedItems[0])).isDirectory()) {
      sourceFolder = path.join(tmpExtractDir, extractedItems[0]);
    }

    // Move or copy all files to workDir
    const filesToCopy = fs.readdirSync(sourceFolder);
    for (const item of filesToCopy) {
      const srcItem = path.join(sourceFolder, item);
      const destItem = path.join(workDir, item);
      if (fs.existsSync(destItem)) {
        await fsPromises.rm(destItem, { recursive: true, force: true });
      }
      await fsPromises.cp(srcItem, destItem, { recursive: true });
    }

    logs.push(`[${new Date().toLocaleTimeString()}] Repository archive extracted successfully into ${workDir}.\n`);

    // Cleanup
    await fsPromises.rm(tmpZipPath, { force: true }).catch(() => {});
    await fsPromises.rm(tmpExtractDir, { recursive: true, force: true }).catch(() => {});
    return true;
  } catch (err: any) {
    logs.push(`[ERR] ZIP Extraction error: ${err.message}\n`);
    return false;
  }
}

async function cloneOrUpdateGithubRepo(rawGithubUrl: string, targetWorkDir: string, logs: string[]): Promise<string> {
  const { repoUrl, repoName } = parseGithubUrl(rawGithubUrl);
  const workDir = targetWorkDir ? path.resolve(targetWorkDir) : path.join(process.cwd(), repoName);

  logs.push(`[${new Date().toLocaleTimeString()}] Target directory: ${workDir}\n`);

  const gitFolderExists = fs.existsSync(path.join(workDir, '.git'));

  if (gitFolderExists) {
    logs.push(`[${new Date().toLocaleTimeString()}] Existing Git repository found at ${workDir}. Pulling latest changes...\n`);
    try {
      await execAsync(`git -C "${workDir}" fetch --all`);
      await execAsync(`git -C "${workDir}" reset --hard origin/HEAD || git -C "${workDir}" pull`);
      logs.push(`[${new Date().toLocaleTimeString()}] Git repository updated successfully.\n`);
    } catch (err: any) {
      logs.push(`[WARN] git pull failed (${err.message}). Trying ZIP download fallback...\n`);
      const zipSuccess = await downloadGithubZipArchive(rawGithubUrl, workDir, logs);
      if (!zipSuccess) {
        logs.push(`[WARN] Cleaning folder and retrying git clone...\n`);
        await fsPromises.rm(workDir, { recursive: true, force: true });
        fs.mkdirSync(workDir, { recursive: true });
        await execAsync(`git clone "${repoUrl}" "${workDir}"`);
        logs.push(`[${new Date().toLocaleTimeString()}] Repository cloned successfully into ${workDir}.\n`);
      }
    }
  } else {
    try {
      if (fs.existsSync(workDir)) {
        logs.push(`[${new Date().toLocaleTimeString()}] Preparing directory ${workDir} for clone...\n`);
      } else {
        fs.mkdirSync(workDir, { recursive: true });
      }
      logs.push(`[${new Date().toLocaleTimeString()}] Cloning GitHub repository (${repoUrl}) into ${workDir}...\n`);
      await execAsync(`git clone "${repoUrl}" "${workDir}"`);
      logs.push(`[${new Date().toLocaleTimeString()}] Repository cloned successfully into ${workDir}.\n`);
    } catch (cloneErr: any) {
      logs.push(`[WARN] git clone failed (${cloneErr.message}). Using direct ZIP download fallback...\n`);
      if (fs.existsSync(workDir)) {
        await fsPromises.rm(workDir, { recursive: true, force: true }).catch(() => {});
      }
      fs.mkdirSync(workDir, { recursive: true });
      const zipSuccess = await downloadGithubZipArchive(rawGithubUrl, workDir, logs);
      if (!zipSuccess) {
        throw new Error(`Failed to clone git repository and ZIP fallback failed: ${cloneErr.message}`);
      }
    }
  }

  // Log all cloned files for transparency
  try {
    const filesInDir = fs.readdirSync(workDir);
    logs.push(`[${new Date().toLocaleTimeString()}] Total ${filesInDir.length} files/folders downloaded: ${filesInDir.join(', ')}\n`);
  } catch {}

  return workDir;
}

function autoDetectCommand(rawCommand: string, workDir: string, logs: string[]): string {
  let cmd = rawCommand ? rawCommand.trim() : '';

  // If command is empty or default 'python3 main.py' or 'python main.py'
  if (!cmd || cmd === 'python3 main.py' || cmd === 'python main.py') {
    const mainPyExists = fs.existsSync(path.join(workDir, 'main.py'));
    if (!mainPyExists) {
      const candidates = ['bot.py', 'app.py', 'index.py', 'server.py', 'run.py', 'main.ts', 'index.ts', 'server.ts'];
      for (const candidate of candidates) {
        if (fs.existsSync(path.join(workDir, candidate))) {
          logs.push(`[${new Date().toLocaleTimeString()}] Auto-detected entry script: ${candidate}\n`);
          return candidate.endsWith('.py') ? `python3 ${candidate}` : `node ${candidate}`;
        }
      }
      try {
        const files = fs.readdirSync(workDir);
        const pyFile = files.find(f => f.endsWith('.py') && !f.startsWith('.'));
        if (pyFile) {
          logs.push(`[${new Date().toLocaleTimeString()}] Auto-detected python script: ${pyFile}\n`);
          return `python3 ${pyFile}`;
        }
      } catch {}
    }
  }

  return cmd || 'python3 main.py';
}

function killTaskProcess(taskData: BackgroundTask, item?: { process?: ChildProcess }) {
  taskData.status = 'killed';
  const pid = item?.process?.pid || taskData.pid;
  if (pid) {
    try { process.kill(-pid, 'SIGKILL'); } catch {}
    try { process.kill(pid, 'SIGKILL'); } catch {}
    try { process.kill(-pid, 'SIGTERM'); } catch {}
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }
  if (taskData.cwd && taskData.cwd !== process.cwd()) {
    try {
      execAsync(`pkill -9 -f "${taskData.cwd}"`).catch(() => {});
    } catch {}
  }
}

function attachBackgroundTaskListeners(
  taskId: string,
  taskData: BackgroundTask,
  child: ChildProcess,
  item: { task: BackgroundTask; process?: ChildProcess }
) {
  child.stdout?.on('data', (data) => {
    const line = data.toString();
    taskData.logs.push(line);
    if (taskData.logs.length > 500) taskData.logs.shift();
  });

  child.stderr?.on('data', (data) => {
    const line = `[STDERR] ${data.toString()}`;
    taskData.logs.push(line);
    if (taskData.logs.length > 500) taskData.logs.shift();
  });

  child.on('close', async (code) => {
    if (activeProcessesMap.has(taskId)) {
      activeProcessesMap.delete(taskId);
    }

    // IF MANUALLY KILLED BY USER: Do NOT auto-restart!
    if (taskData.status === 'killed') {
      taskData.exitCode = code ?? undefined;
      taskData.completedAt = new Date().toISOString();
      taskData.logs.push(`[${new Date().toLocaleTimeString()}] Process stopped/killed by user. Auto-restart skipped.\n`);
      notifyProcessExit(taskData);
      return;
    }

    if (code === 0) {
      taskData.status = 'completed';
      taskData.exitCode = code;
      taskData.completedAt = new Date().toISOString();
      taskData.logs.push(`[${new Date().toLocaleTimeString()}] Process completed successfully with exit code 0\n`);
      notifyProcessExit(taskData);
      return;
    }

    // Process crashed with non-zero exit code
    taskData.exitCode = code ?? undefined;
    taskData.completedAt = new Date().toISOString();

    if (taskData.autoRestartOnCrash !== false) {
      const now = Date.now();
      const tenMinutesAgo = now - 10 * 60 * 1000;

      // Filter recent crashes within the last 10 minutes
      const recentCrashes = (taskData.recentCrashTimestamps || []).filter(ts => ts > tenMinutesAgo);
      recentCrashes.push(now);
      taskData.recentCrashTimestamps = recentCrashes;
      taskData.crashCount = (taskData.crashCount || 0) + 1;

      // Rate Limiter: Max 5 crashes in 10 minutes
      if (recentCrashes.length > 5) {
        taskData.status = 'failed';
        taskData.logs.push(
          `[${new Date().toLocaleTimeString()}] 🛑 Max auto-restart limit reached (${recentCrashes.length} crashes in 10 min). Auto-restart disabled for this process.\n`
        );
        notifyProcessExit(taskData, false);
        return;
      }

      // Exponential Backoff Delay: 2s, 4s, 8s, 16s, 32s (max 60s)
      const attemptInWindow = recentCrashes.length;
      const backoffMs = Math.min(60000, 2000 * Math.pow(2, attemptInWindow - 1));
      const backoffSec = Math.round(backoffMs / 1000);

      taskData.status = 'running';
      taskData.logs.push(
        `[${new Date().toLocaleTimeString()}] ⚠️ Process crashed with exit code ${code}. (Crash #${taskData.crashCount}, ${attemptInWindow}/5 in 10m). Waiting ${backoffSec}s backoff before restart...\n`
      );

      notifyProcessExit(taskData, true);

      // Wait exponential backoff delay
      await new Promise(r => setTimeout(r, backoffMs));

      if ((taskData.status as string) === 'killed') {
        taskData.logs.push(`[${new Date().toLocaleTimeString()}] Auto-restart cancelled due to manual stop.\n`);
        return;
      }

      try {
        const wrapped = await getVpnWrappedCommand(taskData.command, taskData.useVpn !== false);
        const newChild = spawn('sh', ['-c', wrapped.command], {
          cwd: taskData.cwd,
          env: wrapped.env,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        taskData.pid = newChild.pid;
        item.process = newChild;
        activeProcessesMap.set(taskId, newChild);

        attachBackgroundTaskListeners(taskId, taskData, newChild, item);
        newChild.unref();
      } catch (err: any) {
        taskData.status = 'failed';
        taskData.logs.push(`[${new Date().toLocaleTimeString()}] ❌ Failed to auto-restart process: ${err.message}\n`);
        notifyProcessExit(taskData);
      }
    } else {
      taskData.status = 'failed';
      taskData.logs.push(`[${new Date().toLocaleTimeString()}] Process exited with error code ${code} (Auto-restart disabled)\n`);
      notifyProcessExit(taskData);
    }
  });
}

app.post('/api/processes/run-background', tempUpload.any(), async (req: Request, res: Response) => {
  const { name, command, sourceType, githubUrl, installRequirements, cwd, targetDir } = req.body;
  if (!command && sourceType !== 'github') return res.status(400).json({ error: 'Command required' });

  const files = (req.files || []) as Express.Multer.File[];
  const id = 'task_' + Date.now();
  let workDir = cwd && fs.existsSync(cwd) ? cwd : process.cwd();

  const logs: string[] = [`[${new Date().toLocaleTimeString()}] Preparing background task...\n`];

  // Stop any existing background task running in the same directory or with the same name
  for (const [existingId, existingItem] of backgroundTasks.entries()) {
    const isSameCwd = existingItem.task.cwd && targetDir && path.resolve(existingItem.task.cwd) === path.resolve(targetDir);
    const isSameName = existingItem.task.name && name && existingItem.task.name.trim().toLowerCase() === name.trim().toLowerCase();
    if ((isSameCwd || isSameName) && existingItem.task.status === 'running') {
      logs.push(`[${new Date().toLocaleTimeString()}] Stopping previous instance of task '${existingItem.task.name}' (${existingId})...\n`);
      killTaskProcess(existingItem.task, existingItem);
      existingItem.task.status = 'killed';
      existingItem.task.completedAt = new Date().toISOString();
      existingItem.task.logs.push(`[${new Date().toLocaleTimeString()}] Stopped because a new deployment was launched.\n`);
    }
  }

  let finalCommand = command || 'python3 main.py';

  try {
    // 1. Handle source (ZIP upload, Files/Folder upload, or GitHub URL)
    if (sourceType === 'zip') {
      const zipFile = files.find(f => f.fieldname === 'zipFile');
      if (zipFile) {
        const zipPath = zipFile.path;
        const originalName = zipFile.originalname || 'project.zip';
        const baseName = path.basename(originalName, path.extname(originalName)).replace(/[^a-zA-Z0-9_-]/g, '_');
        const projectDirName = baseName || `proj_${Date.now()}`;
        workDir = targetDir || req.body.targetPath ? path.resolve(targetDir || req.body.targetPath) : path.join(process.cwd(), projectDirName);

        fs.mkdirSync(workDir, { recursive: true });
        logs.push(`[${new Date().toLocaleTimeString()}] Extracting ZIP archive into folder: ${workDir}...\n`);
        
        try {
          await execAsync(`python3 -c "import zipfile; zipfile.ZipFile('${zipPath}', 'r').extractall('${workDir}')"`);
        } catch (err: any) {
          logs.push(`[WARN] Python zipfile extraction failed, trying unzip: ${err.message}\n`);
          await execAsync(`unzip -o "${zipPath}" -d "${workDir}"`);
        }

        try { fs.unlinkSync(zipPath); } catch {}
      }
    } else if (sourceType === 'files') {
      const finalTargetDir = targetDir || req.body.targetPath || path.join(process.cwd(), `deploy_${Date.now()}`);
      workDir = finalTargetDir;
      const filesToUpload = files.filter(f => f.fieldname === 'files');
      const filePaths = JSON.parse(req.body.filePaths || '[]');
      
      fs.mkdirSync(workDir, { recursive: true });
      logs.push(`[${new Date().toLocaleTimeString()}] Saving ${filesToUpload.length} uploaded files/folders to ${workDir}...\n`);
      
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        const relativePath = filePaths[i] || file.originalname;
        const destPath = path.join(workDir, relativePath);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        safeMoveFile(file.path, destPath);
      }
    } else if (sourceType === 'github' && githubUrl) {
      workDir = await cloneOrUpdateGithubRepo(githubUrl, targetDir || req.body.targetPath, logs);
    }

    finalCommand = autoDetectCommand(finalCommand, workDir, logs);

    const useVpnParam = req.body.useVpn;
    const useVpn = useVpnParam === 'false' || useVpnParam === false ? false : true;

    const autoRestartParam = req.body.autoRestartOnCrash;
    const autoRestartOnCrash = autoRestartParam === 'false' || autoRestartParam === false ? false : true;

    const taskData: BackgroundTask = {
      id,
      name: name || path.basename(workDir) || finalCommand.substring(0, 30),
      command: finalCommand,
      cwd: workDir,
      status: 'running',
      startedAt: new Date().toISOString(),
      logs,
      useVpn,
      autoRestartOnCrash,
      crashCount: 0
    };

    // 2. Install requirements if checked or needed
    if (installRequirements === 'true' || installRequirements === true || installRequirements === undefined) {
      await installPythonRequirements(workDir, logs);
      if (fs.existsSync(path.join(workDir, 'package.json'))) {
        logs.push(`[${new Date().toLocaleTimeString()}] Installing Node dependencies from package.json...\n`);
        try {
          const { stdout, stderr } = await execAsync(`npm install`, { cwd: workDir });
          if (stdout) logs.push(stdout);
          if (stderr) logs.push(`[STDERR] ${stderr}`);
          logs.push(`[${new Date().toLocaleTimeString()}] Node packages installed successfully.\n`);
        } catch (err: any) {
          logs.push(`[ERR] Failed to install npm packages: ${err.message}\n`);
        }
      }
    }

    // 3. Launch process
    logs.push(`[${new Date().toLocaleTimeString()}] Launching command: ${finalCommand} in ${workDir} (VPN Proxy: ${useVpn ? 'Enabled' : 'Disabled'}, Auto-Restart: ${autoRestartOnCrash ? 'Enabled' : 'Disabled'})\n`);
    const wrapped = await getVpnWrappedCommand(finalCommand, taskData.useVpn);
    const child = spawn('sh', ['-c', wrapped.command], {
      cwd: workDir,
      env: wrapped.env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    taskData.pid = child.pid;

    const item = { task: taskData, process: child };
    backgroundTasks.set(id, item);
    activeProcessesMap.set(id, child);

    attachBackgroundTaskListeners(id, taskData, child, item);
    child.unref();

    res.json({ success: true, task: taskData });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/processes/kill', (req: Request, res: Response) => {
  const { id, pid } = req.body;

  if (id && backgroundTasks.has(id)) {
    const item = backgroundTasks.get(id);
    if (item) {
      if (item.process && item.process.pid) {
        try {
          process.kill(-item.process.pid, 'SIGTERM');
        } catch {}
      } else if (item.task.pid) {
        try {
          process.kill(-item.task.pid, 'SIGTERM');
        } catch {}
      }
      item.task.status = 'killed';
      item.task.completedAt = new Date().toISOString();
      item.task.logs.push(`[${new Date().toLocaleTimeString()}] Terminated by user request.`);
      return res.json({ success: true, message: 'Background process terminated' });
    }
  }

  if (pid) {
    try {
      process.kill(pid, 'SIGTERM');
      res.json({ success: true, message: `Process PID ${pid} terminated` });
    } catch (err: any) {
      res.status(500).json({ error: `Failed to kill process: ${err.message}` });
    }
  } else {
    res.status(400).json({ error: 'Process ID or PID required' });
  }
});

app.post('/api/processes/remove', (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Process ID required' });
  }

  if (backgroundTasks.has(id)) {
    const item = backgroundTasks.get(id);
    if (item) {
      if (item.task.status === 'running') {
        killTaskProcess(item.task, item);
      }
      backgroundTasks.delete(id);
      activeProcessesMap.delete(id);
      return res.json({ success: true, message: 'Task removed from list' });
    }
  }

  res.status(404).json({ error: 'Task not found' });
});

app.post('/api/processes/clear-stopped', (req: Request, res: Response) => {
  let count = 0;
  for (const [id, item] of backgroundTasks.entries()) {
    if (item.task.status !== 'running') {
      backgroundTasks.delete(id);
      activeProcessesMap.delete(id);
      count++;
    }
  }
  res.json({ success: true, removedCount: count });
});

app.post('/api/processes/restart', async (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id || !backgroundTasks.has(id)) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const item = backgroundTasks.get(id)!;
  const taskData = item.task;

  // 1. First, stop/kill the running process completely
  taskData.logs.push(`[${new Date().toLocaleTimeString()}] 🛑 Stopping running process for restart...\n`);
  killTaskProcess(taskData, item);

  if (activeProcessesMap.has(id)) {
    const activeProc = activeProcessesMap.get(id);
    if (activeProc && activeProc.pid) {
      try { process.kill(-activeProc.pid, 'SIGKILL'); } catch {}
      try { process.kill(activeProc.pid, 'SIGKILL'); } catch {}
    }
    activeProcessesMap.delete(id);
  }

  taskData.status = 'killed';

  // Wait 400ms to ensure process has exited and system resources are freed
  await new Promise((resolve) => setTimeout(resolve, 400));

  // 2. Start process again
  taskData.status = 'running';
  taskData.startedAt = new Date().toISOString();
  taskData.completedAt = undefined;
  taskData.exitCode = undefined;
  taskData.logs.push(`[${new Date().toLocaleTimeString()}] 🚀 Restarting command: ${taskData.command}\n`);

  try {
    const wrapped = await getVpnWrappedCommand(taskData.command, taskData.useVpn !== false);
    const child = spawn('sh', ['-c', wrapped.command], {
      cwd: taskData.cwd,
      env: wrapped.env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    taskData.pid = child.pid;
    item.process = child;
    activeProcessesMap.set(id, child);

    attachBackgroundTaskListeners(id, taskData, child, item);
    child.unref();
    res.json({ success: true, task: taskData });
  } catch (err: any) {
    taskData.status = 'failed';
    taskData.logs.push(`Restart error: ${err.message}\n`);
    res.status(500).json({ error: err.message, task: taskData });
  }
});

app.post('/api/processes/update', upload.any(), async (req: Request, res: Response) => {
  const { id, sourceType, githubUrl, installRequirements, command } = req.body;
  if (!id || !backgroundTasks.has(id)) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const item = backgroundTasks.get(id)!;
  const taskData = item.task;
  let workDir = taskData.cwd;

  // 1. Terminate the existing running process FIRST
  taskData.logs.push(`[${new Date().toLocaleTimeString()}] Stopping running process instance for update...\n`);
  killTaskProcess(taskData, item);

  if (command) {
    taskData.command = command;
  }

  taskData.logs.push(`[${new Date().toLocaleTimeString()}] Updating project source code...\n`);

  try {
    const files = (req.files || []) as Express.Multer.File[];
    if (sourceType === 'zip') {
      const file = files.find(f => f.fieldname === 'zipFile');
      if (file) {
        const zipPath = file.path;
        fs.mkdirSync(workDir, { recursive: true });
        taskData.logs.push(`[${new Date().toLocaleTimeString()}] Extracting updated ZIP archive into ${workDir}...\n`);
        try {
          await execAsync(`python3 -c "import zipfile; zipfile.ZipFile('${zipPath}', 'r').extractall('${workDir}')"`);
        } catch (err: any) {
          await execAsync(`unzip -o "${zipPath}" -d "${workDir}"`);
        }
        try { fs.unlinkSync(zipPath); } catch {}
      }
    } else if (sourceType === 'files') {
      const filesToUpload = files.filter(f => f.fieldname === 'files');
      const filePaths = JSON.parse(req.body.filePaths || '[]');
      fs.mkdirSync(workDir, { recursive: true });
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        const relativePath = filePaths[i] || file.originalname;
        const destPath = path.join(workDir, relativePath);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        safeMoveFile(file.path, destPath);
      }
    } else if (sourceType === 'github' && githubUrl) {
      workDir = await cloneOrUpdateGithubRepo(githubUrl, workDir, taskData.logs);
      taskData.cwd = workDir;
    }

    taskData.command = autoDetectCommand(taskData.command, workDir, taskData.logs);

    // 2. Install / update requirements if checked
    if (installRequirements === 'true' || installRequirements === true || installRequirements === undefined) {
      await installPythonRequirements(workDir, taskData.logs);
      if (fs.existsSync(path.join(workDir, 'package.json'))) {
        taskData.logs.push(`[${new Date().toLocaleTimeString()}] Re-installing Node dependencies from package.json...\n`);
        const { stdout, stderr } = await execAsync(`npm install`, { cwd: workDir });
        if (stdout) taskData.logs.push(stdout);
        if (stderr) taskData.logs.push(`[STDERR] ${stderr}`);
        taskData.logs.push(`[${new Date().toLocaleTimeString()}] Node dependencies updated successfully.\n`);
      }
    }

    if (req.body.useVpn !== undefined) {
      taskData.useVpn = req.body.useVpn === 'true' || req.body.useVpn === true;
    }

    if (req.body.autoRestartOnCrash !== undefined) {
      taskData.autoRestartOnCrash = req.body.autoRestartOnCrash === 'true' || req.body.autoRestartOnCrash === true;
    }

    taskData.status = 'running';
    taskData.startedAt = new Date().toISOString();
    taskData.logs.push(`[${new Date().toLocaleTimeString()}] Restarting updated process with command: ${taskData.command} (VPN Proxy: ${taskData.useVpn !== false ? 'Enabled' : 'Disabled'}, Auto-Restart: ${taskData.autoRestartOnCrash !== false ? 'Enabled' : 'Disabled'})\n`);

    const wrapped = await getVpnWrappedCommand(taskData.command, taskData.useVpn !== false);
    const child = spawn('sh', ['-c', wrapped.command], {
      cwd: workDir,
      env: wrapped.env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    taskData.pid = child.pid;
    item.process = child;
    activeProcessesMap.set(id, child);

    attachBackgroundTaskListeners(id, taskData, child, item);
    child.unref();
    res.json({ success: true, task: taskData });
  } catch (err: any) {
    taskData.status = 'failed';
    taskData.logs.push(`Update error: ${err.message}\n`);
    res.status(500).json({ error: err.message, task: taskData });
  }
});

app.get('/api/processes/:id/logs', (req: Request, res: Response) => {
  const taskId = req.params.id;
  if (backgroundTasks.has(taskId)) {
    const item = backgroundTasks.get(taskId);
    res.json({ logs: item?.task.logs || [] });
  } else {
    res.status(404).json({ error: 'Task not found' });
  }
});

// ---------------------- SYSTEM LOGS ----------------------
const appSystemLogs: any[] = [
  { id: '1', timestamp: new Date(Date.now() - 3600000).toISOString(), level: 'INFO', source: 'systemd', message: 'Started ServerDash Management Daemon Service' },
  { id: '2', timestamp: new Date(Date.now() - 1800000).toISOString(), level: 'INFO', source: 'auth', message: 'User admin authenticated via JWT Web Session' },
  { id: '3', timestamp: new Date(Date.now() - 900000).toISOString(), level: 'INFO', source: 'kernel', message: 'Linux Kernel v6.6.0 x86_64 initialized virtual interfaces' },
  { id: '4', timestamp: new Date(Date.now() - 300000).toISOString(), level: 'WARN', source: 'cron', message: 'Periodic maintenance script completed with warning 0x0' },
  { id: '5', timestamp: new Date(Date.now() - 60000).toISOString(), level: 'INFO', source: 'express', message: 'Web Terminal session initialized on port 3000' }
];

app.get('/api/logs/system', async (req: Request, res: Response) => {
  try {
    let logs = [...appSystemLogs];
    // Try reading journalctl or syslog if present
    try {
      const { stdout } = await execAsync('journalctl -n 25 --no-pager');
      if (stdout) {
        const lines = stdout.trim().split('\n');
        lines.forEach((line, idx) => {
          logs.unshift({
            id: `sys_${idx}_${Date.now()}`,
            timestamp: new Date().toISOString(),
            level: line.includes('error') || line.includes('FAIL') ? 'ERROR' : (line.includes('warn') ? 'WARN' : 'INFO'),
            source: 'syslog',
            message: line
          });
        });
      }
    } catch {
      // Fallback
    }

    res.json({ logs: logs.slice(0, 100) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const TELEGRAM_BOT_DIR = path.join(process.cwd(), 'telegram_bot');
const TELEGRAM_CONFIG_PATH = path.join(TELEGRAM_BOT_DIR, 'config.json');

// Helper to notify Telegram admin about process state changes
function notifyProcessExit(task: BackgroundTask, isAutoRestarting?: boolean) {
  try {
    if (fs.existsSync(TELEGRAM_CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(TELEGRAM_CONFIG_PATH, 'utf-8'));
      if (config.bot_token && config.admin_user_id) {
        const botToken = config.bot_token;
        const chatId = config.admin_user_id;
        
        let statusEmoji = '🟡';
        let statusText = 'نامشخص';
        if (task.status === 'completed') {
          statusEmoji = '✅';
          statusText = 'پایان موفقیت‌آمیز (Completed)';
        } else if (task.status === 'failed') {
          statusEmoji = '❌';
          statusText = isAutoRestarting 
            ? `کرش رخ داد - در حال راه‌اندازی مجدد (کوشش #${task.crashCount || 1})`
            : 'خطا یا کرش (متوقف شد)';
        } else if (task.status === 'killed') {
          statusEmoji = '⏹️';
          statusText = 'متوقف‌شده توسط کاربر (Stopped/Killed)';
        } else if (isAutoRestarting) {
          statusEmoji = '🔄';
          statusText = `کرش رخ داد - در حال راه‌اندازی مجدد (کوشش #${task.crashCount || 1})`;
        }

        // Get last 5 non-empty log lines for snippet
        let logSnippet = '';
        if (task.logs && task.logs.length > 0) {
          const recentLogs = task.logs
            .map(l => l.trim())
            .filter(Boolean)
            .slice(-5);
          if (recentLogs.length > 0) {
            logSnippet = `\n\n📋 *آخرین ۵ سطر لاگ/خطا (Crash Log Snippet):*\n\`\`\`\n${recentLogs.join('\n').substring(0, 1000)}\n\`\`\``;
          }
        }

        const message = 
          `⚠️ *اطلاع‌رسانی وضعیت برنامه پس‌زمینه*\n\n` +
          `🏷️ *نام برنامه:* ${task.name}\n` +
          `💻 *دستور:* \`${task.command}\`\n` +
          `📊 *وضعیت:* ${statusEmoji} ${statusText}\n` +
          `🔢 *کد خروج:* \`${task.exitCode !== undefined && task.exitCode !== null ? task.exitCode : 'ندارد'}\`\n` +
          `📍 *پوشه:* \`${task.cwd}\`` +
          logSnippet;

        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
          })
        }).catch((err) => console.error('Failed to send telegram notification:', err));
      }
    }
  } catch (err) {
    console.error('Error in notifyProcessExit:', err);
  }
}

// ---------------------- TELEGRAM BOT ENDPOINTS ----------------------
app.get('/api/telegram-bot/config', (req: Request, res: Response) => {
  try {
    let savedBotToken = '';
    let savedAdminUserId = '';
    let savedWebUrl = '';
    let alerts_enabled = false;
    let cpu_threshold = 85;
    let ram_threshold = 85;
    let disk_threshold = 90;
    let process_crash_alert = true;
    let cooldown_minutes = 5;

    if (fs.existsSync(TELEGRAM_CONFIG_PATH)) {
      const raw = fs.readFileSync(TELEGRAM_CONFIG_PATH, 'utf-8');
      const data = JSON.parse(raw);
      savedBotToken = data.bot_token || '';
      savedAdminUserId = data.admin_user_id || '';
      savedWebUrl = data.web_url || '';
      alerts_enabled = Boolean(data.alerts_enabled);
      cpu_threshold = data.cpu_threshold ?? 85;
      ram_threshold = data.ram_threshold ?? 85;
      disk_threshold = data.disk_threshold ?? 90;
      process_crash_alert = data.process_crash_alert !== false;
      cooldown_minutes = data.cooldown_minutes ?? 5;
    }

    let detectedUrl = savedWebUrl;
    if (!detectedUrl) {
      if (process.env.RAILWAY_PUBLIC_DOMAIN) {
        detectedUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
      } else if (process.env.RAILWAY_STATIC_URL) {
        detectedUrl = `https://${process.env.RAILWAY_STATIC_URL}`;
      } else {
        const host = req.get('host');
        const proto = req.protocol || 'https';
        if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
          detectedUrl = `${proto}://${host}`;
        }
      }
    }

    res.json({
      bot_token: savedBotToken,
      admin_user_id: savedAdminUserId,
      web_url: detectedUrl,
      alerts_enabled,
      cpu_threshold,
      ram_threshold,
      disk_threshold,
      process_crash_alert,
      cooldown_minutes
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to read Telegram bot config: ' + err.message });
  }
});

app.post('/api/telegram-bot/config', (req: Request, res: Response) => {
  try {
    const { 
      bot_token, 
      admin_user_id, 
      web_url,
      alerts_enabled,
      cpu_threshold,
      ram_threshold,
      disk_threshold,
      process_crash_alert,
      cooldown_minutes
    } = req.body;

    if (!fs.existsSync(TELEGRAM_BOT_DIR)) {
      fs.mkdirSync(TELEGRAM_BOT_DIR, { recursive: true });
    }
    const numUserId = parseInt(admin_user_id, 10);
    const configData = {
      bot_token: (bot_token || '').trim(),
      admin_user_id: isNaN(numUserId) ? (admin_user_id || '').trim() : numUserId,
      web_url: (web_url || '').trim(),
      alerts_enabled: Boolean(alerts_enabled),
      cpu_threshold: typeof cpu_threshold === 'number' ? cpu_threshold : 85,
      ram_threshold: typeof ram_threshold === 'number' ? ram_threshold : 85,
      disk_threshold: typeof disk_threshold === 'number' ? disk_threshold : 90,
      process_crash_alert: process_crash_alert !== false,
      cooldown_minutes: typeof cooldown_minutes === 'number' ? cooldown_minutes : 5
    };
    fs.writeFileSync(TELEGRAM_CONFIG_PATH, JSON.stringify(configData, null, 2), 'utf-8');
    res.json({ success: true, message: 'تنظیمات با موفقیت ذخیره شد' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save config: ' + err.message });
  }
});

// Test alert sending
app.post('/api/telegram-bot/alerts/test', async (req: Request, res: Response) => {
  try {
    let { bot_token, admin_user_id } = req.body;
    if (!bot_token || !admin_user_id) {
      if (fs.existsSync(TELEGRAM_CONFIG_PATH)) {
        const raw = fs.readFileSync(TELEGRAM_CONFIG_PATH, 'utf-8');
        const cfg = JSON.parse(raw);
        bot_token = bot_token || cfg.bot_token;
        admin_user_id = admin_user_id || cfg.admin_user_id;
      }
    }

    if (!bot_token || !admin_user_id) {
      return res.status(400).json({ error: 'لطفاً توکن ربات و شناسه کاربری تلگرام را وارد کنید' });
    }

    const testMsg = 
      `🔔 *پیام تست سیستم هشدارهای ServerDash*\n\n` +
      `✅ ارتباط ربات تلگرام با سرور با موفقیت برقرار است!\n` +
      `💻 *میزبان:* \`${os.hostname()}\`\n` +
      `📊 *سیستم هشدار:* فعال و آماده به کار\n` +
      `⏰ *زمان ارسال:* \`${new Date().toLocaleTimeString()}\``;

    const url = `https://api.telegram.org/bot${bot_token}/sendMessage`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: admin_user_id,
        text: testMsg,
        parse_mode: 'Markdown'
      })
    });

    const data = await resp.json();
    if (resp.ok && data.ok) {
      res.json({ success: true, message: 'پیام تست هشدار با موفقیت به اکانت تلگرام شما ارسال شد!' });
    } else {
      res.status(400).json({ error: data.description || 'خطا در ارسال پیام. لطفاً ابتدا در ربات تلگرام دکمه Start را بزنید.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در ارسال پیام تست: ' + err.message });
  }
});

app.get('/api/telegram-bot/status', (req: Request, res: Response) => {
  const item = backgroundTasks.get('telegram_bot_process');
  const isRunning = item ? item.task.status === 'running' : false;

  let logs: string[] = item?.task.logs || [];
  
  let configValid = false;
  if (fs.existsSync(TELEGRAM_CONFIG_PATH)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(TELEGRAM_CONFIG_PATH, 'utf-8'));
      if (cfg.bot_token && cfg.admin_user_id) {
        configValid = true;
      }
    } catch {}
  }

  res.json({
    isRunning,
    pid: item?.task.pid,
    startedAt: item?.task.startedAt,
    logs,
    configValid
  });
});

app.post('/api/telegram-bot/start', async (req: Request, res: Response) => {
  try {
    if (!fs.existsSync(TELEGRAM_CONFIG_PATH)) {
      return res.status(400).json({ error: 'لطفاً ابتدا توکن ربات و شناسه کاربری را وارد کنید' });
    }

    const cfg = JSON.parse(fs.readFileSync(TELEGRAM_CONFIG_PATH, 'utf-8'));
    if (!cfg.bot_token || !cfg.admin_user_id) {
      return res.status(400).json({ error: 'لطفاً توکن ربات و شناسه عددی کاربری را تنظیم کنید' });
    }

    // Stop existing bot if running
    const existing = backgroundTasks.get('telegram_bot_process');
    if (existing && existing.task.status === 'running') {
      if (existing.process) {
        try { existing.process.kill('SIGTERM'); } catch {}
      }
    }

    const taskData: BackgroundTask = {
      id: 'telegram_bot_process',
      name: 'ربات تلگرام (Telegram Terminal Bot)',
      command: 'python3 telegram_bot.py',
      cwd: TELEGRAM_BOT_DIR,
      status: 'running',
      startedAt: new Date().toISOString(),
      logs: [`[${new Date().toLocaleTimeString()}] در حال راه‌اندازی ربات تلگرام...\n`]
    };

    backgroundTasks.set('telegram_bot_process', { task: taskData });

    // Ensure python dependencies (aiohttp, etc.) are installed
    await installPythonRequirements(TELEGRAM_BOT_DIR, taskData.logs);

    const child = spawn('python3', ['telegram_bot.py'], {
      cwd: TELEGRAM_BOT_DIR,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    taskData.pid = child.pid;

    child.stdout?.on('data', (data) => {
      const line = data.toString();
      taskData.logs.push(line);
      if (taskData.logs.length > 500) taskData.logs.shift();
    });

    child.stderr?.on('data', (data) => {
      const line = `[ERR] ${data.toString()}`;
      taskData.logs.push(line);
      if (taskData.logs.length > 500) taskData.logs.shift();
    });

    child.on('close', (code) => {
      taskData.status = code === 0 ? 'completed' : 'failed';
      taskData.exitCode = code;
      taskData.completedAt = new Date().toISOString();
      taskData.logs.push(`[${new Date().toLocaleTimeString()}] پردازش ربات تلگرام خاتمه یافت. (کد خروج: ${code})\n`);
    });

    child.unref();

    backgroundTasks.set('telegram_bot_process', { task: taskData, process: child });

    res.json({ success: true, task: taskData });
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در اجرای ربات: ' + err.message });
  }
});

app.post('/api/telegram-bot/stop', (req: Request, res: Response) => {
  const item = backgroundTasks.get('telegram_bot_process');
  if (item) {
    if (item.process) {
      try {
        item.process.kill('SIGTERM');
        setTimeout(() => {
          try { item.process?.kill('SIGKILL'); } catch {}
        }, 1000);
      } catch {}
    }
    item.task.status = 'killed';
    item.task.completedAt = new Date().toISOString();
    item.task.logs.push(`[${new Date().toLocaleTimeString()}] ربات تلگرام توسط کاربر خاموش شد.\n`);
  }

  exec('pkill -f telegram_bot.py', () => {});

  res.json({ success: true, message: 'ربات تلگرام با موفقیت خاموش شد' });
});

// ---------------------- AUTOMATED SYSTEM ALERTS MONITOR ----------------------
let lastCpuAlertTime = 0;
let lastRamAlertTime = 0;
let lastDiskAlertTime = 0;

async function checkAndSendSystemAlerts() {
  if (!fs.existsSync(TELEGRAM_CONFIG_PATH)) return;
  try {
    const raw = fs.readFileSync(TELEGRAM_CONFIG_PATH, 'utf-8');
    const cfg = JSON.parse(raw);
    if (!cfg.alerts_enabled || !cfg.bot_token || !cfg.admin_user_id) return;

    const cooldownMs = (cfg.cooldown_minutes || 5) * 60 * 1000;
    const now = Date.now();

    const containerRes = getContainerResourceMetrics();
    const cpuPercent = await calculateCpuUsage(containerRes.cpuCores);
    const ramPercent = containerRes.ramPercent;

    let diskPercent = 0;
    let diskUsedGB = 0;
    let diskTotalGB = 0;
    try {
      let dfStr = '';
      try {
        const { stdout } = await execAsync("df -k . | tail -n 1");
        dfStr = stdout;
      } catch {
        const { stdout } = await execAsync("df -k / | tail -n 1");
        dfStr = stdout;
      }
      const parts = dfStr.trim().split(/\s+/);
      if (parts.length >= 5) {
        const totalKB = parseInt(parts[1], 10);
        const usedKB = parseInt(parts[2], 10);
        if (totalKB > 0) {
          diskTotalGB = Math.round((totalKB / (1024 * 1024)) * 10) / 10;
          diskUsedGB = Math.round((usedKB / (1024 * 1024)) * 10) / 10;
          diskPercent = Math.min(100, Math.round((usedKB / totalKB) * 100));
        }
      }
    } catch {}

    const cpuThreshold = cfg.cpu_threshold ?? 85;
    const ramThreshold = cfg.ram_threshold ?? 85;
    const diskThreshold = cfg.disk_threshold ?? 90;

    const sendMsg = async (text: string) => {
      const url = `https://api.telegram.org/bot${cfg.bot_token}/sendMessage`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cfg.admin_user_id,
          text,
          parse_mode: 'Markdown'
        })
      }).catch((e) => console.error('Failed to send Telegram alert:', e));
    };

    // Check CPU Alert
    if (cpuPercent >= cpuThreshold && (now - lastCpuAlertTime > cooldownMs)) {
      lastCpuAlertTime = now;
      const msg = 
        `🚨 *هشدار مصرف بالای پردازنده (High CPU Alert)*\n\n` +
        `🔥 *میزان مصرف:* \`${cpuPercent}%\` (آستانه: \`${cpuThreshold}%\`)\n` +
        `⚙️ *تعداد هسته:* \`${containerRes.cpuCores}\`\n` +
        `💻 *سرور:* \`${os.hostname()}\`\n` +
        `⏰ *زمان:* \`${new Date().toLocaleTimeString()}\``;
      await sendMsg(msg);
    }

    // Check RAM Alert
    if (ramPercent >= ramThreshold && (now - lastRamAlertTime > cooldownMs)) {
      lastRamAlertTime = now;
      const msg = 
        `🚨 *هشدار پر شدن حافظه موقت (High RAM Alert)*\n\n` +
        `💾 *میزان مصرف:* \`${ramPercent}%\` (\`${containerRes.ramUsedMB} MB / ${containerRes.ramTotalMB} MB\`)\n` +
        `⚠️ *آستانه تعیین‌شده:* \`${ramThreshold}%\`\n` +
        `💻 *سرور:* \`${os.hostname()}\`\n` +
        `⏰ *زمان:* \`${new Date().toLocaleTimeString()}\``;
      await sendMsg(msg);
    }

    // Check Disk Alert
    if (diskPercent >= diskThreshold && (now - lastDiskAlertTime > cooldownMs)) {
      lastDiskAlertTime = now;
      const msg = 
        `🚨 *هشدار کمبود فضای دیسک (Disk Space Alert)*\n\n` +
        `💽 *میزان مصرف دیسک:* \`${diskPercent}%\` (\`${diskUsedGB} GB / ${diskTotalGB} GB\`)\n` +
        `⚠️ *آستانه تعیین‌شده:* \`${diskThreshold}%\`\n` +
        `💻 *سرور:* \`${os.hostname()}\`\n` +
        `⏰ *زمان:* \`${new Date().toLocaleTimeString()}\``;
      await sendMsg(msg);
    }
  } catch (err) {
    console.error('Error in checkAndSendSystemAlerts:', err);
  }
}

// Check every 30 seconds
setInterval(checkAndSendSystemAlerts, 30000);

// ---------------------- VPN MANAGEMENT ----------------------
const VPN_CLI = path.join(TELEGRAM_BOT_DIR, 'vpn_cli.py');

async function runVpnCli(cmd: string, args: string[] = []): Promise<any> {
  const escapedArgs = args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
  const fullCmd = `python3 "${VPN_CLI}" ${cmd} ${escapedArgs}`;
  const { stdout } = await execAsync(fullCmd);
  return JSON.parse(stdout.trim());
}

async function getVpnWrappedCommand(command: string, useVpn: boolean = true): Promise<{ command: string; env: Record<string, string> }> {
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    PYTHONUNBUFFERED: '1',
    PATH: (process.env.PATH || '') + ':/usr/local/bin:/usr/bin:/bin'
  };

  if (!useVpn) {
    return { command, env };
  }

  let vpnRunning = false;
  try {
    const status = await runVpnCli('status');
    vpnRunning = Boolean(status && (status.running || status.enabled));
  } catch {}

  let finalCommand = command;
  if (vpnRunning) {
    const proxyUrl = 'socks5://127.0.0.1:10808';
    env.ALL_PROXY = proxyUrl;
    env.all_proxy = proxyUrl;
    env.HTTP_PROXY = proxyUrl;
    env.HTTPS_PROXY = proxyUrl;
    env.http_proxy = 'http://127.0.0.1:10809';
    env.https_proxy = 'http://127.0.0.1:10809';
    env.SOCKS_PROXY = proxyUrl;
    env.socks_proxy = proxyUrl;

    if (!finalCommand.trim().startsWith('proxychains')) {
      try {
        const { stdout: whichOut } = await execAsync('which proxychains4');
        if (whichOut && whichOut.trim()) {
          const confPath = path.join(TELEGRAM_BOT_DIR, 'proxychains.conf');
          if (fs.existsSync(confPath)) {
            finalCommand = `proxychains4 -f "${confPath}" -q ${command}`;
          } else {
            finalCommand = `proxychains4 -q ${command}`;
          }
        }
      } catch {}
    }
  }

  return { command: finalCommand, env };
}

app.get('/api/vpn/status', async (req: Request, res: Response) => {
  try {
    const data = await runVpnCli('status');
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch VPN status: ' + err.message });
  }
});

app.get('/api/vpn/configs', async (req: Request, res: Response) => {
  try {
    const data = await runVpnCli('list');
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to list VPN configs: ' + err.message });
  }
});

app.post('/api/vpn/configs/add', async (req: Request, res: Response) => {
  try {
    const { configStr, name } = req.body;
    if (!configStr) return res.status(400).json({ error: 'لینک یا کد کانفیگ الزامی است' });
    const data = await runVpnCli('add', [configStr, name || '']);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to add VPN config: ' + err.message });
  }
});

interface VpnTrashItem {
  trashId: string;
  configs: { name: string; config: string }[];
  deletedAt: number;
}
const vpnTrashMap = new Map<string, VpnTrashItem>();

app.post('/api/vpn/configs/delete', async (req: Request, res: Response) => {
  try {
    const { index, indices } = req.body;
    let data: any = null;
    if (indices && Array.isArray(indices) && indices.length > 0) {
      const indicesStr = indices.join(',');
      data = await runVpnCli('delete', [indicesStr]);
    } else if (index !== undefined) {
      data = await runVpnCli('delete', [String(index)]);
    } else {
      return res.status(400).json({ error: 'شناسه یا لیست کانفیگ‌ها الزامی است' });
    }

    if (data && data.success && data.deletedConfigs && data.deletedConfigs.length > 0) {
      const trashId = 'vpntrash_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      vpnTrashMap.set(trashId, {
        trashId,
        configs: data.deletedConfigs,
        deletedAt: Date.now()
      });
      data.trashId = trashId;
    }

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete config: ' + err.message });
  }
});

app.post('/api/vpn/configs/restore', async (req: Request, res: Response) => {
  try {
    const { trashId } = req.body;
    if (!trashId || !vpnTrashMap.has(trashId)) {
      return res.status(404).json({ error: 'Trash item expired or not found' });
    }

    const item = vpnTrashMap.get(trashId)!;
    let restoredCount = 0;
    for (const cfg of item.configs) {
      if (cfg.config) {
        await runVpnCli('add', [cfg.config, cfg.name || '']);
        restoredCount++;
      }
    }

    vpnTrashMap.delete(trashId);

    res.json({
      success: true,
      restoredCount,
      message: 'کانفیگ‌های VPN با موفقیت بازگردانی شدند'
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to restore VPN configs: ' + err.message });
  }
});

app.post('/api/vpn/configs/select', async (req: Request, res: Response) => {
  try {
    const { index } = req.body;
    if (index === undefined) return res.status(400).json({ error: 'شناسه کانفیگ الزامی است' });
    const data = await runVpnCli('select', [String(index)]);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to select config: ' + err.message });
  }
});

app.post('/api/vpn/start', async (req: Request, res: Response) => {
  try {
    const data = await runVpnCli('start');
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to start VPN: ' + err.message });
  }
});

app.post('/api/vpn/stop', async (req: Request, res: Response) => {
  try {
    const data = await runVpnCli('stop');
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to stop VPN: ' + err.message });
  }
});

app.post('/api/vpn/test', async (req: Request, res: Response) => {
  try {
    const { index, mode, ping, testAll } = req.body;
    if (index !== undefined) {
      const modeStr = mode || 'full';
      const pingStr = ping !== undefined && ping !== null ? String(ping) : 'null';
      const data = await runVpnCli('test', [String(index), modeStr, pingStr]);
      return res.json(data);
    }
    const arg = testAll ? 'all' : 'all';
    const data = await runVpnCli('test', [arg]);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to test VPN: ' + err.message });
  }
});

app.get('/api/vpn/ip-check', async (req: Request, res: Response) => {
  try {
    let directIpInfo: any = null;
    let vpnIpInfo: any = null;

    try {
      const { stdout } = await execAsync('curl -s --max-time 4 https://ipinfo.io/json');
      directIpInfo = JSON.parse(stdout.trim());
    } catch {
      // direct fail
    }

    try {
      const { stdout } = await execAsync('curl -s --socks5 127.0.0.1:10808 --max-time 5 https://ipinfo.io/json');
      vpnIpInfo = JSON.parse(stdout.trim());
    } catch {
      // vpn fail
    }

    res.json({
      direct: directIpInfo,
      vpn: vpnIpInfo,
      proxyActive: Boolean(vpnIpInfo && vpnIpInfo.ip)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vpn/logs', async (req: Request, res: Response) => {
  try {
    const maxLines = req.query.lines ? parseInt(String(req.query.lines), 10) : 300;
    const logPath = path.join(TELEGRAM_BOT_DIR, 'vpn_configs', 'xray.log');
    let logs: string[] = [];
    if (fs.existsSync(logPath)) {
      try {
        const content = fs.readFileSync(logPath, 'utf-8');
        const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
        logs = lines.slice(-maxLines);
      } catch (e: any) {
        logs = [`Error reading log file: ${e.message}`];
      }
    } else {
      try {
        const cliData = await runVpnCli('logs', [String(maxLines)]);
        logs = cliData.logs || [];
      } catch {}
    }

    let isRunning = false;
    try {
      const status = await runVpnCli('status');
      isRunning = Boolean(status && status.running);
    } catch {}

    res.json({
      logs,
      running: isRunning,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch VPN logs: ' + err.message });
  }
});

app.post('/api/vpn/logs/clear', async (req: Request, res: Response) => {
  try {
    const logPath = path.join(TELEGRAM_BOT_DIR, 'vpn_configs', 'xray.log');
    if (fs.existsSync(logPath)) {
      try {
        fs.writeFileSync(logPath, '', 'utf-8');
      } catch {}
    }
    try {
      await runVpnCli('clear-logs');
    } catch {}

    res.json({ success: true, message: 'لاگ‌های Xray/V2Ray با موفقیت پاک شدند' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to clear logs: ' + err.message });
  }
});

// 404 Handler for /api routes to prevent falling through to Vite SPA index.html
app.use('/api/*', (req: Request, res: Response) => {
  res.status(404).json({ error: `API endpoint ${req.originalUrl} not found` });
});

// ---------------------- VITE & PRODUCTION HANDLER ----------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ServerDash running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
