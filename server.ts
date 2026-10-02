import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import os from 'os';
import https from 'https';
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
      throw new Error(`Source file does not exist: ${src}`);
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

app.use(cors({
  origin: process.env.CORS_ORIGIN || true, // Allow same-origin in dev; configure in production
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 1000; // per window for heavy batch operations

function rateLimiter(req: Request, res: Response, next: NextFunction) {
  // Skip rate limiting for VPN management and internal polling endpoints
  if (req.path.startsWith('/vpn/') || req.path.startsWith('/system/')) {
    return next();
  }

  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateLimitMap.get(clientIp);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(clientIp, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({ error: 'تعداد درخواست‌ها بیش از حد مجاز است. لطفاً کمی صبر کنید.' });
  }
  next();
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap.entries()) {
    if (now > val.resetTime) rateLimitMap.delete(key);
  }
}, 300_000);

app.use('/api', rateLimiter);

// Content Security Policy headers
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

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
  isConfigured?: boolean;
  mustChangePassword?: boolean;
  railwayApiToken?: string;
}

function loadConfig(): ServerConfig {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      // If config was saved with explicit isConfigured: true and non-empty password
      if (typeof parsed.isConfigured === 'boolean') {
        return parsed;
      }
      // If legacy config had default password 'admin123', treat as unconfigured (first run)
      if (parsed.passwordHash === 'admin123' || parsed.mustChangePassword === true || !parsed.passwordHash) {
        parsed.isConfigured = false;
        return parsed;
      }
      parsed.isConfigured = true;
      return parsed;
    } catch {
      // fallback
    }
  }
  const defaultConfig: ServerConfig = {
    username: 'admin',
    passwordHash: '',
    authToken: '',
    isConfigured: false
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
  const isAuthStatus = req.originalUrl.startsWith('/api/auth/status') || req.path === '/auth/status' || req.path === '/api/auth/status';
  const isInitialSetup = req.originalUrl.startsWith('/api/auth/initial-setup') || req.path === '/auth/initial-setup' || req.path === '/api/auth/initial-setup';
  const isHealth = req.originalUrl.startsWith('/api/health') || req.path === '/health' || req.path === '/api/health';

  if (isAuthLogin || isAuthStatus || isInitialSetup || isHealth) {
    return next();
  }
  const authHeader = req.headers.authorization;
  const tokenHeader = req.headers['x-auth-token'] as string;
  const tokenQuery = req.query.token as string;

  const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : (tokenHeader || tokenQuery);

  if (token && token === serverConfig.authToken) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Invalid or missing token' });
}

app.use('/api', authMiddleware);

// Health Check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', server: 'ServerDash', timestamp: new Date().toISOString() });
});

function getConfiguredRailwayToken(): string {
  const token = (serverConfig.railwayApiToken || process.env.RAILWAY_API_TOKEN || process.env.RAILWAY_TOKEN || '').trim();
  return token.replace(/^Bearer\s+/i, '').trim();
}

// ---------------------- RAILWAY GRAPHQL API INTEGRATION ----------------------
const RAILWAY_GQL_ENDPOINT = 'https://backboard.railway.app/graphql/v2';

interface RailwayCacheState {
  data: any | null;
  error: string | null;
  timestamp: number;
  tokenUsed: string;
}

let railwayCache: RailwayCacheState = {
  data: null,
  error: null,
  timestamp: 0,
  tokenUsed: ''
};
let railwayFetchInFlight: Promise<{ data: any | null; error: string | null }> | null = null;

function railwayGqlRequest(token: string, query: string, variables: Record<string, any> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ query, variables });
    const urlObj = new URL(RAILWAY_GQL_ENDPOINT);

    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 20000
    };

    const reqHttps = https.request(options, (res) => {
      let rawBody = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        rawBody += chunk;
      });
      res.on('end', () => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${rawBody.slice(0, 200)}`));
        }
        try {
          const parsed = JSON.parse(rawBody);
          if (parsed.errors && Array.isArray(parsed.errors) && parsed.errors.length > 0) {
            const msg = parsed.errors.map((e: any) => e.message || JSON.stringify(e)).join(' | ');
            return reject(new Error(msg));
          }
          resolve(parsed.data);
        } catch (err: any) {
          reject(new Error(`Invalid JSON from Railway API: ${err.message}`));
        }
      });
    });

    reqHttps.on('timeout', () => {
      reqHttps.destroy(new Error('Railway API request timed out'));
    });

    reqHttps.on('error', (err) => {
      reject(err);
    });

    reqHttps.write(payload);
    reqHttps.end();
  });
}

function formatBytesToMBString(bytes: number | undefined | null): string {
  if (bytes == null || isNaN(Number(bytes)) || Number(bytes) <= 0) return '0MB';
  const b = Number(bytes);
  if (b % (1024 * 1024) === 0) {
    return `${Math.round(b / (1024 * 1024))}MB`;
  }
  if (b % (1000 * 1000) === 0) {
    return `${Math.round(b / (1000 * 1000))}MB`;
  }
  return `${Math.round(b / (1024 * 1024))}MB`;
}

async function fetchRailwayDataFromApi(token: string): Promise<any> {
  let infoData: any = null;
  try {
    infoData = await railwayGqlRequest(
      token,
      `query {
        me {
          id
          username
          email
          workspaces {
            id
            name
            plan
            projectCount
            subscriptionPlanLimit {
              includedUsageDollars
              projects
              containers { cpu memoryBytes diskBytes }
              volumes { defaultSizeMB maxSizeMB maxPerProject }
              project { members services }
              observability { logRetentionDays }
            }
            customer {
              id
              creditBalance
              remainingUsageCreditBalance
              currentUsage
              hasExhaustedFreePlan
              isTrialing
              trialDaysRemaining
              isUsageSubscriber
              isPrepaying
              state
              billingPeriod { start end }
              usageLimit { softLimit hardLimit isOverLimit }
            }
          }
        }
      }`
    );
  } catch {
    try {
      infoData = await railwayGqlRequest(
        token,
        `query {
          me {
            id
            username
            email
            workspaces {
              id
              name
              plan
              subscriptionPlanLimit
              customer {
                creditBalance
                remainingUsageCreditBalance
                currentUsage
                hasExhaustedFreePlan
                state
                billingPeriod { start end }
                usageLimit { softLimit hardLimit isOverLimit }
              }
            }
          }
        }`
      );
    } catch {
      infoData = await railwayGqlRequest(
        token,
        `query {
          me {
            id
            username
            email
            workspaces {
              id
              name
              plan
              customer {
                creditBalance
                remainingUsageCreditBalance
                currentUsage
                hasExhaustedFreePlan
                state
                billingPeriod { start end }
                usageLimit { softLimit hardLimit isOverLimit }
              }
            }
          }
        }`
      );
    }
  }

  if (!infoData || !infoData.me) {
    throw new Error('Unauthorized یا عدم دریافت اطلاعات حساب از Railway');
  }

  const me = infoData.me;
  const workspaces: any[] = Array.isArray(me.workspaces) ? me.workspaces : [];
  if (workspaces.length === 0) {
    throw new Error('هیچ Workspace فعالی در این حساب Railway یافت نشد');
  }

  const ws = workspaces.find((w) => w && w.customer) || workspaces[0];
  const customer = ws.customer || {};
  const billingPeriod = customer.billingPeriod || {};

  const periodStartRaw = billingPeriod.start ? String(billingPeriod.start) : '';
  const periodEndRaw = billingPeriod.end ? String(billingPeriod.end) : '';
  const periodStart = periodStartRaw ? periodStartRaw.slice(0, 10) : 'N/A';
  const periodEnd = periodEndRaw ? periodEndRaw.slice(0, 10) : 'N/A';

  let daysLeft = 0;
  if (periodEndRaw) {
    const endMs = new Date(periodEndRaw).getTime();
    if (!isNaN(endMs)) {
      daysLeft = Math.max(0, Math.floor((endMs - Date.now()) / (1000 * 60 * 60 * 24)));
    }
  }

  const spent = Number(customer.currentUsage ?? 0);
  const creditBalance = Number(customer.creditBalance ?? 0);
  const left = Number(customer.remainingUsageCreditBalance ?? 0);
  const usageLimit = customer.usageLimit;
  const hardCap =
    usageLimit === null || usageLimit === undefined || usageLimit.hardLimit === null || usageLimit.hardLimit === undefined
      ? 'none'
      : `$${usageLimit.hardLimit}`;

  // Parse subscriptionPlanLimit
  const subLimit = ws.subscriptionPlanLimit || {};
  const limitParts: string[] = [];
  const planLimitsStructured: Record<string, any> = {};

  if (subLimit && typeof subLimit === 'object') {
    if (subLimit.projects != null) {
      limitParts.push(`projects<=${subLimit.projects}`);
      planLimitsStructured.projects = subLimit.projects;
    }
    if (subLimit.containers?.cpu != null) {
      limitParts.push(`cpu=${subLimit.containers.cpu}`);
      planLimitsStructured.cpu = subLimit.containers.cpu;
    }
    if (subLimit.containers?.memoryBytes != null) {
      const ramStr = formatBytesToMBString(subLimit.containers.memoryBytes);
      limitParts.push(`ram=${ramStr}`);
      planLimitsStructured.ramMB = ramStr;
    }
    if (subLimit.containers?.diskBytes != null) {
      const diskStr = formatBytesToMBString(subLimit.containers.diskBytes);
      limitParts.push(`disk=${diskStr}`);
      planLimitsStructured.diskMB = diskStr;
    }
    const volSize = subLimit.volumes?.defaultSizeMB ?? subLimit.volumes?.maxSizeMB;
    if (volSize != null) {
      limitParts.push(`vol=${volSize}MB`);
      planLimitsStructured.volMB = `${volSize}MB`;
    }
    if (subLimit.includedUsageDollars != null) {
      planLimitsStructured.includedUsageDollars = subLimit.includedUsageDollars;
    }
  }

  const planLimitText = limitParts.length > 0 ? limitParts.join(' ') : 'default';

  // Fetch projects for this workspace
  let projectEdges: any[] = [];
  if (ws.id) {
    try {
      const projRes = await railwayGqlRequest(
        token,
        `query($w: String!) {
          projects(workspaceId: $w, first: 20) {
            edges {
              node {
                id
                name
              }
            }
          }
        }`,
        { w: ws.id }
      );
      projectEdges = projRes?.projects?.edges || [];
    } catch {
      projectEdges = [];
    }
  }

  const measurementsList = [
    'CPU_USAGE',
    'MEMORY_USAGE_GB',
    'DISK_USAGE_GB',
    'NETWORK_RX_GB',
    'NETWORK_TX_GB',
    'EPHEMERAL_DISK_USAGE_GB',
    'BACKUP_USAGE_GB'
  ];

  const projectsUsage: any[] = [];
  for (const edge of projectEdges) {
    const node = edge?.node;
    if (!node || !node.id) continue;

    let estRows: any[] = [];
    try {
      const estData = await railwayGqlRequest(
        token,
        `query($m: [MetricMeasurement!]!, $p: String!) {
          estimatedUsage(measurements: $m, projectId: $p) {
            measurement
            estimatedValue
          }
        }`,
        { m: measurementsList, p: node.id }
      );
      estRows = estData?.estimatedUsage || [];
    } catch {
      estRows = [];
    }

    const mapVal: Record<string, number> = {};
    for (const r of estRows) {
      if (r && r.measurement) {
        mapVal[r.measurement] = Number(r.estimatedValue ?? 0);
      }
    }

    projectsUsage.push({
      id: node.id,
      name: node.name || node.id,
      cpuUsage: mapVal['CPU_USAGE'] ?? 0,
      memoryUsageGb: mapVal['MEMORY_USAGE_GB'] ?? 0,
      diskUsageGb: mapVal['DISK_USAGE_GB'] ?? 0,
      networkRxGb: mapVal['NETWORK_RX_GB'] ?? 0,
      networkTxGb: mapVal['NETWORK_TX_GB'] ?? 0,
      ephemeralDiskUsageGb: mapVal['EPHEMERAL_DISK_USAGE_GB'] ?? 0,
      backupUsageGb: mapVal['BACKUP_USAGE_GB'] ?? 0
    });
  }

  const accountName = me.username || me.email || me.id || 'unknown';
  const planName = ws.plan || 'FREE';

  const lines: string[] = [
    `account    : ${accountName}  plan=${planName}`,
    `period     : ${periodStart} -> ${periodEnd}  (${daysLeft} days left)`,
    `spent      : $${spent.toFixed(4)}`,
    `LEFT       : $${left.toFixed(4)}`,
    `hard cap   : ${hardCap}`,
    `plan limit : ${planLimitText}`
  ];

  for (const p of projectsUsage) {
    lines.push(`project    : ${p.name}`);
    lines.push(
      `  CPU_USAGE ${p.cpuUsage.toFixed(3)} | MEMORY ${p.memoryUsageGb.toFixed(3)} | DISK ${p.diskUsageGb.toFixed(3)} | NET_TX ${p.networkTxGb.toFixed(3)}`
    );
  }

  return {
    account: accountName,
    email: me.email,
    workspaceId: ws.id,
    workspaceName: ws.name || '',
    plan: planName,
    periodStart,
    periodEnd,
    daysLeft,
    spent,
    creditBalance,
    left,
    hardCap,
    softLimit: usageLimit?.softLimit ?? null,
    isOverLimit: Boolean(usageLimit?.isOverLimit),
    hasExhaustedFreePlan: Boolean(customer.hasExhaustedFreePlan),
    state: customer.state || 'ACTIVE',
    planLimitText,
    planLimits: planLimitsStructured,
    projects: projectsUsage,
    formattedText: lines.join('\n'),
    fetchedAt: new Date().toISOString()
  };
}

async function getRailwayInfo(forceRefresh = false): Promise<{ data: any | null; error: string | null }> {
  const token = getConfiguredRailwayToken();
  if (!token) {
    railwayCache = { data: null, error: null, timestamp: 0, tokenUsed: '' };
    return { data: null, error: null };
  }

  const now = Date.now();
  const ttl = railwayCache.error ? 20_000 : 60_000;
  if (!forceRefresh && railwayCache.tokenUsed === token && now - railwayCache.timestamp < ttl && (railwayCache.data || railwayCache.error)) {
    return { data: railwayCache.data, error: railwayCache.error };
  }

  if (railwayFetchInFlight && !forceRefresh) {
    return railwayFetchInFlight;
  }

  railwayFetchInFlight = (async () => {
    try {
      const data = await fetchRailwayDataFromApi(token);
      railwayCache = {
        data,
        error: null,
        timestamp: Date.now(),
        tokenUsed: token
      };
      return { data, error: null };
    } catch (err: any) {
      const errMsg = err?.message || 'خطا در دریافت اطلاعات از Railway API';
      railwayCache = {
        data: railwayCache.tokenUsed === token ? railwayCache.data : null,
        error: errMsg,
        timestamp: Date.now(),
        tokenUsed: token
      };
      return { data: railwayCache.data, error: errMsg };
    } finally {
      railwayFetchInFlight = null;
    }
  })();

  return railwayFetchInFlight;
}

// Authentication Status Endpoint (Public)
app.get('/api/auth/status', (req: Request, res: Response) => {
  serverConfig = loadConfig();
  const isReady = !!serverConfig.isConfigured && !!serverConfig.passwordHash;
  res.json({
    isConfigured: isReady,
    isFirstRun: !isReady,
    username: serverConfig.username || 'admin',
    hasRailwayToken: Boolean(getConfiguredRailwayToken())
  });
});

// Initial Setup & Master Password Creation Endpoint (First-Run only)
app.post('/api/auth/initial-setup', (req: Request, res: Response) => {
  serverConfig = loadConfig();

  if (serverConfig.isConfigured && serverConfig.passwordHash) {
    return res.status(400).json({ error: 'سیستم قبلاً راه‌اندازی شده است. لطفاً با نام کاربری و رمز عبور خود وارد شوید.' });
  }

  const { username, password, railwayApiToken } = req.body;
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' });
  }

  const sanitizedUsername = (username && typeof username === 'string' && username.trim()) ? username.trim() : 'admin';

  serverConfig.username = sanitizedUsername;
  serverConfig.passwordHash = password;
  serverConfig.authToken = 'serverdash_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
  serverConfig.isConfigured = true;
  delete serverConfig.mustChangePassword;

  if (typeof railwayApiToken === 'string' && railwayApiToken.trim()) {
    serverConfig.railwayApiToken = railwayApiToken.trim().replace(/^Bearer\s+/i, '').trim();
  }

  saveConfig(serverConfig);

  if (serverConfig.railwayApiToken) {
    railwayCache = { data: null, error: null, timestamp: 0, tokenUsed: '' };
    getRailwayInfo(true).catch(() => {});
  }

  res.json({
    success: true,
    message: 'راه‌اندازی اولیه و ایجاد حساب مدیر با موفقیت انجام شد',
    token: serverConfig.authToken,
    user: {
      username: serverConfig.username,
      role: 'Administrator',
      loginTime: new Date().toISOString()
    }
  });
});

// Authentication Login Endpoint
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password, railwayApiToken } = req.body;
  serverConfig = loadConfig();

  if (!serverConfig.isConfigured || !serverConfig.passwordHash) {
    return res.status(400).json({
      success: false,
      isFirstRun: true,
      error: 'سیستم هنوز راه‌اندازی نشده است. لطفاً ابتدا رمز عبور اولیه را ایجاد نمایید.'
    });
  }

  if (username === serverConfig.username && password === serverConfig.passwordHash) {
    if (typeof railwayApiToken === 'string' && railwayApiToken.trim()) {
      serverConfig.railwayApiToken = railwayApiToken.trim().replace(/^Bearer\s+/i, '').trim();
      saveConfig(serverConfig);
      railwayCache = { data: null, error: null, timestamp: 0, tokenUsed: '' };
      getRailwayInfo(true).catch(() => {});
    }

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
    },
    hasRailwayToken: Boolean(getConfiguredRailwayToken())
  });
});

app.post('/api/auth/change-credentials', (req: Request, res: Response) => {
  const { currentPassword, newUsername, newPassword, railwayApiToken } = req.body;
  if (currentPassword !== serverConfig.passwordHash) {
    return res.status(400).json({ error: 'رمز عبور فعلی نامعتبر است' });
  }

  if (newUsername) serverConfig.username = newUsername;
  if (newPassword) {
    serverConfig.passwordHash = newPassword;
    serverConfig.mustChangePassword = false;
  }
  if (typeof railwayApiToken === 'string') {
    const cleaned = railwayApiToken.trim().replace(/^Bearer\s+/i, '').trim();
    if (cleaned) {
      serverConfig.railwayApiToken = cleaned;
    } else {
      delete serverConfig.railwayApiToken;
    }
    railwayCache = { data: null, error: null, timestamp: 0, tokenUsed: '' };
    if (cleaned) {
      getRailwayInfo(true).catch(() => {});
    }
  }

  // Refresh token
  serverConfig.authToken = 'serverdash_' + Math.random().toString(36).substring(2, 12);
  saveConfig(serverConfig);

  res.json({ success: true, message: 'اطلاعات با موفقیت تغییر کرد', newToken: serverConfig.authToken });
});

// Railway Info & Token Management Endpoints
app.get('/api/railway/info', async (req: Request, res: Response) => {
  const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
  const token = getConfiguredRailwayToken();
  if (!token) {
    return res.json({
      configured: false,
      info: null,
      error: null
    });
  }

  const { data, error } = await getRailwayInfo(forceRefresh);
  res.json({
    configured: true,
    tokenMasked: token.length > 8 ? `${token.slice(0, 4)}...${token.slice(-4)}` : '****',
    info: data,
    error
  });
});

app.post('/api/railway/token', async (req: Request, res: Response) => {
  const { railwayApiToken } = req.body;
  serverConfig = loadConfig();

  const cleaned = typeof railwayApiToken === 'string' ? railwayApiToken.trim().replace(/^Bearer\s+/i, '').trim() : '';
  if (!cleaned) {
    delete serverConfig.railwayApiToken;
    saveConfig(serverConfig);
    railwayCache = { data: null, error: null, timestamp: 0, tokenUsed: '' };
    return res.json({
      success: true,
      configured: false,
      info: null,
      error: null
    });
  }

  serverConfig.railwayApiToken = cleaned;
  saveConfig(serverConfig);
  railwayCache = { data: null, error: null, timestamp: 0, tokenUsed: '' };

  const { data, error } = await getRailwayInfo(true);
  res.json({
    success: !error,
    configured: true,
    info: data,
    error
  });
});

// ---------------------- SYSTEM METRICS ----------------------
const METRICS_HISTORY_FILE = path.join(process.cwd(), '.serverdash_metrics.json');

function loadMetricsHistory(): any[] {
  try {
    if (fs.existsSync(METRICS_HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(METRICS_HISTORY_FILE, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveMetricsHistory(history: any[]) {
  try {
    fs.writeFileSync(METRICS_HISTORY_FILE, JSON.stringify(history));
  } catch {}
}

const metricsHistory: any[] = loadMetricsHistory();
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

    // Network traffic calculation - read real data from /proc/net/dev on Linux
    let currentRx = 0;
    let currentTx = 0;
    try {
      if (fs.existsSync('/proc/net/dev')) {
        const netDev = fs.readFileSync('/proc/net/dev', 'utf8');
        const lines = netDev.split('\n').slice(2); // Skip header lines
        for (const line of lines) {
          const parts = line.trim().split(/[\s:]+/);
          if (parts.length >= 10) {
            currentRx += parseInt(parts[1], 10) || 0;
            currentTx += parseInt(parts[9], 10) || 0;
          }
        }
      } else {
        // Fallback for non-Linux: use os.networkInterfaces() to at least get interface names
        const networkInterfaces = os.networkInterfaces();
        Object.keys(networkInterfaces).forEach(() => {
          currentRx += 0;
          currentTx += 0;
        });
      }
    } catch {
      // If reading fails, use 0
    }

    const now = Date.now();
    const timeDiffSec = (now - prevNetTime) / 1000 || 1;
    const netRxKbps = Math.round((Math.abs(currentRx - prevNetRx) / timeDiffSec) * 10) / 10;
    const netTxKbps = Math.round((Math.abs(currentTx - prevNetTx) / timeDiffSec) * 10) / 10;
    prevNetRx = currentRx;
    prevNetTx = currentTx;
    prevNetTime = now;

    const hasRailway = Boolean(getConfiguredRailwayToken());
    let railwayInfo: any = null;
    let railwayError: string | null = null;

    if (hasRailway) {
      const forceRailway = req.query.refreshRailway === '1';
      if (!forceRailway && railwayCache.data && Date.now() - railwayCache.timestamp < 60_000) {
        railwayInfo = railwayCache.data;
        railwayError = railwayCache.error;
      } else {
        try {
          const rwRes = await Promise.race([
            getRailwayInfo(forceRailway),
            new Promise<{ data: any; error: string | null }>((resolve) =>
              setTimeout(() => resolve({ data: railwayCache.data, error: railwayCache.error }), 3500)
            )
          ]);
          railwayInfo = rwRes.data;
          railwayError = rwRes.error;
        } catch (e: any) {
          railwayError = e?.message || null;
        }
      }
    }

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
      containerInfo: containerRes.isContainer ? `منابع کانتینر (سهمیه: ${containerRes.cpuCores} هسته پردازنده، ${Math.round(containerRes.ramTotalMB / 1024 * 10) / 10} گیگابایت رم)` : undefined,
      railwayConfigured: hasRailway,
      railwayInfo,
      railwayError
    };

    metricsHistory.push(snapshot);
    if (metricsHistory.length > 30) metricsHistory.shift();
    saveMetricsHistory(metricsHistory);

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
const customTerminalEnv: Record<string, string> = {};
const IGNORED_ENV_KEYS = new Set([
  '_', 'PWD', 'OLDPWD', 'SHLVL',
  'ALL_PROXY', 'all_proxy', 'HTTP_PROXY', 'http_proxy',
  'HTTPS_PROXY', 'https_proxy', 'SOCKS_PROXY', 'socks_proxy',
  'SOCKS5_PROXY', 'socks5_proxy'
]);

function buildTrackedBashCommand(rawCommand: string, processId: string): {
  script: string;
  cwdFile: string;
  envFile: string;
} {
  const normalized = String(rawCommand).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const cwdFile = path.join(os.tmpdir(), `.sd_cwd_${processId}`);
  const envFile = path.join(os.tmpdir(), `.sd_env_${processId}`);
  const script = `trap '__sd_ec=$?; pwd > "${cwdFile}" 2>/dev/null; env -0 > "${envFile}" 2>/dev/null; exit $__sd_ec' EXIT\n${normalized}`;
  return { script, cwdFile, envFile };
}

function harvestTrackedBashState(cwdFile: string, envFile: string): string | null {
  let newCwd: string | null = null;
  try {
    if (fs.existsSync(cwdFile)) {
      const candidate = fs.readFileSync(cwdFile, 'utf-8').trim();
      fs.unlinkSync(cwdFile);
      if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        newCwd = candidate;
        activeTerminalCwd = candidate;
        saveTerminalCwd(activeTerminalCwd);
      }
    }
  } catch {}
  try {
    if (fs.existsSync(envFile)) {
      const rawEnv = fs.readFileSync(envFile, 'utf-8');
      fs.unlinkSync(envFile);
      const entries = rawEnv.split('\0');
      for (const entry of entries) {
        const eqIdx = entry.indexOf('=');
        if (eqIdx > 0) {
          const key = entry.slice(0, eqIdx);
          const val = entry.slice(eqIdx + 1);
          if (!IGNORED_ENV_KEYS.has(key) && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
            customTerminalEnv[key] = val;
          }
        }
      }
    }
  } catch {}
  return newCwd;
}

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
  const normalizedCommand = String(command).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const trimmed = normalizedCommand.trim();
  const isSingleSimpleCd = !/[\n;&|]/.test(trimmed) && (trimmed.startsWith('cd ') || trimmed === 'cd');

  // Special handling for single-line cd command
  if (isSingleSimpleCd) {
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
      res.write(`data: ${JSON.stringify({ type: 'exit', exitCode: 0, cwd: activeTerminalCwd })}\n\n`);
      return res.end();
    } else {
      res.write(`data: ${JSON.stringify({ type: 'init', cwd: execCwd })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'output', text: `cd: no such file or directory: ${targetDir}\n` })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'exit', exitCode: 1, cwd: execCwd })}\n\n`);
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
    name: `Terminal: ${trimmed.replace(/\s+/g, ' ').substring(0, 35)}`,
    command: trimmed,
    cwd: execCwd,
    status: 'running',
    startedAt: new Date().toISOString(),
    logs: [`[${new Date().toLocaleTimeString()}] Launched from Terminal in ${execCwd}:\n${trimmed}\n`]
  };

  try {
    const wrapped = await getVpnWrappedCommand(normalizedCommand);
    const tracked = buildTrackedBashCommand(wrapped.command, processId);
    const child = spawn('bash', ['-c', tracked.script], {
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
      const updatedCwd = harvestTrackedBashState(tracked.cwdFile, tracked.envFile);
      if (updatedCwd) {
        taskData.cwd = updatedCwd;
      }
      taskData.status = code === 0 ? 'completed' : 'failed';
      taskData.exitCode = code;
      taskData.completedAt = new Date().toISOString();
      taskData.logs.push(`\n[Process exited with code ${code ?? 0}]\n`);

      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'exit', exitCode: code ?? 0, cwd: updatedCwd || execCwd })}\n\n`);
        res.end();
      }
    });

    child.on('error', (err: Error) => {
      activeProcessesMap.delete(processId);
      harvestTrackedBashState(tracked.cwdFile, tracked.envFile);
      taskData.status = 'failed';
      taskData.exitCode = 1;
      taskData.completedAt = new Date().toISOString();
      taskData.logs.push(`\n[Execution error: ${err.message}]\n`);

      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'output', text: `Error: ${err.message}\n` })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'exit', exitCode: 1, cwd: execCwd })}\n\n`);
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
  const normalizedCommand = String(command).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const trimmed = normalizedCommand.trim();
  const isSingleSimpleCd = !/[\n;&|]/.test(trimmed) && (trimmed.startsWith('cd ') || trimmed === 'cd');

  if (isSingleSimpleCd) {
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
    name: `Terminal: ${trimmed.replace(/\s+/g, ' ').substring(0, 35)}`,
    command: trimmed,
    cwd: execCwd,
    status: 'running',
    startedAt: new Date().toISOString(),
    logs: [`[${new Date().toLocaleTimeString()}] Executed:\n${trimmed}\n`]
  };

  try {
    const wrapped = await getVpnWrappedCommand(normalizedCommand);
    const tracked = buildTrackedBashCommand(wrapped.command, processId);
    const child = spawn('bash', ['-c', tracked.script], {
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
      const updatedCwd = harvestTrackedBashState(tracked.cwdFile, tracked.envFile);
      if (updatedCwd) {
        taskData.cwd = updatedCwd;
      }
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
          cwd: updatedCwd || execCwd,
          exitCode: code ?? 1,
          processId,
          status: taskData.status,
          isRunning: false
        });
      }
    });

    child.on('error', (err: any) => {
      activeProcessesMap.delete(processId);
      harvestTrackedBashState(tracked.cwdFile, tracked.envFile);
      taskData.status = 'failed';
      taskData.completedAt = new Date().toISOString();
      taskData.logs.push(`Launch error: ${err.message}\n`);
      notifyProcessExit(taskData);

      if (!hasResponded && !res.headersSent) {
        hasResponded = true;
        res.status(500).json({ output: `Execution error: ${err.message}`, cwd: execCwd, exitCode: 1, processId, isRunning: false });
      }
    });

    // If process takes longer than 5s, respond so caller (Telegram bot) can poll logs without blocking!
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
    }, 5000);
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

    const showSystem = req.query.showSystem === 'true' || req.query.showHidden === 'true';

    let filteredFiles = files;
    if (!showSystem) {
      if (isRootAppDir) {
        const appSystemFiles = new Set([
          // Git and source control
          '.git', '.gitignore',
          // Env and keys
          '.env', '.env.example',
          // Node and builds
          'node_modules', 'dist', 'bun.lock', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts',
          // Frontend & app source code
          'src', 'assets', 'public', 'index.html', 'metadata.json',
          // Python backend & internal helper scripts
          'instagram_aiograpi_helper.py', 'youtube_pytubefix_helper.py', 'telegram_bot.py', 'telegram_bot',
          'get-pip.py', 'requirements.txt', '__pycache__',
          // Internal configs, servers, and sessions
          'server.ts', 'server.ts.orig', 'Dockerfile', 'nixpacks.toml', 'railway.json', 'README.md', 'proxychains.conf',
          'cookies.txt', 'instagram_accounts', 'instagram_page_info.json', 'instagram_session.json',
          '.serverdash_config.json', '.serverdash_metrics.json', '.pot_config.json', '.terminal_cwd',
          '.trash_map.json', '.aistudio', 'skills'
        ]);

        filteredFiles = files.filter(f => {
          if (f.startsWith('.')) return false;
          if (f === '__pycache__' || f.endsWith('.pyc') || f.endsWith('.pyo')) return false;
          if (appSystemFiles.has(f)) return false;
          if (f.endsWith('_helper.py')) return false;
          return true;
        });
      } else {
        filteredFiles = files.filter(f => {
          if (f.startsWith('.')) return false;
          if (f === '__pycache__' || f.endsWith('.pyc') || f.endsWith('.pyo')) return false;
          return true;
        });
      }
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

# Use quoted identifier for table name (already validated against sqlite_master)
quoted_table = '"' + table_name.replace('"', '""') + '"'
cursor.execute(f'PRAGMA table_info({quoted_table})')
columns = [{"name": r[1], "type": r[2]} for r in cursor.fetchall()]

if limit > 0:
    cursor.execute(f'SELECT * FROM {quoted_table} LIMIT ?', (limit,))
else:
    cursor.execute(f'SELECT * FROM {quoted_table}')

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

// Persistent trash map - backed by JSON file
const TRASH_MAP_FILE = path.join(process.cwd(), '.serverdash_trash.json');

function loadTrashMap(): Map<string, FileTrashItem> {
  try {
    if (fs.existsSync(TRASH_MAP_FILE)) {
      const data = JSON.parse(fs.readFileSync(TRASH_MAP_FILE, 'utf-8'));
      return new Map(Object.entries(data));
    }
  } catch {}
  return new Map();
}

function saveTrashMap(map: Map<string, FileTrashItem>) {
  try {
    const obj = Object.fromEntries(map);
    fs.writeFileSync(TRASH_MAP_FILE, JSON.stringify(obj, null, 2));
  } catch (err) {
    console.error('Error saving trash map:', err);
  }
}

const fileTrashMap = loadTrashMap();

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
    saveTrashMap(fileTrashMap);

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
      saveTrashMap(fileTrashMap);
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
    saveTrashMap(fileTrashMap);

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

app.post('/api/files/upload', tempUpload.any() as any, (req: Request, res: Response) => {
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

// Helper to get MIME type from file extension
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    // Images
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.ico':
      return 'image/x-icon';
    case '.bmp':
      return 'image/bmp';
    case '.tiff':
    case '.tif':
      return 'image/tiff';
    case '.avif':
      return 'image/avif';
    // Audio
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.ogg':
    case '.oga':
      return 'audio/ogg';
    case '.aac':
      return 'audio/aac';
    case '.flac':
      return 'audio/flac';
    case '.m4a':
      return 'audio/mp4';
    case '.opus':
      return 'audio/opus';
    case '.wma':
      return 'audio/x-ms-wma';
    // Video
    case '.mp4':
    case '.m4v':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.ogv':
      return 'video/ogg';
    case '.mkv':
      return 'video/x-matroska';
    case '.mov':
      return 'video/quicktime';
    case '.avi':
      return 'video/x-msvideo';
    case '.3gp':
      return 'video/3gpp';
    // Documents
    case '.pdf':
      return 'application/pdf';
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.html':
    case '.htm':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

// Media Stream / Preview endpoint with HTTP Range support for video & audio scrubbing
app.get('/api/files/stream', async (req: Request, res: Response) => {
  const filePath = req.query.path as string;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      return res.status(400).json({ error: 'Cannot stream a directory' });
    }

    const mimeType = getMimeType(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        return res.status(416).send('Requested Range Not Satisfiable');
      }

      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mimeType,
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filePath).pipe(res);
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
app.post('/api/files/archive/add-files', tempUpload.any() as any, async (req: Request, res: Response) => {
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
      await execFileAsync('curl', ['-L', '-s', '-o', tmpZipPath, zipUrl], { timeout: 60000 });

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

    // Extract zip using adm-zip (safe, no shell interpolation)
    const admZip = new AdmZip(tmpZipPath);
    admZip.extractAllTo(tmpExtractDir, true);

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

app.post('/api/processes/run-background', tempUpload.any() as any, async (req: Request, res: Response) => {
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

app.post('/api/processes/update', upload.any() as any, async (req: Request, res: Response) => {
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
  const homeDir = os.homedir() || '/root';
  const denoBinDir = path.join(homeDir, '.deno', 'bin');
  const basePath = customTerminalEnv.PATH || process.env.PATH || '';
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    ...customTerminalEnv,
    PYTHONUNBUFFERED: '1',
    DENO_INSTALL: customTerminalEnv.DENO_INSTALL || path.join(homeDir, '.deno'),
    PATH: `${denoBinDir}:/root/.deno/bin:${basePath}:/usr/local/bin:/usr/bin:/bin`
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
    // Standard SOCKS5 (with remote DNS resolution via socks5h://) and HTTP proxies
    const socksUrl = 'socks5h://127.0.0.1:1080';
    const httpUrl = 'http://127.0.0.1:10809';

    env.ALL_PROXY = socksUrl;
    env.all_proxy = socksUrl;
    env.HTTP_PROXY = httpUrl;
    env.http_proxy = httpUrl;
    env.HTTPS_PROXY = httpUrl;
    env.https_proxy = httpUrl;
    env.SOCKS_PROXY = socksUrl;
    env.socks_proxy = socksUrl;
    env.SOCKS5_PROXY = socksUrl;
    env.socks5_proxy = socksUrl;

    // Do NOT prepend proxychains4.
    // Proxychains injects LD_PRELOAD hooks which destroy TLS fingerprints (JA3/JA4)
    // and causes YouTube/Cloudflare bot detection blocks on yt-dlp, python, and curl.
    // Clean environment variables allow native tools to route traffic transparently.
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
    const { index, mode, ping, videoUrl, testAll } = req.body;
    if (index !== undefined) {
      const modeStr = mode || 'full';
      const pingStr = ping !== undefined && ping !== null ? String(ping) : 'null';
      const videoUrlStr = videoUrl || 'https://youtu.be/bL7rIsAt0P0?is=xZiN13Z4w_6M877R';
      const data = await runVpnCli('test', [String(index), modeStr, pingStr, videoUrlStr]);
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
      const { stdout } = await execAsync('curl -s --socks5-hostname 127.0.0.1:1080 --max-time 5 https://ipinfo.io/json');
      vpnIpInfo = JSON.parse(stdout.trim());
    } catch {
      try {
        const { stdout } = await execAsync('curl -s --socks5-hostname 127.0.0.1:10808 --max-time 5 https://ipinfo.io/json');
        vpnIpInfo = JSON.parse(stdout.trim());
      } catch {
        // vpn fail
      }
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

// ---------------------- PERMANENT YOUTUBE PO TOKEN SERVER ----------------------
const POT_CONFIG_FILE = path.join(process.cwd(), '.pot_config.json');

function loadPotConfig(): { enabled: boolean } {
  try {
    if (fs.existsSync(POT_CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(POT_CONFIG_FILE, 'utf-8'));
      return { enabled: Boolean(data.enabled) };
    }
  } catch {}
  return { enabled: false }; // By default OFF as requested by user
}

function savePotConfig(cfg: { enabled: boolean }) {
  try {
    fs.writeFileSync(POT_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch {}
}

const initialPotConfig = loadPotConfig();

interface PoTokenServiceState {
  process: ChildProcess | null;
  pid: number | null;
  port: number;
  isRunning: boolean;
  startedAt: string | null;
  logs: string[];
  lastPingSuccess: boolean;
  lastPingTime: string | null;
  restartCount: number;
  desiredRunning: boolean;
}

const poTokenState: PoTokenServiceState = {
  process: null,
  pid: null,
  port: 4416,
  isRunning: false,
  startedAt: null,
  logs: [],
  lastPingSuccess: false,
  lastPingTime: null,
  restartCount: 0,
  desiredRunning: initialPotConfig.enabled // Default to false
};

function addPoTokenLog(msg: string) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg.trim()}`;
  poTokenState.logs.push(line);
  if (poTokenState.logs.length > 250) {
    poTokenState.logs.shift();
  }
}

function findPoTokenScript(): string | null {
  const candidates = [
    '/opt/bgutil/server/build/main.js',
    path.join(process.cwd(), 'bgutil', 'server', 'build', 'main.js'),
    '/tmp/test_bgutil/server/build/main.js',
    '/tmp/bgutil/server/build/main.js'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

async function pingPoTokenServer(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${poTokenState.port}/ping`, {
      signal: AbortSignal.timeout(2500)
    });
    if (res.ok) {
      poTokenState.lastPingSuccess = true;
      poTokenState.lastPingTime = new Date().toISOString();
      poTokenState.isRunning = true;
      return true;
    }
  } catch {}
  poTokenState.lastPingSuccess = false;
  return false;
}

let poTokenRestartTimer: NodeJS.Timeout | null = null;

async function startPoTokenServer() {
  if (!poTokenState.desiredRunning) return;

  // Check if already healthy
  const healthy = await pingPoTokenServer();
  if (healthy) {
    addPoTokenLog(`PO Token Server قبلاً روی پورت ${poTokenState.port} فعال و در دسترس است.`);
    poTokenState.isRunning = true;
    return;
  }

  let scriptPath = findPoTokenScript();
  if (!scriptPath) {
    addPoTokenLog('اسکریپت سرور PO Token یافت نشد، در حال تلاش برای آماده‌سازی...');
    try {
      if (!fs.existsSync('/opt/bgutil')) {
        await execAsync('git clone --depth 1 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /opt/bgutil && cd /opt/bgutil/server && npm install && npx tsc');
      } else if (!fs.existsSync('/opt/bgutil/server/build/main.js')) {
        await execAsync('cd /opt/bgutil/server && npm install && npx tsc');
      }
    } catch (e: any) {
      addPoTokenLog(`خطا در آماده‌سازی bgutil: ${e.message}`);
    }
    scriptPath = findPoTokenScript();
  }

  if (!scriptPath) {
    addPoTokenLog('فایل اجرایی build/main.js سرور PO Token هنوز در دسترس نیست.');
    return;
  }

  try {
    addPoTokenLog(`در حال راه‌اندازی دائمی PO Token Server روی پورت ${poTokenState.port}...`);

    try {
      const confContent = `--extractor-args "youtubepot:provider=http://127.0.0.1:${poTokenState.port}"\n`;
      fs.writeFileSync('/etc/yt-dlp.conf', confContent, 'utf-8');
      const rootConfigDir = '/root/.config/yt-dlp';
      if (!fs.existsSync(rootConfigDir)) fs.mkdirSync(rootConfigDir, { recursive: true });
      fs.writeFileSync(path.join(rootConfigDir, 'config'), confContent, 'utf-8');
    } catch {}

    try {
      await execAsync(`pkill -f "build/main.js.*${poTokenState.port}" 2>/dev/null || true`);
    } catch {}

    const nodeBin = process.execPath || 'node';
    const child = spawn(nodeBin, [scriptPath, '--port', String(poTokenState.port), '--host', '127.0.0.1'], {
      cwd: path.dirname(path.dirname(scriptPath)),
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.on('error', (err) => {
      addPoTokenLog(`خطا در اجرای سرور PO Token: ${err.message}`);
    });

    poTokenState.process = child;
    poTokenState.pid = child.pid || null;
    poTokenState.startedAt = new Date().toISOString();
    poTokenState.isRunning = true;

    child.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const l of lines) {
        if (l.trim()) addPoTokenLog(l);
      }
    });

    child.stderr?.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const l of lines) {
        if (l.trim()) addPoTokenLog(`[ERR] ${l}`);
      }
    });

    child.on('close', (code) => {
      poTokenState.isRunning = false;
      poTokenState.process = null;
      poTokenState.pid = null;
      addPoTokenLog(`پردازش PO Token Server متوقف شد (کد خروج: ${code}).`);

      if (poTokenState.desiredRunning) {
        poTokenState.restartCount++;
        addPoTokenLog(`راه‌اندازی مجدد خودکار در ۳ ثانیه... (تلاش ${poTokenState.restartCount})`);
        if (poTokenRestartTimer) clearTimeout(poTokenRestartTimer);
        poTokenRestartTimer = setTimeout(() => {
          startPoTokenServer();
        }, 3000);
      }
    });

    setTimeout(async () => {
      const ok = await pingPoTokenServer();
      if (ok) {
        addPoTokenLog(`PO Token Server با موفقیت بررسی و فعال شد (Port ${poTokenState.port}).`);
      }
    }, 2500);

  } catch (err: any) {
    addPoTokenLog(`خطا در اجرای سرور PO Token: ${err.message}`);
  }
}

// Watchdog: check every 30 seconds
setInterval(async () => {
  if (!poTokenState.desiredRunning) return;
  const isHealthy = await pingPoTokenServer();
  if (!isHealthy) {
    addPoTokenLog('PO Token Server پاسخگو نیست، در حال راه‌اندازی مجدد...');
    startPoTokenServer();
  }
}, 30000);

// PO Token Server Endpoints
app.get('/api/po-token/status', async (req: Request, res: Response) => {
  try {
    let isHealthy = false;
    if (poTokenState.desiredRunning) {
      isHealthy = await pingPoTokenServer();
    }
    res.json({
      isRunning: poTokenState.desiredRunning && (isHealthy || poTokenState.isRunning),
      desiredRunning: poTokenState.desiredRunning,
      port: poTokenState.port,
      pid: poTokenState.pid,
      startedAt: poTokenState.startedAt,
      lastPingSuccess: isHealthy,
      lastPingTime: poTokenState.lastPingTime,
      restartCount: poTokenState.restartCount,
      logs: poTokenState.logs.slice(-50)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/po-token/start', async (req: Request, res: Response) => {
  try {
    poTokenState.desiredRunning = true;
    savePotConfig({ enabled: true });
    addPoTokenLog('سرویس PO Token توسط کاربر روشن شد.');
    await startPoTokenServer();
    res.json({ success: true, message: 'سرویس PO Token با موفقیت روشن شد' });
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در روشن کردن سرویس: ' + err.message });
  }
});

app.post('/api/po-token/stop', async (req: Request, res: Response) => {
  try {
    poTokenState.desiredRunning = false;
    savePotConfig({ enabled: false });
    if (poTokenRestartTimer) {
      clearTimeout(poTokenRestartTimer);
      poTokenRestartTimer = null;
    }
    if (poTokenState.process) {
      try { poTokenState.process.kill('SIGTERM'); } catch {}
      poTokenState.process = null;
    }
    try {
      await execAsync(`pkill -f "build/main.js.*${poTokenState.port}" 2>/dev/null || true`);
    } catch {}
    poTokenState.isRunning = false;
    poTokenState.pid = null;
    addPoTokenLog('سرویس PO Token توسط کاربر خاموش شد.');
    res.json({ success: true, message: 'سرویس PO Token خاموش شد' });
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در خاموش کردن سرویس: ' + err.message });
  }
});

app.post('/api/po-token/restart', async (req: Request, res: Response) => {
  try {
    addPoTokenLog('درخواست راه‌اندازی مجدد توسط کاربر...');
    if (poTokenState.process) {
      try { poTokenState.process.kill('SIGTERM'); } catch {}
    }
    try {
      await execAsync(`fuser -k ${poTokenState.port}/tcp 2>/dev/null || pkill -f "build/main.js.*${poTokenState.port}" || true`);
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
    await startPoTokenServer();
    res.json({ success: true, message: 'سرور PO Token با موفقیت مجدداً راه‌اندازی شد' });
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در راه‌اندازی مجدد: ' + err.message });
  }
});

app.post('/api/po-token/test', async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const { mode = 'ytdlp', videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } = req.body || {};

    const potResp = await fetch(`http://127.0.0.1:${poTokenState.port}/get_pot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(15000)
    });

    if (!potResp.ok) {
      throw new Error(`PO Token Server responded with status ${potResp.status}`);
    }

    const data: any = await potResp.json();
    const durationMs = Date.now() - startTime;

    const rawPoToken = data.poToken || '';
    const rawVisitorData = data.visitorData || data.contentBinding || '';
    const previewPoToken = rawPoToken ? `${rawPoToken.substring(0, 24)}... (${rawPoToken.length} chars)` : '';
    const previewVisitorData = rawVisitorData ? `${rawVisitorData.substring(0, 20)}...` : '';

    if (mode === 'pytubefix') {
      // Test Pytubefix verification if python is available
      let pytubefixVerified = false;
      let pytubefixTitle = '';
      try {
        const pyScript = `
import sys
try:
    from pytubefix import YouTube
    yt = YouTube('${videoUrl}', use_po_token=True, po_token='${rawPoToken}', visitor_data='${rawVisitorData}')
    print("OK:" + str(yt.title))
except Exception as e:
    print("ERR:" + str(e))
        `.trim();
        const { stdout } = await execAsync(`python3 -c "${pyScript.replace(/\n/g, ' ')}" 2>&1`);
        if (stdout.includes('OK:')) {
          pytubefixVerified = true;
          pytubefixTitle = stdout.split('OK:')[1]?.trim() || '';
        }
      } catch {}

      const verifierCode = `from pytubefix import YouTube
import requests

def po_token_verifier():
    # دریافت خودکار PO Token و VisitorData از سرور محلی
    res = requests.post("http://127.0.0.1:${poTokenState.port}/get_pot").json()
    return res["poToken"], res.get("visitorData", "")

url = "${videoUrl}"
yt = YouTube(
    url,
    use_po_token=True,
    po_token_verifier=po_token_verifier
)

print("Title:", yt.title)
stream = yt.streams.get_highest_resolution()
print("Download Link:", stream.url[:80])`;

      const staticCode = `from pytubefix import YouTube

url = "${videoUrl}"
yt = YouTube(
    url,
    use_po_token=True,
    po_token="${rawPoToken}",
    visitor_data="${rawVisitorData}"
)

print("Title:", yt.title)
stream = yt.streams.get_highest_resolution()
print("Download Link:", stream.url[:80])`;

      res.json({
        success: true,
        mode: 'pytubefix',
        poToken: previewPoToken,
        rawPoToken,
        visitorData: previewVisitorData,
        rawVisitorData,
        expiresAt: data.expiresAt,
        durationMs,
        pytubefixVerified,
        pytubefixTitle,
        snippets: {
          verifierCode,
          staticCode
        },
        message: 'توکن PO برای Pytubefix با موفقیت تولید شد!'
      });
    } else {
      // Default: ytdlp mode
      let ytdlpTested = false;
      let ytdlpFormat = '';
      try {
        const { stdout } = await execAsync(`python3 -m yt_dlp --simulate --print "%(format)s" "${videoUrl}" 2>&1`);
        ytdlpTested = true;
        ytdlpFormat = stdout.trim().split('\n').pop() || '';
      } catch {}

      const cliCode = `yt-dlp --extractor-args "youtubepot:provider=http://127.0.0.1:${poTokenState.port}" "${videoUrl}"`;
      const pythonCode = `import yt_dlp

ydl_opts = {
    'extractor_args': {
        'youtubepot': {
            'provider': 'http://127.0.0.1:${poTokenState.port}'
        }
    }
}

with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    ydl.download(['${videoUrl}'])`;

      res.json({
        success: true,
        mode: 'ytdlp',
        poToken: previewPoToken,
        rawPoToken,
        visitorData: previewVisitorData,
        rawVisitorData,
        expiresAt: data.expiresAt,
        durationMs,
        ytdlpVerified: ytdlpTested,
        ytdlpFormat,
        snippets: {
          cliCode,
          pythonCode
        },
        message: 'توکن PO با موفقیت برای yt-dlp تولید شد!'
      });
    }
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'خطا در تست و تولید توکن: ' + err.message,
      durationMs: Date.now() - startTime
    });
  }
});

app.get('/api/po-token/logs', (req: Request, res: Response) => {
  res.json({
    logs: poTokenState.logs,
    count: poTokenState.logs.length
  });
});

// ---------------------- YOUTUBE INFO & DOWNLOADER API ----------------------
interface YouTubeQualityOption {
  id: string;
  label: string;
  resolution?: string;
  ext: string;
  type: 'video' | 'audio';
  approxSize?: string;
  formatNote?: string;
  fps?: number;
  qualityBadge?: string;
  itag?: number;
}

interface YouTubeSubtitleOption {
  id: string;
  lang: string;
  name: string;
  isAuto: boolean;
  formats: string[];
  url?: string;
}

interface YouTubeVideoDetails {
  id: string;
  title: string;
  url: string;
  uploader: string;
  channelUrl?: string;
  thumbnail: string;
  duration: number;
  durationFormatted: string;
  viewCount: number;
  viewCountFormatted: string;
  uploadDate?: string;
  description?: string;
  engine?: 'ytdlp' | 'pytubefix';
  vpnUsed?: boolean;
  vpnProxy?: string;
  qualities: YouTubeQualityOption[];
  subtitles?: YouTubeSubtitleOption[];
}

interface YouTubeDownloadJob {
  id: string;
  title: string;
  url: string;
  qualityId: string;
  formatLabel: string;
  type: 'video' | 'audio' | 'subtitle';
  engine?: 'ytdlp' | 'pytubefix';
  vpnUsed?: boolean;
  vpnProxy?: string;
  status: 'starting' | 'downloading' | 'converting' | 'completed' | 'error';
  progress: number;
  speed: string;
  eta: string;
  totalSize: string;
  fileName: string;
  filePath: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

const SUBTITLE_LANG_NAMES: Record<string, string> = {
  'fa': 'فارسی (Persian)',
  'fa-IR': 'فارسی - ایران (Persian)',
  'en': 'انگلیسی (English)',
  'en-orig': 'انگلیسی اصلی (English Original)',
  'en-US': 'انگلیسی آمریکا (English US)',
  'en-GB': 'انگلیسی بریتانیا (English UK)',
  'ar': 'عربی (Arabic)',
  'tr': 'ترکی استانبولی (Turkish)',
  'ku': 'کردی (Kurdish)',
  'az': 'آذربایجانی (Azerbaijani)',
  'de': 'آلمانی (German)',
  'fr': 'فرانسوی (French)',
  'es': 'اسپانیایی (Spanish)',
  'ru': 'روسی (Russian)',
  'it': 'ایتالیایی (Italian)',
  'pt': 'پرتغالی (Portuguese)',
  'zh': 'چینی (Chinese)',
  'zh-Hans': 'چینی ساده‌شده (Chinese Simplified)',
  'zh-Hant': 'چینی سنتی (Chinese Traditional)',
  'ja': 'ژاپنی (Japanese)',
  'ko': 'کره‌ای (Korean)',
  'hi': 'هندی (Hindi)',
  'ur': 'اردو (Urdu)',
  'nl': 'هلندی (Dutch)',
  'sv': 'سوئدی (Swedish)',
  'pl': 'لهستانی (Polish)',
  'uk': 'اوکراینی (Ukrainian)',
  'id': 'اندونزیایی (Indonesian)',
  'vi': 'ویتنامی (Vietnamese)',
  'th': 'تایلندی (Thai)',
  'he': 'عبری (Hebrew)',
  'el': 'یونانی (Greek)',
  'ps': 'پشتو (Pashto)',
  'tg': 'تاجیکی (Tajik)',
  'uz': 'ازبکی (Uzbek)',
  'hy': 'ارمنی (Armenian)',
  'ka': 'گرجی (Georgian)'
};

function getSubtitleLangLabel(langCode: string, fallbackName?: string): string {
  const clean = (langCode || '').trim();
  if (SUBTITLE_LANG_NAMES[clean]) return SUBTITLE_LANG_NAMES[clean];
  const base = clean.split('-')[0];
  if (SUBTITLE_LANG_NAMES[base] && !fallbackName) return `${SUBTITLE_LANG_NAMES[base]} (${clean})`;
  if (fallbackName && fallbackName !== clean) {
    if (SUBTITLE_LANG_NAMES[base] && !fallbackName.includes('فارسی') && !fallbackName.includes(SUBTITLE_LANG_NAMES[base].split(' ')[0])) {
      return `${SUBTITLE_LANG_NAMES[base].split(' (')[0]} - ${fallbackName}`;
    }
    return fallbackName;
  }
  return SUBTITLE_LANG_NAMES[base] || clean.toUpperCase();
}

function sortSubtitlesList(subs: YouTubeSubtitleOption[]): YouTubeSubtitleOption[] {
  const priorityLangs = ['fa', 'fa-IR', 'en', 'en-orig', 'en-US', 'en-GB', 'ar', 'tr', 'ku', 'az', 'de', 'fr', 'es', 'ru'];
  return [...subs].sort((a, b) => {
    // Prioritize Persian first regardless, then manual vs auto, then priority list
    const aIsFa = a.lang === 'fa' || a.lang.startsWith('fa-');
    const bIsFa = b.lang === 'fa' || b.lang.startsWith('fa-');
    if (aIsFa && !bIsFa && a.isAuto === b.isAuto) return -1;
    if (!aIsFa && bIsFa && a.isAuto === b.isAuto) return 1;

    if (a.isAuto !== b.isAuto) {
      return a.isAuto ? 1 : -1; // Manual first
    }

    const aIdx = priorityLangs.indexOf(a.lang);
    const bIdx = priorityLangs.indexOf(b.lang);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.lang.localeCompare(b.lang);
  });
}

function convertSubtitleContent(rawContent: string, targetExt: 'srt' | 'vtt' | 'txt'): string {
  const text = (rawContent || '').trim();
  if (!text) return '';

  const formatSrtTime = (secFloat: number) => {
    const totalMs = Math.max(0, Math.round(secFloat * 1000));
    const hrs = Math.floor(totalMs / 3600000);
    const mins = Math.floor((totalMs % 3600000) / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };

  const formatVttTime = (secFloat: number) => formatSrtTime(secFloat).replace(',', '.');

  const decodeHtmlEntities = (str: string) =>
    str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));

  // 1. JSON3 format
  if (text.startsWith('{') && text.includes('"events"')) {
    try {
      const parsed = JSON.parse(text);
      const events = Array.isArray(parsed.events) ? parsed.events : [];
      const cues: { start: number; end: number; content: string }[] = [];
      for (const ev of events) {
        if (!ev.segs || !Array.isArray(ev.segs)) continue;
        const line = ev.segs.map((s: any) => s.utf8 || '').join('').trim();
        if (!line) continue;
        const startSec = (ev.tStartMs || 0) / 1000;
        const durSec = (ev.dDurationMs || 3000) / 1000;
        cues.push({ start: startSec, end: startSec + durSec, content: line });
      }
      if (cues.length > 0) {
        if (targetExt === 'txt') {
          const deduped: string[] = [];
          for (const c of cues) {
            if (deduped[deduped.length - 1] !== c.content) deduped.push(c.content);
          }
          return deduped.join('\n');
        }
        if (targetExt === 'vtt') {
          return 'WEBVTT\n\n' + cues.map((c, i) => `${i + 1}\n${formatVttTime(c.start)} --> ${formatVttTime(c.end)}\n${c.content}`).join('\n\n');
        }
        return cues.map((c, i) => `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.content}`).join('\n\n');
      }
    } catch {}
  }

  // 2. WEBVTT format
  if (text.startsWith('WEBVTT')) {
    if (targetExt === 'vtt') return text;
    const blocks = text.split(/\r?\n\r?\n/);
    const srtBlocks: string[] = [];
    const txtLines: string[] = [];
    let idx = 1;

    for (const b of blocks) {
      const lines = b.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length === 0 || lines[0].startsWith('WEBVTT') || lines[0].startsWith('Kind:') || lines[0].startsWith('Language:') || lines[0].startsWith('NOTE')) {
        continue;
      }
      const timeIdx = lines.findIndex(l => l.includes('-->'));
      if (timeIdx === -1) continue;

      const rawTimeLine = lines[timeIdx];
      const arrowParts = rawTimeLine.split('-->');
      if (arrowParts.length < 2) continue;

      const normTime = (tStr: string) => {
        const cleanT = tStr.trim().split(/\s+/)[0].replace('.', ',');
        // If MM:SS,mmm instead of HH:MM:SS,mmm
        if (/^\d{2}:\d{2},\d{3}$/.test(cleanT)) {
          return `00:${cleanT}`;
        }
        return cleanT;
      };

      const startT = normTime(arrowParts[0]);
      const endT = normTime(arrowParts[1]);
      const contentLines = lines
        .slice(timeIdx + 1)
        .map(l => decodeHtmlEntities(l.replace(/<[^>]+>/g, '')).trim())
        .filter(Boolean);

      const contentStr = contentLines.join('\n');
      if (contentStr) {
        srtBlocks.push(`${idx}\n${startT} --> ${endT}\n${contentStr}`);
        for (const cl of contentLines) {
          if (txtLines[txtLines.length - 1] !== cl) {
            txtLines.push(cl);
          }
        }
        idx++;
      }
    }

    if (targetExt === 'txt') return txtLines.join('\n');
    return srtBlocks.join('\n\n');
  }

  // 3. XML timedtext (<text start="..." dur="..."> or <p t="..." d="...">)
  if (text.startsWith('<')) {
    const cues: { start: number; end: number; content: string }[] = [];
    const textRegex = /<(?:text|p)\b([^>]*)>([\s\S]*?)<\/(?:text|p)>/gi;
    let match: RegExpExecArray | null;
    while ((match = textRegex.exec(text)) !== null) {
      const attrs = match[1] || '';
      const inner = match[2] || '';
      let startSec = 0;
      let durSec = 3;

      const startMatch = attrs.match(/\bstart=["']([\d.]+)["']/i);
      const durMatch = attrs.match(/\bdur=["']([\d.]+)["']/i);
      const tMatch = attrs.match(/\bt=["'](\d+)["']/i);
      const dMatch = attrs.match(/\bd=["'](\d+)["']/i);

      if (startMatch) {
        startSec = parseFloat(startMatch[1]) || 0;
        durSec = durMatch ? (parseFloat(durMatch[1]) || 3) : 3;
      } else if (tMatch) {
        startSec = (parseInt(tMatch[1], 10) || 0) / 1000;
        durSec = dMatch ? ((parseInt(dMatch[1], 10) || 3000) / 1000) : 3;
      }

      const cleaned = decodeHtmlEntities(inner.replace(/<[^>]+>/g, '')).trim();
      if (cleaned) {
        cues.push({ start: startSec, end: startSec + durSec, content: cleaned });
      }
    }

    if (cues.length > 0) {
      if (targetExt === 'txt') {
        const deduped: string[] = [];
        for (const c of cues) {
          if (deduped[deduped.length - 1] !== c.content) deduped.push(c.content);
        }
        return deduped.join('\n');
      }
      if (targetExt === 'vtt') {
        return 'WEBVTT\n\n' + cues.map((c, i) => `${i + 1}\n${formatVttTime(c.start)} --> ${formatVttTime(c.end)}\n${c.content}`).join('\n\n');
      }
      return cues.map((c, i) => `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.content}`).join('\n\n');
    }
  }

  // 4. Already SRT
  if (targetExt === 'txt') {
    const lines = text.split(/\r?\n/);
    const txtLines: string[] = [];
    for (const l of lines) {
      const trimmed = l.trim();
      if (!trimmed || /^\d+$/.test(trimmed) || trimmed.includes('-->')) continue;
      const cleaned = decodeHtmlEntities(trimmed.replace(/<[^>]+>/g, '')).trim();
      if (cleaned && txtLines[txtLines.length - 1] !== cleaned) {
        txtLines.push(cleaned);
      }
    }
    return txtLines.join('\n');
  }
  if (targetExt === 'vtt' && !text.startsWith('WEBVTT')) {
    return 'WEBVTT\n\n' + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  }

  return text;
}

const youtubeDownloadJobs = new Map<string, YouTubeDownloadJob>();
const YOUTUBE_DOWNLOADS_DIR = path.join(process.cwd(), 'downloads');
if (!fs.existsSync(YOUTUBE_DOWNLOADS_DIR)) {
  try { fs.mkdirSync(YOUTUBE_DOWNLOADS_DIR, { recursive: true }); } catch {}
}

async function getVpnProxyConfig(): Promise<{ isRunning: boolean; httpProxy: string; socksProxy: string }> {
  try {
    const status = await runVpnCli('status');
    const isRunning = Boolean(status && (status.running || status.enabled));
    const httpPort = status?.httpProxy || '127.0.0.1:10809';
    const socksPort = status?.socksProxy || '127.0.0.1:10808';
    return {
      isRunning,
      httpProxy: httpPort.startsWith('http://') ? httpPort : `http://${httpPort}`,
      socksProxy: socksPort.startsWith('socks5') ? socksPort : `socks5h://${socksPort}`
    };
  } catch {
    return { isRunning: false, httpProxy: 'http://127.0.0.1:10809', socksProxy: 'socks5h://127.0.0.1:10808' };
  }
}

function formatDurationSeconds(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatViewsCount(count: number): string {
  if (!count || isNaN(count)) return '0';
  if (count >= 1_000_000_000) {
    return (count / 1_000_000_000).toFixed(1) + 'B';
  }
  if (count >= 1_000_000) {
    return (count / 1_000_000).toFixed(1) + 'M';
  }
  if (count >= 1_000) {
    return (count / 1_000).toFixed(1) + 'K';
  }
  return count.toLocaleString('en-US');
}

function formatBytesHuman(bytes: number): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '';
  if (bytes >= 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }
  if (bytes >= 1024 * 1024) {
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
  return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

// GET /api/youtube/vpn-status - Get current VPN status and proxy for YouTube module
app.get('/api/youtube/vpn-status', async (req: Request, res: Response) => {
  const vpn = await getVpnProxyConfig();
  res.json({
    vpnActive: vpn.isRunning,
    httpProxy: vpn.httpProxy,
    socksProxy: vpn.socksProxy,
    potRunning: poTokenState.isRunning,
    potPort: poTokenState.port
  });
});

// POST /api/youtube/info - Extract full video info, thumbnail, qualities with selectable engine
app.post('/api/youtube/info', async (req: Request, res: Response) => {
  try {
    const { url, engine = 'ytdlp' } = req.body || {};
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ error: 'لطفاً لینک ویدیوی یوتیوب را وارد کنید' });
    }

    const trimmedUrl = url.trim();
    const isYtUrl = /^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\/.+/i.test(trimmedUrl);
    if (!isYtUrl) {
      return res.status(400).json({ error: 'لینک وارد شده یک آدرس معتبر یوتیوب نمی‌باشد' });
    }

    const vpn = await getVpnProxyConfig();
    const poPort = poTokenState.isRunning ? String(poTokenState.port) : '';
    const vpnEnv = vpn.isRunning ? {
      HTTP_PROXY: vpn.httpProxy,
      HTTPS_PROXY: vpn.httpProxy,
      ALL_PROXY: vpn.socksProxy,
      http_proxy: vpn.httpProxy,
      https_proxy: vpn.httpProxy,
      all_proxy: vpn.socksProxy
    } : {};

    let details: YouTubeVideoDetails | null = null;
    let usedEngine = engine === 'pytubefix' ? 'pytubefix' : 'ytdlp';

    if (engine === 'pytubefix') {
      try {
        details = await getPytubefixVideoDetails(trimmedUrl, poPort, vpn, vpnEnv);
      } catch (ptErr: any) {
        console.warn('[YouTube Info] pytubefix failed, trying yt-dlp fallback:', ptErr?.message);
        try {
          details = await getYtDlpVideoDetails(trimmedUrl, poPort, vpn, vpnEnv);
          usedEngine = 'ytdlp';
        } catch (ytdlpErr: any) {
          throw new Error(`pytubefix: ${ptErr?.message || 'failed'}; yt-dlp: ${ytdlpErr?.message || 'failed'}`);
        }
      }
    } else {
      // Default: yt-dlp first
      try {
        details = await getYtDlpVideoDetails(trimmedUrl, poPort, vpn, vpnEnv);
      } catch (ytdlpErr: any) {
        console.warn('[YouTube Info] yt-dlp failed, trying pytubefix fallback:', ytdlpErr?.message);
        try {
          details = await getPytubefixVideoDetails(trimmedUrl, poPort, vpn, vpnEnv);
          usedEngine = 'pytubefix';
        } catch (ptErr: any) {
          throw new Error(`yt-dlp: ${ytdlpErr?.message || 'failed'}; pytubefix: ${ptErr?.message || 'failed'}`);
        }
      }
    }

    res.json({ success: true, details, engine: usedEngine, vpnUsed: vpn.isRunning });
  } catch (err: any) {
    console.error('YouTube info extraction error:', err);
    res.status(500).json({
      error: 'خطا در استخراج اطلاعات ویدیو: ' + (err.stderr || err.message || 'خطای ناشناخته')
    });
  }
});

// Helper for pytubefix video details
async function getPytubefixVideoDetails(trimmedUrl: string, poPort: string, vpn: any, vpnEnv: any): Promise<YouTubeVideoDetails> {
  const helperScript = path.join(process.cwd(), 'youtube_pytubefix_helper.py');
  const pyArgs = [
    helperScript, 
    'info', 
    trimmedUrl, 
    poPort || 'none',
    vpn.isRunning ? vpn.httpProxy : 'none'
  ];

  const { stdout } = await execFileAsync('python3', pyArgs, {
    maxBuffer: 50 * 1024 * 1024,
    timeout: 45000,
    env: { ...process.env, ...vpnEnv }
  });

  const details = JSON.parse(stdout);
  details.engine = 'pytubefix';
  details.vpnUsed = vpn.isRunning;
  details.vpnProxy = vpn.isRunning ? vpn.httpProxy : undefined;
  if (Array.isArray(details.subtitles)) {
    details.subtitles = sortSubtitlesList(
      details.subtitles.map((s: any) => ({
        ...s,
        name: getSubtitleLangLabel(s.lang, s.name)
      }))
    );
  } else {
    details.subtitles = [];
  }
  return details;
}

// Helper for yt-dlp video details
async function getYtDlpVideoDetails(trimmedUrl: string, poPort: string, vpn: any, vpnEnv: any): Promise<YouTubeVideoDetails> {
  const nodePath = process.execPath || '/usr/local/bin/node';
  const args = [
    '-m', 'yt_dlp',
    '--dump-single-json',
    '--simulate',
    '--no-playlist',
    '--no-warnings'
  ];

  if (fs.existsSync(nodePath)) {
    args.push('--js-runtimes', `node:${nodePath}`);
  }

  if (vpn.isRunning) {
    args.push('--proxy', vpn.httpProxy);
  }

  if (poTokenState.isRunning) {
    args.push('--extractor-args', `youtubepot-bgutilhttp:base_url=http://127.0.0.1:${poTokenState.port}`);
  }

  args.push(trimmedUrl);

  const { stdout } = await execFileAsync('python3', args, {
    maxBuffer: 50 * 1024 * 1024,
    timeout: 45000,
    env: { ...process.env, ...vpnEnv }
  });

  const data = JSON.parse(stdout);
  const duration = typeof data.duration === 'number' ? data.duration : 0;
  const viewCount = typeof data.view_count === 'number' ? data.view_count : 0;

  // Pick best thumbnail
  let bestThumbnail = data.thumbnail || '';
  if (Array.isArray(data.thumbnails) && data.thumbnails.length > 0) {
    const sortedThumbs = [...data.thumbnails].sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
    if (sortedThumbs[0]?.url) {
      bestThumbnail = sortedThumbs[0].url;
    }
  }

  // Parse formats to find available heights and approx sizes
  const formats: any[] = Array.isArray(data.formats) ? data.formats : [];
  const heightMap = new Map<number, { formatId: string; approxBytes: number; fps?: number }>();

  for (const f of formats) {
    const h = f.height;
    if (typeof h === 'number' && h > 0 && f.vcodec !== 'none') {
      const existing = heightMap.get(h);
      const fSize = f.filesize || f.filesize_approx || (f.tbr && duration ? Math.round((f.tbr * 1000 / 8) * duration) : 0);
      if (!existing || (fSize > existing.approxBytes)) {
        heightMap.set(h, {
          formatId: f.format_id,
          approxBytes: fSize,
          fps: f.fps
        });
      }
    }
  }

  const targetHeights = [2160, 1440, 1080, 720, 480, 360, 240, 144];
  const availableHeights = targetHeights.filter(h => heightMap.has(h));
  if (availableHeights.length === 0) {
    // Fallback: collect any heights available
    Array.from(heightMap.keys()).sort((a, b) => b - a).forEach(h => availableHeights.push(h));
  }

  const qualities: YouTubeQualityOption[] = [];

  // Add Video options
  for (const h of availableHeights) {
    const meta = heightMap.get(h);
    let label = `${h}p`;
    let badge = '';
    if (h >= 2160) { label = '4K Ultra HD (2160p)'; badge = '4K'; }
    else if (h >= 1440) { label = '2K Quad HD (1440p)'; badge = '2K'; }
    else if (h >= 1080) { label = 'Full HD (1080p)'; badge = 'FHD'; }
    else if (h >= 720) { label = 'HD (720p)'; badge = 'HD'; }
    else if (h >= 480) { label = 'Standard (480p)'; badge = 'SD'; }
    else if (h >= 360) { label = 'Medium (360p)'; badge = '360p'; }
    else { label = `Low (${h}p)`; badge = `${h}p`; }

    const approxSize = meta?.approxBytes ? formatBytesHuman(meta.approxBytes) : '';

    qualities.push({
      id: `video_${h}p`,
      label,
      resolution: `${h}p`,
      ext: 'mp4',
      type: 'video',
      approxSize,
      fps: meta?.fps,
      qualityBadge: badge
    });
  }

  // Always add a "Best Available Video" option
  qualities.push({
    id: 'video_best',
    label: 'بهترین کیفیت ممکن (Best Quality)',
    ext: 'mp4',
    type: 'video',
    qualityBadge: 'BEST'
  });

  // Add Audio options (MP3 & M4A)
  const audio320Size = duration ? formatBytesHuman(Math.round((320 * 1000 / 8) * duration)) : '';
  const audio128Size = duration ? formatBytesHuman(Math.round((128 * 1000 / 8) * duration)) : '';

  qualities.push(
    {
      id: 'audio_mp3_high',
      label: 'صوت MP3 با کیفیت بالا (320kbps)',
      ext: 'mp3',
      type: 'audio',
      approxSize: audio320Size,
      qualityBadge: 'MP3 320k'
    },
    {
      id: 'audio_mp3_std',
      label: 'صوت MP3 کیفیت معمولی (128kbps)',
      ext: 'mp3',
      type: 'audio',
      approxSize: audio128Size,
      qualityBadge: 'MP3 128k'
    },
    {
      id: 'audio_m4a',
      label: 'صوت M4A / AAC (صدای اصلی ویدیو)',
      ext: 'm4a',
      type: 'audio',
      approxSize: audio128Size,
      qualityBadge: 'M4A'
    }
  );

  // Extract Subtitles (manual + automatic_captions)
  const rawSubtitles: YouTubeSubtitleOption[] = [];
  const origVideoLang = typeof data.language === 'string' ? data.language.trim() : '';
  const origBaseLang = origVideoLang.split('-')[0].toLowerCase();

  const pickTrackUrl = (tracks: any[]): { url?: string; name?: string } => {
    if (!Array.isArray(tracks) || tracks.length === 0) return {};
    const validTracks = tracks.filter(t => t && typeof t.url === 'string' && t.url.startsWith('http'));
    if (validTracks.length === 0) return {};

    // Filter out AI-dubbed secondary tracks (variant=timing-optimized) because YouTube TimedText API
    // returns HTTP 400 when translating them via tlang= (e.g. tlang=fa)
    const nonVariantTracks = validTracks.filter(t => !t.url.includes('variant=timing-optimized') && !t.url.includes('variant='));
    let pool = nonVariantTracks.length > 0 ? nonVariantTracks : validTracks;

    // Further prefer tracks whose source lang= matches the video's original language or 'en'
    if (pool.length > 1) {
      const origLangTracks = pool.filter(t => {
        if (origVideoLang && (t.url.includes(`lang=${origVideoLang}&`) || t.url.includes(`lang=${origBaseLang}&`))) {
          return true;
        }
        return t.url.includes('lang=en&') || t.url.includes('lang=en-US&') || t.url.includes('lang=en-GB&');
      });
      if (origLangTracks.length > 0) {
        pool = origLangTracks;
      }
    }

    const vttTrack = pool.find(t => t.ext === 'vtt');
    const srtTrack = pool.find(t => t.ext === 'srt');
    const srvTrack = pool.find(t => t.ext === 'srv3' || t.ext === 'srv1' || t.ext === 'ttml');
    const chosen = vttTrack || srtTrack || srvTrack || pool[0];
    return { url: chosen?.url, name: chosen?.name };
  };

  if (data.subtitles && typeof data.subtitles === 'object') {
    for (const [langCode, tracks] of Object.entries(data.subtitles)) {
      if (langCode === 'live_chat') continue;
      const { url: trackUrl, name: trackName } = pickTrackUrl(tracks as any[]);
      rawSubtitles.push({
        id: `sub_manual_${langCode}`,
        lang: langCode,
        name: getSubtitleLangLabel(langCode, trackName),
        isAuto: false,
        formats: ['srt', 'vtt', 'txt'],
        url: trackUrl
      });
    }
  }

  if (data.automatic_captions && typeof data.automatic_captions === 'object') {
    for (const [langCode, tracks] of Object.entries(data.automatic_captions)) {
      if (langCode === 'live_chat') continue;
      const { url: trackUrl, name: trackName } = pickTrackUrl(tracks as any[]);
      rawSubtitles.push({
        id: `sub_auto_${langCode}`,
        lang: langCode,
        name: getSubtitleLangLabel(langCode, trackName),
        isAuto: true,
        formats: ['srt', 'vtt', 'txt'],
        url: trackUrl
      });
    }
  }

  const subtitles = sortSubtitlesList(rawSubtitles);

  return {
    id: data.id || '',
    title: data.title || 'YouTube Video',
    url: trimmedUrl,
    uploader: data.uploader || data.channel || 'ناشناس',
    channelUrl: data.uploader_url || data.channel_url || '',
    thumbnail: bestThumbnail,
    duration,
    durationFormatted: formatDurationSeconds(duration),
    viewCount,
    viewCountFormatted: formatViewsCount(viewCount),
    uploadDate: data.upload_date ? `${data.upload_date.slice(0, 4)}-${data.upload_date.slice(4, 6)}-${data.upload_date.slice(6, 8)}` : '',
    description: data.description ? data.description.substring(0, 300) : '',
    engine: 'ytdlp',
    vpnUsed: vpn.isRunning,
    vpnProxy: vpn.isRunning ? vpn.httpProxy : undefined,
    qualities,
    subtitles
  };
}

// POST /api/youtube/subtitle/download - Download & convert a specific subtitle track (SRT / VTT / TXT)
app.post('/api/youtube/subtitle/download', async (req: Request, res: Response) => {
  try {
    const {
      url,
      lang = 'en',
      isAuto = false,
      format = 'srt',
      subtitleUrl = '',
      subtitleName = '',
      title = 'YouTube_Video',
      videoId = 'video',
      engine = 'ytdlp'
    } = req.body || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'آدرس ویدیو نامعتبر است' });
    }

    const targetExt: 'srt' | 'vtt' | 'txt' =
      format === 'vtt' ? 'vtt' : format === 'txt' ? 'txt' : 'srt';

    const vpn = await getVpnProxyConfig();
    const poPort = poTokenState.isRunning ? String(poTokenState.port) : '';
    const vpnEnv = vpn.isRunning ? {
      HTTP_PROXY: vpn.httpProxy,
      HTTPS_PROXY: vpn.httpProxy,
      ALL_PROXY: vpn.socksProxy,
      http_proxy: vpn.httpProxy,
      https_proxy: vpn.httpProxy,
      all_proxy: vpn.socksProxy
    } : {};

    const sanitizedTitle = (title || 'video').replace(/[^\w\s\u0600-\u06FF.-]/g, '_').substring(0, 60);
    const cleanVid = (videoId || 'sub').replace(/[^\w-]/g, '');
    const cleanLang = (lang || 'en').replace(/[^\w-]/g, '');
    const finalFileName = `${sanitizedTitle}-${cleanVid}.${cleanLang}.${targetExt}`;
    const finalFilePath = path.join(YOUTUBE_DOWNLOADS_DIR, finalFileName);

    const isValidSubtitlePayload = (raw: string): boolean => {
      if (!raw || typeof raw !== 'string') return false;
      const trimmed = raw.trim();
      if (trimmed.length < 10) return false;
      const lower = trimmed.slice(0, 400).toLowerCase();
      if (lower.includes('<!doctype html') || lower.includes('<html') || lower.includes('google help')) {
        return false;
      }
      return (
        trimmed.startsWith('WEBVTT') ||
        trimmed.includes('-->') ||
        trimmed.includes('<text') ||
        trimmed.includes('<p ') ||
        trimmed.includes('<transcript') ||
        trimmed.includes('<timedtext') ||
        (trimmed.startsWith('{') && trimmed.includes('"events"'))
      );
    };

    const fetchViaCurl = async (targetUrl: string): Promise<string> => {
      try {
        const curlArgs = ['-sSL', '--max-time', '20', '-A', 'Mozilla/5.0'];
        if (vpn.isRunning) {
          curlArgs.push('-x', vpn.httpProxy);
        }
        curlArgs.push(targetUrl);
        const { stdout } = await execFileAsync('curl', curlArgs, {
          maxBuffer: 20 * 1024 * 1024,
          env: { ...process.env, ...vpnEnv }
        });
        return stdout || '';
      } catch {
        return '';
      }
    };

    let rawSubContent = '';

    // Method 1: Direct fetch via extracted timedtext URL (fastest)
    if (subtitleUrl && typeof subtitleUrl === 'string' && subtitleUrl.startsWith('http')) {
      let baseFetchUrl = subtitleUrl;
      if (baseFetchUrl.includes('fmt=json3') || baseFetchUrl.includes('fmt=srv')) {
        baseFetchUrl = baseFetchUrl.replace(/fmt=[^&]+/, 'fmt=vtt');
      } else if (!baseFetchUrl.includes('fmt=')) {
        baseFetchUrl += (baseFetchUrl.includes('?') ? '&' : '?') + 'fmt=vtt';
      }

      const candidateUrls: string[] = [];
      // If the URL has variant=timing-optimized (which fails with HTTP 400 on tlang=fa),
      // prioritize repaired non-variant URLs first
      if (baseFetchUrl.includes('variant=')) {
        const strippedVariant = baseFetchUrl.replace(/&variant=[^&]+/g, '');
        const enSourceVariant = strippedVariant.replace(/([?&])lang=[^&]+/, '$1lang=en');
        if (!candidateUrls.includes(enSourceVariant)) candidateUrls.push(enSourceVariant);
        if (!candidateUrls.includes(strippedVariant)) candidateUrls.push(strippedVariant);
      }
      if (!candidateUrls.includes(baseFetchUrl)) {
        candidateUrls.push(baseFetchUrl);
      }

      for (const candidate of candidateUrls) {
        const out = await fetchViaCurl(candidate);
        if (isValidSubtitlePayload(out)) {
          rawSubContent = out;
          break;
        }
      }

      // Method 1B: If YouTube rate-limited tlang= with HTTP 429, fetch the original untranslated srv1 track
      // (which YouTube serves from static cache without 429) and batch-translate cues in parallel
      if (!rawSubContent && (baseFetchUrl.includes('tlang=') || isAuto)) {
        try {
          const noTlang = baseFetchUrl
            .replace(/([?&])tlang=[^&]+&?/g, '$1')
            .replace(/&variant=[^&]+/g, '')
            .replace(/fmt=[^&]+/, 'fmt=srv1')
            .replace(/[?&]$/, '');
          const enOrigUrl = noTlang.replace(/([?&])lang=[^&]+/, '$1lang=en');
          const origCandidates = enOrigUrl !== noTlang ? [enOrigUrl, noTlang] : [noTlang];

          let origXml = '';
          for (const origUrl of origCandidates) {
            try {
              const out = await fetchViaCurl(origUrl);
              if (out && (out.includes('<text') || out.includes('<p '))) {
                origXml = out;
                break;
              }
            } catch {}
          }

          if (origXml) {
            const decodeXmlEntities = (s: string) =>
              s
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&apos;/g, "'")
                .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));

            const cues: { start: number; end: number; text: string }[] = [];
            const tagRegex = /<(?:text|p)\b([^>]*)>([\s\S]*?)<\/(?:text|p)>/gi;
            let m: RegExpExecArray | null;
            while ((m = tagRegex.exec(origXml)) !== null) {
              const attrs = m[1] || '';
              const inner = m[2] || '';
              const stM = attrs.match(/\bstart=["']([\d.]+)["']/i);
              const durM = attrs.match(/\bdur=["']([\d.]+)["']/i);
              const tM = attrs.match(/\bt=["'](\d+)["']/i);
              const dM = attrs.match(/\bd=["'](\d+)["']/i);
              let st = 0;
              let dur = 3;
              if (stM) {
                st = parseFloat(stM[1]) || 0;
                dur = durM ? (parseFloat(durM[1]) || 3) : 3;
              } else if (tM) {
                st = (parseInt(tM[1], 10) || 0) / 1000;
                dur = dM ? ((parseInt(dM[1], 10) || 3000) / 1000) : 3;
              }
              const cleanTxt = decodeXmlEntities(inner.replace(/<[^>]+>/g, ''))
                .replace(/[\r\n]+/g, ' ')
                .trim();
              if (cleanTxt) {
                cues.push({ start: st, end: st + dur, text: cleanTxt });
              }
            }

            if (cues.length > 0) {
              for (let i = 0; i < cues.length - 1; i++) {
                if (cues[i + 1].start > cues[i].start && cues[i].end > cues[i + 1].start) {
                  cues[i].end = cues[i + 1].start;
                }
              }

              const targetTl = lang.startsWith('fa') ? 'fa' : lang.replace(/-orig$/, '');
              const batchSize = 50;
              const batches: { start: number; end: number; text: string }[][] = [];
              for (let i = 0; i < cues.length; i += batchSize) {
                batches.push(cues.slice(i, i + batchSize));
              }

              await Promise.all(
                batches.map(async (batch) => {
                  const joined = batch.map(b => b.text).join('\n');
                  const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetTl)}&dt=t&q=${encodeURIComponent(joined)}`;
                  try {
                    const resp = await fetch(gUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    if (resp.ok) {
                      const gData: any = await resp.json();
                      const fullTrans = Array.isArray(gData?.[0])
                        ? gData[0].map((p: any) => p?.[0] || '').join('')
                        : '';
                      const lines = fullTrans.split('\n').map((l: string) => l.trim());
                      for (let idx = 0; idx < batch.length; idx++) {
                        if (lines[idx]) batch[idx].text = lines[idx];
                      }
                    }
                  } catch {}
                })
              );

              const escapeXml = (s: string) =>
                s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              const xmlLines = cues.map(c => {
                const dur = Math.max(0.2, Math.round((c.end - c.start) * 1000) / 1000);
                return `<text start="${c.start.toFixed(3)}" dur="${dur.toFixed(3)}">${escapeXml(c.text)}</text>`;
              });
              rawSubContent = `<?xml version="1.0" encoding="utf-8" ?><transcript>${xmlLines.join('')}</transcript>`;
            }
          }
        } catch {}
      }
    }

    // Method 2: yt-dlp subtitle download & non-variant URL extraction fallback
    if (!rawSubContent && engine !== 'pytubefix') {
      try {
        const tempPrefix = path.join(os.tmpdir(), `ytsub_${Date.now()}`);
        const nodePath = process.execPath || '/usr/local/bin/node';
        const ytdlpArgs = [
          '-m', 'yt_dlp',
          '--skip-download',
          '--no-playlist',
          '--no-warnings',
          '--write-subs',
          '--write-auto-subs',
          '--sub-langs', lang,
          '--sub-format', 'vtt/srt/best',
          '-o', `${tempPrefix}.%(ext)s`
        ];
        if (fs.existsSync(nodePath)) {
          ytdlpArgs.push('--js-runtimes', `node:${nodePath}`);
        }
        if (vpn.isRunning) {
          ytdlpArgs.push('--proxy', vpn.httpProxy);
        }
        if (poTokenState.isRunning) {
          ytdlpArgs.push('--extractor-args', `youtubepot-bgutilhttp:base_url=http://127.0.0.1:${poTokenState.port}`);
        }
        ytdlpArgs.push(url);

        await execFileAsync('python3', ytdlpArgs, {
          timeout: 35000,
          env: { ...process.env, ...vpnEnv }
        });

        const tmpFiles = await fsPromises.readdir(os.tmpdir());
        const basePrefix = path.basename(tempPrefix);
        const matchFile = tmpFiles.find(f => f.startsWith(basePrefix));
        if (matchFile) {
          const fullTmpPath = path.join(os.tmpdir(), matchFile);
          const candidateContent = await fsPromises.readFile(fullTmpPath, 'utf-8');
          try { await fsPromises.unlink(fullTmpPath); } catch {}
          if (isValidSubtitlePayload(candidateContent)) {
            rawSubContent = candidateContent;
          }
        }
      } catch {}
    }

    // Method 3: pytubefix subtitle helper (uses primary non-variant caption track + tlang)
    if (!rawSubContent) {
      try {
        if (fs.existsSync(finalFilePath)) {
          try { await fsPromises.unlink(finalFilePath); } catch {}
        }
        const helperScript = path.join(process.cwd(), 'youtube_pytubefix_helper.py');
        const subQualityId = `sub_${isAuto ? 'auto' : 'manual'}_${lang}:${targetExt}`;
        await execFileAsync('python3', [
          helperScript,
          'download',
          url,
          subQualityId,
          'subtitle',
          YOUTUBE_DOWNLOADS_DIR,
          sanitizedTitle,
          poPort || 'none',
          vpn.isRunning ? vpn.httpProxy : 'none'
        ], {
          timeout: 35000,
          env: { ...process.env, ...vpnEnv }
        });

        if (fs.existsSync(finalFilePath)) {
          const ptContent = await fsPromises.readFile(finalFilePath, 'utf-8');
          if (isValidSubtitlePayload(ptContent)) {
            rawSubContent = ptContent;
          }
        }
      } catch {}
    }

    if (!rawSubContent || !rawSubContent.trim()) {
      return res.status(404).json({ error: 'محتوای زیرنویس برای این زبان یافت نشد یا قابل دریافت نیست' });
    }

    const convertedText = convertSubtitleContent(rawSubContent, targetExt);
    await fsPromises.writeFile(finalFilePath, convertedText, 'utf-8');
    const stat = await fsPromises.stat(finalFilePath);

    const jobId = `ytsub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const job: YouTubeDownloadJob = {
      id: jobId,
      title: title || 'YouTube Subtitle',
      url,
      qualityId: `sub_${lang}_${targetExt}`,
      formatLabel: `زیرنویس ${subtitleName || getSubtitleLangLabel(lang)} (${targetExt.toUpperCase()})`,
      type: 'subtitle',
      engine: engine === 'pytubefix' ? 'pytubefix' : 'ytdlp',
      vpnUsed: vpn.isRunning,
      vpnProxy: vpn.isRunning ? vpn.httpProxy : undefined,
      status: 'completed',
      progress: 100,
      speed: 'پایان',
      eta: 'تکمیل شد',
      totalSize: formatBytesHuman(stat.size),
      fileName: finalFileName,
      filePath: finalFilePath,
      createdAt: Date.now(),
      completedAt: Date.now()
    };

    youtubeDownloadJobs.set(jobId, job);

    res.json({
      success: true,
      jobId,
      job,
      fileName: finalFileName,
      totalSize: job.totalSize,
      content: convertedText,
      downloadUrl: `/api/youtube/download/file/${jobId}`
    });
  } catch (err: any) {
    console.error('Subtitle download error:', err);
    res.status(500).json({ error: 'خطا در دانلود زیرنویس: ' + (err.message || 'خطای ناشناخته') });
  }
});

// POST /api/youtube/download - Start background download job with selected engine
app.post('/api/youtube/download', async (req: Request, res: Response) => {
  try {
    const { 
      url, 
      qualityId = 'video_best', 
      type = 'video', 
      formatLabel = '', 
      title = 'YouTube_Video',
      engine = 'ytdlp'
    } = req.body || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'آدرس ویدیو نامعتبر است' });
    }

    const vpn = await getVpnProxyConfig();
    const jobId = `ytdl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const sanitizedTitle = (title || 'video').replace(/[^\w\s\u0600-\u06FF.-]/g, '_').substring(0, 60);

    const job: YouTubeDownloadJob = {
      id: jobId,
      title: title || 'YouTube Video',
      url,
      qualityId,
      formatLabel: formatLabel || qualityId,
      type: type === 'audio' ? 'audio' : type === 'subtitle' ? 'subtitle' : 'video',
      engine: engine === 'pytubefix' ? 'pytubefix' : 'ytdlp',
      vpnUsed: vpn.isRunning,
      vpnProxy: vpn.isRunning ? vpn.httpProxy : undefined,
      status: 'starting',
      progress: 0,
      speed: '0 KiB/s',
      eta: '--:--',
      totalSize: '',
      fileName: '',
      filePath: '',
      createdAt: Date.now()
    };

    youtubeDownloadJobs.set(jobId, job);

    const poPort = poTokenState.isRunning ? String(poTokenState.port) : '';
    const vpnEnv = vpn.isRunning ? {
      HTTP_PROXY: vpn.httpProxy,
      HTTPS_PROXY: vpn.httpProxy,
      ALL_PROXY: vpn.socksProxy,
      http_proxy: vpn.httpProxy,
      https_proxy: vpn.httpProxy,
      all_proxy: vpn.socksProxy
    } : {};

    let childArgs: string[] = [];

    if (engine === 'pytubefix') {
      // Use pytubefix helper
      const helperScript = path.join(process.cwd(), 'youtube_pytubefix_helper.py');
      childArgs = [
        helperScript, 
        'download', 
        url, 
        qualityId, 
        type, 
        YOUTUBE_DOWNLOADS_DIR, 
        sanitizedTitle,
        poPort || 'none',
        vpn.isRunning ? vpn.httpProxy : 'none'
      ];
    } else {
      // yt-dlp
      const nodePath = process.execPath || '/usr/local/bin/node';
      const outputTemplate = path.join(YOUTUBE_DOWNLOADS_DIR, `${sanitizedTitle}-%(id)s.%(ext)s`);

      childArgs = [
        '-m', 'yt_dlp',
        '--newline',
        '--no-playlist',
        '--no-warnings',
        '--js-runtimes', `node:${nodePath}`
      ];

      if (vpn.isRunning) {
        childArgs.push('--proxy', vpn.httpProxy);
      }

      if (poTokenState.isRunning) {
        childArgs.push('--extractor-args', `youtubepot-bgutilhttp:base_url=http://127.0.0.1:${poTokenState.port}`);
      }

      if (type === 'subtitle') {
        const subParts = qualityId.split(':');
        const subLang = subParts[0].replace('sub_manual_', '').replace('sub_auto_', '');
        const subExt = subParts[1] || 'srt';
        childArgs.push('--skip-download', '--write-subs', '--write-auto-subs', '--sub-langs', subLang, '--convert-subs', subExt);
      } else if (type === 'audio') {
        childArgs.push('-f', 'bestaudio/best', '-x');
        if (qualityId === 'audio_m4a') {
          childArgs.push('--audio-format', 'm4a');
        } else {
          childArgs.push('--audio-format', 'mp3');
          childArgs.push('--audio-quality', qualityId === 'audio_mp3_high' ? '0' : '5');
        }
      } else {
        // Video type
        const heightMatch = qualityId.match(/\d+/);
        const maxHeight = heightMatch ? heightMatch[0] : null;
        if (maxHeight) {
          childArgs.push('-f', `bestvideo[height<=${maxHeight}]+bestaudio/best[height<=${maxHeight}]/best`);
        } else {
          childArgs.push('-f', 'bestvideo+bestaudio/best');
        }
        childArgs.push('--merge-output-format', 'mp4');
      }

      childArgs.push('-o', outputTemplate, url);
    }

    const child = spawn('python3', childArgs, {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUNBUFFERED: '1', ...vpnEnv }
    });

    let stderrBuffer = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      const lines = text.split(/[\r\n]+/);
      for (const line of lines) {
        if (!line.trim()) continue;

        // Check progress
        // e.g. [download]  45.3% of ~  25.40MiB at   12.34MiB/s ETA 00:03
        const match = line.match(/\[download\]\s+([\d.]+)%\s+of\s+(?:~?\s*)?([\d.]+\s*[a-zA-Z]+)\s+at\s+([\d.]+\s*[a-zA-Z/]+)\s+ETA\s+([\d:]+)/);
        if (match) {
          job.status = 'downloading';
          job.progress = Math.min(Math.round(parseFloat(match[1]) * 10) / 10, 99.9);
          job.totalSize = match[2];
          job.speed = match[3];
          job.eta = match[4];
        }

        // Destination match
        if (line.includes('Destination:')) {
          const destMatch = line.match(/Destination:\s*(.+)/);
          if (destMatch && destMatch[1]) {
            const rawPath = destMatch[1].trim();
            job.filePath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
            job.fileName = path.basename(job.filePath);
          }
        }

        // Merger / conversion
        if (line.includes('[Merger]') || line.includes('[ExtractAudio]')) {
          job.status = 'converting';
          job.progress = 99.5;
          job.speed = 'انتقال و میکس';
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderrBuffer += chunk.toString();
      if (stderrBuffer.length > 5000) {
        stderrBuffer = stderrBuffer.slice(-5000);
      }
    });

    child.on('close', async (code) => {
      if (code === 0) {
        job.status = 'completed';
        job.progress = 100;
        job.completedAt = Date.now();
        job.eta = 'تکمیل شد';
        job.speed = 'پایان';

        // Ensure filePath and fileName are determined if not caught earlier
        if (!job.filePath || !fs.existsSync(job.filePath)) {
          try {
            const files = await fsPromises.readdir(YOUTUBE_DOWNLOADS_DIR);
            const matching = files
              .filter(f => !f.endsWith('.part') && !f.endsWith('.ytdl'))
              .map(f => ({ name: f, full: path.join(YOUTUBE_DOWNLOADS_DIR, f), time: fs.statSync(path.join(YOUTUBE_DOWNLOADS_DIR, f)).mtimeMs }))
              .sort((a, b) => b.time - a.time);

            if (matching.length > 0) {
              job.filePath = matching[0].full;
              job.fileName = matching[0].name;
              try {
                const stat = fs.statSync(job.filePath);
                job.totalSize = formatBytesHuman(stat.size);
              } catch {}
            }
          } catch {}
        }
      } else {
        job.status = 'error';
        job.error = stderrBuffer.trim().split('\n').pop() || `فرآیند دانلود با کد ${code} متوقف شد`;
      }
    });

    res.json({
      success: true,
      jobId,
      message: 'دانلود ویدیو با موفقیت شروع شد'
    });
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در شروع دانلود: ' + err.message });
  }
});

// GET /api/youtube/downloads - List all active/recent jobs
app.get('/api/youtube/downloads', (req: Request, res: Response) => {
  const jobs = Array.from(youtubeDownloadJobs.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 30);
  res.json({ jobs });
});

// GET /api/youtube/download/status/:id - Job status
app.get('/api/youtube/download/status/:id', (req: Request, res: Response) => {
  const job = youtubeDownloadJobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'وظیفه دانلود یافت نشد' });
  }
  res.json({ job });
});

// GET /api/youtube/download/file/:id - Stream/Direct download file
app.get('/api/youtube/download/file/:id', (req: Request, res: Response) => {
  const job = youtubeDownloadJobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'وظیفه دانلود یافت نشد' });
  }
  if (job.status !== 'completed' || !job.filePath || !fs.existsSync(job.filePath)) {
    return res.status(400).json({ error: 'فایل هنوز تکمیل نشده یا در سرور موجود نیست' });
  }

  res.download(job.filePath, job.fileName, (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: 'خطا در ارسال فایل: ' + err.message });
    }
  });
});

// DELETE /api/youtube/download/:id - Remove job & file
app.delete('/api/youtube/download/:id', async (req: Request, res: Response) => {
  const job = youtubeDownloadJobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'آیتم مورد نظر یافت نشد' });
  }

  if (job.filePath && fs.existsSync(job.filePath)) {
    try {
      await fsPromises.unlink(job.filePath);
    } catch {}
  }
  youtubeDownloadJobs.delete(req.params.id);
  res.json({ success: true, message: 'فایل با موفقیت حذف شد' });
});

// ---------------------- INSTAGRAM (AIOGRAPI) MANAGER API ----------------------
const INSTAGRAM_ACCOUNTS_DIR = path.join(process.cwd(), 'instagram_accounts');
const INSTAGRAM_ACTIVE_SESSION_PATH = path.join(process.cwd(), 'instagram_session.json');
const INSTAGRAM_ACTIVE_INFO_PATH = path.join(process.cwd(), 'instagram_page_info.json');
const INSTAGRAM_ACTIVE_COOKIES_PATH = path.join(process.cwd(), 'cookies.txt');

if (!fs.existsSync(INSTAGRAM_ACCOUNTS_DIR)) {
  try { fs.mkdirSync(INSTAGRAM_ACCOUNTS_DIR, { recursive: true }); } catch {}
}

function sanitizeIgUsername(u: string): string {
  const clean = String(u || '').trim().replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  return clean || 'default_account';
}

function runInstagramHelper(action: string, payload: Record<string, any>, vpnEnv: Record<string, string> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const helperPath = path.join(process.cwd(), 'instagram_aiograpi_helper.py');
    const child = spawn('python3', [helperPath, action], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUNBUFFERED: '1', ...vpnEnv }
    });

    let stdoutData = '';
    let stderrData = '';

    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      reject(new Error('زمان پاسخگویی سرویس اینستاگرام (aiograpi) به پایان رسید (Timeout)'));
    }, 90000);

    child.stdout.on('data', (chunk) => {
      stdoutData += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const trimmed = stdoutData.trim();
      if (trimmed) {
        const lines = trimmed.split(/\r?\n/);
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (line.startsWith('{') && line.endsWith('}')) {
            try {
              return resolve(JSON.parse(line));
            } catch {}
          }
        }
        try {
          return resolve(JSON.parse(trimmed));
        } catch {}
      }
      reject(new Error(stderrData.trim() || `Process exited with code ${code}`));
    });

    try {
      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}

async function syncRootSessionIntoAccountsIfNeeded() {
  try {
    if (!fs.existsSync(INSTAGRAM_ACTIVE_SESSION_PATH)) return;
    const rawSess = await fsPromises.readFile(INSTAGRAM_ACTIVE_SESSION_PATH, 'utf-8');
    const sessObj = JSON.parse(rawSess);
    let pageInfoObj: any = {};
    if (fs.existsSync(INSTAGRAM_ACTIVE_INFO_PATH)) {
      try {
        pageInfoObj = JSON.parse(await fsPromises.readFile(INSTAGRAM_ACTIVE_INFO_PATH, 'utf-8'));
      } catch {}
    }
    const dsUserId = sessObj?.authorization_data?.ds_user_id || '';
    const uname = sanitizeIgUsername(pageInfoObj?.username || (dsUserId ? `user_${dsUserId}` : 'active_account'));
    const accDir = path.join(INSTAGRAM_ACCOUNTS_DIR, uname);
    const accSessPath = path.join(accDir, 'instagram_session.json');

    if (!fs.existsSync(accSessPath)) {
      await fsPromises.mkdir(accDir, { recursive: true });
      await fsPromises.writeFile(accSessPath, JSON.stringify(sessObj, null, 4), 'utf-8');
      if (Object.keys(pageInfoObj).length > 0) {
        await fsPromises.writeFile(path.join(accDir, 'instagram_page_info.json'), JSON.stringify(pageInfoObj, null, 2), 'utf-8');
      } else {
        const defaultInfo = {
          username: uname,
          full_name: '',
          biography: '',
          follower_count: 0,
          following_count: 0,
          media_count: 0,
          is_verified: false,
          profile_pic_url: '',
          cached_at: new Date().toISOString()
        };
        await fsPromises.writeFile(path.join(accDir, 'instagram_page_info.json'), JSON.stringify(defaultInfo, null, 2), 'utf-8');
      }
      if (fs.existsSync(INSTAGRAM_ACTIVE_COOKIES_PATH)) {
        const rawCookies = await fsPromises.readFile(INSTAGRAM_ACTIVE_COOKIES_PATH, 'utf-8');
        await fsPromises.writeFile(path.join(accDir, 'cookies.txt'), rawCookies, 'utf-8');
      }
    }
  } catch {}
}

// GET /api/instagram/accounts - List all saved accounts, active session status, and device presets
app.get('/api/instagram/accounts', async (req: Request, res: Response) => {
  try {
    await syncRootSessionIntoAccountsIfNeeded();
    const vpn = await getVpnProxyConfig();

    let activeDsUserId = '';
    let activeUsername = '';
    if (fs.existsSync(INSTAGRAM_ACTIVE_SESSION_PATH)) {
      try {
        const activeSess = JSON.parse(await fsPromises.readFile(INSTAGRAM_ACTIVE_SESSION_PATH, 'utf-8'));
        activeDsUserId = String(activeSess?.authorization_data?.ds_user_id || '');
      } catch {}
    }
    if (fs.existsSync(INSTAGRAM_ACTIVE_INFO_PATH)) {
      try {
        const activeInfo = JSON.parse(await fsPromises.readFile(INSTAGRAM_ACTIVE_INFO_PATH, 'utf-8'));
        activeUsername = sanitizeIgUsername(activeInfo?.username || '');
      } catch {}
    }

    const entries = fs.existsSync(INSTAGRAM_ACCOUNTS_DIR)
      ? await fsPromises.readdir(INSTAGRAM_ACCOUNTS_DIR, { withFileTypes: true })
      : [];

    const accounts: any[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folderName = entry.name;
      const accDir = path.join(INSTAGRAM_ACCOUNTS_DIR, folderName);
      const sessFile = path.join(accDir, 'instagram_session.json');
      const infoFile = path.join(accDir, 'instagram_page_info.json');
      const cookiesFile = path.join(accDir, 'cookies.txt');

      if (!fs.existsSync(sessFile)) continue;

      try {
        const sessionObj = JSON.parse(await fsPromises.readFile(sessFile, 'utf-8'));
        let pageInfoObj: any = {
          username: folderName,
          full_name: '',
          biography: '',
          follower_count: 0,
          following_count: 0,
          media_count: 0,
          is_verified: false,
          profile_pic_url: '',
          cached_at: new Date().toISOString()
        };
        if (fs.existsSync(infoFile)) {
          try {
            pageInfoObj = { ...pageInfoObj, ...JSON.parse(await fsPromises.readFile(infoFile, 'utf-8')) };
          } catch {}
        }

        let cookiesTxt = '';
        if (fs.existsSync(cookiesFile)) {
          try {
            cookiesTxt = await fsPromises.readFile(cookiesFile, 'utf-8');
          } catch {}
        }

        const dsUserId = String(sessionObj?.authorization_data?.ds_user_id || '');
        const uname = pageInfoObj.username || folderName;
        const isActive =
          (activeUsername && sanitizeIgUsername(uname) === activeUsername) ||
          (activeDsUserId && dsUserId && activeDsUserId === dsUserId);

        accounts.push({
          id: folderName,
          username: uname,
          isActive: Boolean(isActive),
          pageInfo: pageInfoObj,
          session: sessionObj,
          cookiesTxt,
          hasCookiesTxt: Boolean(cookiesTxt.trim()),
          summary: {
            dsUserId,
            model: sessionObj?.device_settings?.model || 'Pixel 8 Pro',
            manufacturer: sessionObj?.device_settings?.manufacturer || 'Google/google',
            device: sessionObj?.device_settings?.device || 'husky',
            androidVersion: sessionObj?.device_settings?.android_version || 34,
            androidRelease: sessionObj?.device_settings?.android_release || '14',
            appVersion: sessionObj?.device_settings?.app_version || '428.0.0.47.67',
            locale: sessionObj?.locale || 'en_US',
            country: sessionObj?.country || 'US',
            lastLogin: sessionObj?.last_login || null,
            userAgent: sessionObj?.user_agent || ''
          },
          files: {
            accountSessionPath: sessFile,
            accountPageInfoPath: infoFile,
            accountCookiesPath: cookiesFile,
            rootSessionPath: INSTAGRAM_ACTIVE_SESSION_PATH,
            rootPageInfoPath: INSTAGRAM_ACTIVE_INFO_PATH,
            rootCookiesPath: INSTAGRAM_ACTIVE_COOKIES_PATH
          }
        });
      } catch {}
    }

    // Sort active first, then by lastLogin desc
    accounts.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return (b.summary?.lastLogin || 0) - (a.summary?.lastLogin || 0);
    });

    res.json({
      success: true,
      accounts,
      activeUsername: accounts.find(a => a.isActive)?.username || null,
      vpnActive: vpn.isRunning,
      httpProxy: vpn.httpProxy,
      socksProxy: vpn.socksProxy,
      rootFilesExist: {
        session: fs.existsSync(INSTAGRAM_ACTIVE_SESSION_PATH),
        pageInfo: fs.existsSync(INSTAGRAM_ACTIVE_INFO_PATH),
        cookies: fs.existsSync(INSTAGRAM_ACTIVE_COOKIES_PATH)
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در دریافت لیست اکانت‌های اینستاگرام: ' + err.message });
  }
});

// POST /api/instagram/login - Login with username/password (+ 2FA / TOTP seed / Challenge code) via aiograpi
app.post('/api/instagram/login', async (req: Request, res: Response) => {
  try {
    const {
      username,
      password,
      verification_code = '',
      totp_seed = '',
      device_profile = 'pixel_9_pro_xl_a15',
      app_version = '448.0.0.0.20',
      use_vpn = true,
      custom_proxy = '',
      force_new_device = false
    } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است' });
    }

    const vpn = await getVpnProxyConfig();
    let effectiveProxy = '';
    if (custom_proxy && String(custom_proxy).trim()) {
      effectiveProxy = String(custom_proxy).trim();
    } else if (use_vpn && vpn.isRunning) {
      effectiveProxy = vpn.httpProxy;
    }

    const vpnEnv = effectiveProxy ? {
      HTTP_PROXY: effectiveProxy,
      HTTPS_PROXY: effectiveProxy,
      http_proxy: effectiveProxy,
      https_proxy: effectiveProxy
    } : {};

    const result = await runInstagramHelper('login', {
      username,
      password,
      verification_code,
      totp_seed,
      device_profile,
      app_version,
      proxy: effectiveProxy,
      force_new_device
    }, vpnEnv);

    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'خطا در فرآیند ورود با aiograpi: ' + (err.message || 'خطای ناشناخته')
    });
  }
});

// POST /api/instagram/login-sessionid - Login with Instagram sessionid via aiograpi
app.post('/api/instagram/login-sessionid', async (req: Request, res: Response) => {
  try {
    const {
      sessionid,
      username = '',
      device_profile = 'pixel_9_pro_xl_a15',
      app_version = '448.0.0.0.20',
      use_vpn = true,
      custom_proxy = ''
    } = req.body || {};

    if (!sessionid || String(sessionid).trim().length < 20) {
      return res.status(400).json({ error: 'مقدار sessionid معتبر نیست' });
    }

    const vpn = await getVpnProxyConfig();
    const effectiveProxy = (custom_proxy && String(custom_proxy).trim())
      ? String(custom_proxy).trim()
      : (use_vpn && vpn.isRunning ? vpn.httpProxy : '');

    const result = await runInstagramHelper('login_sessionid', {
      sessionid: String(sessionid).trim(),
      username: String(username).trim(),
      device_profile,
      app_version,
      proxy: effectiveProxy
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'خطا در ورود با SessionID: ' + (err.message || 'خطای ناشناخته')
    });
  }
});

// POST /api/instagram/import-session - Import existing instagram_session.json (& optional instagram_page_info.json)
app.post('/api/instagram/import-session', async (req: Request, res: Response) => {
  try {
    const {
      session,
      page_info = null,
      username = '',
      use_vpn = true,
      custom_proxy = ''
    } = req.body || {};

    if (!session) {
      return res.status(400).json({ error: 'محتوای فایل instagram_session.json الزامی است' });
    }

    const vpn = await getVpnProxyConfig();
    const effectiveProxy = (custom_proxy && String(custom_proxy).trim())
      ? String(custom_proxy).trim()
      : (use_vpn && vpn.isRunning ? vpn.httpProxy : '');

    const result = await runInstagramHelper('import_session', {
      session,
      page_info,
      username,
      proxy: effectiveProxy
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'خطا در وارد کردن سشن: ' + (err.message || 'خطای ناشناخته')
    });
  }
});

// POST /api/instagram/activate/:username - Set account as active (writes root instagram_session.json, instagram_page_info.json, cookies.txt)
app.post('/api/instagram/activate/:username', async (req: Request, res: Response) => {
  try {
    const uname = sanitizeIgUsername(req.params.username);
    const accDir = path.join(INSTAGRAM_ACCOUNTS_DIR, uname);
    const sessFile = path.join(accDir, 'instagram_session.json');
    const infoFile = path.join(accDir, 'instagram_page_info.json');
    const cookiesFile = path.join(accDir, 'cookies.txt');

    if (!fs.existsSync(sessFile)) {
      return res.status(404).json({ error: 'سشن اکانت مورد نظر یافت نشد' });
    }

    await fsPromises.copyFile(sessFile, INSTAGRAM_ACTIVE_SESSION_PATH);
    if (fs.existsSync(infoFile)) {
      await fsPromises.copyFile(infoFile, INSTAGRAM_ACTIVE_INFO_PATH);
    }
    if (fs.existsSync(cookiesFile)) {
      await fsPromises.copyFile(cookiesFile, INSTAGRAM_ACTIVE_COOKIES_PATH);
    }

    const tbDir = path.join(process.cwd(), 'telegram_bot');
    if (fs.existsSync(tbDir)) {
      try {
        await fsPromises.copyFile(sessFile, path.join(tbDir, 'instagram_session.json'));
        if (fs.existsSync(infoFile)) {
          await fsPromises.copyFile(infoFile, path.join(tbDir, 'instagram_page_info.json'));
        }
        if (fs.existsSync(cookiesFile)) {
          await fsPromises.copyFile(cookiesFile, path.join(tbDir, 'cookies.txt'));
        }
      } catch {}
    }

    res.json({
      success: true,
      username: uname,
      message: `اکانت @${uname} به عنوان سشن اصلی (instagram_session.json و instagram_page_info.json) فعال شد.`
    });
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در فعال‌سازی سشن: ' + err.message });
  }
});

// POST /api/instagram/verify/:username - Verify session validity and refresh instagram_page_info.json via aiograpi
app.post('/api/instagram/verify/:username', async (req: Request, res: Response) => {
  try {
    const uname = sanitizeIgUsername(req.params.username);
    const vpn = await getVpnProxyConfig();
    const effectiveProxy = vpn.isRunning ? vpn.httpProxy : '';

    const result = await runInstagramHelper('verify', {
      username: uname,
      proxy: effectiveProxy
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'خطا در بررسی وضعیت سشن: ' + err.message
    });
  }
});

// POST /api/instagram/extract-cookies/:username - Generate and save Netscape cookies.txt from session
app.post('/api/instagram/extract-cookies/:username', async (req: Request, res: Response) => {
  try {
    const uname = sanitizeIgUsername(req.params.username);
    const vpn = await getVpnProxyConfig();
    const effectiveProxy = vpn.isRunning ? vpn.httpProxy : '';

    const result = await runInstagramHelper('extract_cookies', {
      username: uname,
      proxy: effectiveProxy
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'خطا در استخراج فایل cookies.txt: ' + err.message
    });
  }
});

// GET /api/instagram/download/:username/:fileType - Download instagram_session.json, instagram_page_info.json, or cookies.txt
app.get('/api/instagram/download/:username/:fileType', async (req: Request, res: Response) => {
  try {
    const uname = sanitizeIgUsername(req.params.username);
    const fileType = req.params.fileType;
    const accDir = path.join(INSTAGRAM_ACCOUNTS_DIR, uname);

    let targetPath = '';
    let downloadName = '';

    if (fileType === 'session') {
      targetPath = path.join(accDir, 'instagram_session.json');
      if (!fs.existsSync(targetPath)) targetPath = INSTAGRAM_ACTIVE_SESSION_PATH;
      downloadName = 'instagram_session.json';
    } else if (fileType === 'page_info') {
      targetPath = path.join(accDir, 'instagram_page_info.json');
      if (!fs.existsSync(targetPath)) targetPath = INSTAGRAM_ACTIVE_INFO_PATH;
      downloadName = 'instagram_page_info.json';
    } else if (fileType === 'cookies') {
      targetPath = path.join(accDir, 'cookies.txt');
      if (!fs.existsSync(targetPath)) {
        // Generate on the fly if missing
        await runInstagramHelper('extract_cookies', { username: uname });
      }
      if (!fs.existsSync(targetPath)) targetPath = INSTAGRAM_ACTIVE_COOKIES_PATH;
      downloadName = 'cookies.txt';
    } else {
      return res.status(400).json({ error: 'نوع فایل درخواستی نامعتبر است' });
    }

    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: `فایل ${downloadName} یافت نشد` });
    }

    const content = await fsPromises.readFile(targetPath, 'utf-8');
    res.setHeader('Content-Type', fileType === 'cookies' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(200).send(content);
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در دانلود فایل: ' + err.message });
  }
});

// DELETE /api/instagram/accounts/:username - Delete saved account and its session files
app.delete('/api/instagram/accounts/:username', async (req: Request, res: Response) => {
  try {
    const uname = sanitizeIgUsername(req.params.username);
    const accDir = path.join(INSTAGRAM_ACCOUNTS_DIR, uname);

    let wasActive = false;
    if (fs.existsSync(INSTAGRAM_ACTIVE_INFO_PATH)) {
      try {
        const activeInfo = JSON.parse(await fsPromises.readFile(INSTAGRAM_ACTIVE_INFO_PATH, 'utf-8'));
        if (sanitizeIgUsername(activeInfo?.username || '') === uname) {
          wasActive = true;
        }
      } catch {}
    }

    if (fs.existsSync(accDir)) {
      await fsPromises.rm(accDir, { recursive: true, force: true });
    }

    if (wasActive) {
      for (const f of [INSTAGRAM_ACTIVE_SESSION_PATH, INSTAGRAM_ACTIVE_INFO_PATH, INSTAGRAM_ACTIVE_COOKIES_PATH]) {
        if (fs.existsSync(f)) {
          try { await fsPromises.unlink(f); } catch {}
        }
      }
      // If another account exists, promote the first available one to active
      const remaining = fs.existsSync(INSTAGRAM_ACCOUNTS_DIR)
        ? await fsPromises.readdir(INSTAGRAM_ACCOUNTS_DIR, { withFileTypes: true })
        : [];
      for (const entry of remaining) {
        if (entry.isDirectory()) {
          const nextDir = path.join(INSTAGRAM_ACCOUNTS_DIR, entry.name);
          const nextSess = path.join(nextDir, 'instagram_session.json');
          const nextInfo = path.join(nextDir, 'instagram_page_info.json');
          const nextCookies = path.join(nextDir, 'cookies.txt');
          if (fs.existsSync(nextSess)) {
            await fsPromises.copyFile(nextSess, INSTAGRAM_ACTIVE_SESSION_PATH);
            if (fs.existsSync(nextInfo)) await fsPromises.copyFile(nextInfo, INSTAGRAM_ACTIVE_INFO_PATH);
            if (fs.existsSync(nextCookies)) await fsPromises.copyFile(nextCookies, INSTAGRAM_ACTIVE_COOKIES_PATH);
            break;
          }
        }
      }
    }

    res.json({
      success: true,
      message: `سشن و اطلاعات اکانت @${uname} با موفقیت حذف شد.`
    });
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در حذف سشن: ' + err.message });
  }
});

// POST /api/instagram/downloader/extract - Extract Post, Reel, Carousel, Video, or Story media
app.post('/api/instagram/downloader/extract', async (req: Request, res: Response) => {
  try {
    const { url, account } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'آدرس لینک اینستاگرام الزامی است.' });
    }
    const vpn = await getVpnProxyConfig();
    const vpnEnv: Record<string, string> = {};
    if (vpn.isRunning && vpn.httpProxy) {
      vpnEnv.HTTP_PROXY = vpn.httpProxy;
      vpnEnv.HTTPS_PROXY = vpn.httpProxy;
      vpnEnv.http_proxy = vpn.httpProxy;
      vpnEnv.https_proxy = vpn.httpProxy;
    }
    const result = await runInstagramHelper(
      'extract_media',
      {
        url: url.trim(),
        account: typeof account === 'string' ? account.trim() : undefined,
        proxy: vpn.isRunning ? vpn.httpProxy : ''
      },
      vpnEnv
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'خطا در استخراج مدیا از اینستاگرام' });
  }
});

// POST /api/instagram/downloader/profile - Fetch Instagram Page / Profile Info & Stats
app.post('/api/instagram/downloader/profile', async (req: Request, res: Response) => {
  try {
    const { username, account } = req.body || {};
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'نام کاربری یا آیدی پیج الزامی است.' });
    }
    const vpn = await getVpnProxyConfig();
    const vpnEnv: Record<string, string> = {};
    if (vpn.isRunning && vpn.httpProxy) {
      vpnEnv.HTTP_PROXY = vpn.httpProxy;
      vpnEnv.HTTPS_PROXY = vpn.httpProxy;
      vpnEnv.http_proxy = vpn.httpProxy;
      vpnEnv.https_proxy = vpn.httpProxy;
    }
    const result = await runInstagramHelper(
      'fetch_profile',
      {
        username: username.trim(),
        account: typeof account === 'string' ? account.trim() : undefined,
        proxy: vpn.isRunning ? vpn.httpProxy : ''
      },
      vpnEnv
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'خطا در استعلام اطلاعات پیج اینستاگرام' });
  }
});

// POST /api/instagram/downloader/stories - Fetch active 24h stories
app.post('/api/instagram/downloader/stories', async (req: Request, res: Response) => {
  try {
    const { username, account } = req.body || {};
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'نام کاربری پیج الزامی است.' });
    }
    const vpn = await getVpnProxyConfig();
    const vpnEnv: Record<string, string> = {};
    if (vpn.isRunning && vpn.httpProxy) {
      vpnEnv.HTTP_PROXY = vpn.httpProxy;
      vpnEnv.HTTPS_PROXY = vpn.httpProxy;
      vpnEnv.http_proxy = vpn.httpProxy;
      vpnEnv.https_proxy = vpn.httpProxy;
    }
    const result = await runInstagramHelper(
      'fetch_stories',
      {
        username: username.trim(),
        account: typeof account === 'string' ? account.trim() : undefined,
        proxy: vpn.isRunning ? vpn.httpProxy : ''
      },
      vpnEnv
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'خطا در دریافت استوری‌های اینستاگرام' });
  }
});

// POST /api/instagram/downloader/highlights - Fetch story highlights albums
app.post('/api/instagram/downloader/highlights', async (req: Request, res: Response) => {
  try {
    const { username, account } = req.body || {};
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'نام کاربری یا آیدی پیج الزامی است.' });
    }
    const vpn = await getVpnProxyConfig();
    const vpnEnv: Record<string, string> = {};
    if (vpn.isRunning && vpn.httpProxy) {
      vpnEnv.HTTP_PROXY = vpn.httpProxy;
      vpnEnv.HTTPS_PROXY = vpn.httpProxy;
      vpnEnv.http_proxy = vpn.httpProxy;
      vpnEnv.https_proxy = vpn.httpProxy;
    }
    const result = await runInstagramHelper(
      'fetch_highlights',
      {
        username: username.trim(),
        account: typeof account === 'string' ? account.trim() : undefined,
        proxy: vpn.isRunning ? vpn.httpProxy : ''
      },
      vpnEnv
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'خطا در استخراج هایلایت‌های اینستاگرام' });
  }
});

// POST /api/instagram/downloader/highlight-items - Fetch story items of a specific highlight
app.post('/api/instagram/downloader/highlight-items', async (req: Request, res: Response) => {
  try {
    const { highlight_pk, account } = req.body || {};
    if (!highlight_pk || typeof highlight_pk !== 'string') {
      return res.status(400).json({ error: 'شناسه هایلایت الزامی است.' });
    }
    const vpn = await getVpnProxyConfig();
    const vpnEnv: Record<string, string> = {};
    if (vpn.isRunning && vpn.httpProxy) {
      vpnEnv.HTTP_PROXY = vpn.httpProxy;
      vpnEnv.HTTPS_PROXY = vpn.httpProxy;
      vpnEnv.http_proxy = vpn.httpProxy;
      vpnEnv.https_proxy = vpn.httpProxy;
    }
    const result = await runInstagramHelper(
      'fetch_highlight_items',
      {
        highlight_pk: highlight_pk.trim(),
        account: typeof account === 'string' ? account.trim() : undefined,
        proxy: vpn.isRunning ? vpn.httpProxy : ''
      },
      vpnEnv
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'خطا در استعلام موارد هایلایت' });
  }
});

// POST /api/instagram/downloader/download-file - Download media directly to server disk
app.post('/api/instagram/downloader/download-file', async (req: Request, res: Response) => {
  try {
    const { url, filename, type } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'آدرس مدیا الزامی است.' });
    }
    const vpn = await getVpnProxyConfig();
    const vpnEnv: Record<string, string> = {};
    if (vpn.isRunning && vpn.httpProxy) {
      vpnEnv.HTTP_PROXY = vpn.httpProxy;
      vpnEnv.HTTPS_PROXY = vpn.httpProxy;
      vpnEnv.http_proxy = vpn.httpProxy;
      vpnEnv.https_proxy = vpn.httpProxy;
    }
    const result = await runInstagramHelper(
      'download_file',
      {
        url: url.trim(),
        filename: typeof filename === 'string' ? filename.trim() : undefined,
        type: typeof type === 'string' ? type.trim() : 'video',
        proxy: vpn.isRunning ? vpn.httpProxy : ''
      },
      vpnEnv
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'خطا در ذخیره فایل مدیا' });
  }
});

// GET /api/instagram/downloader/file/:filename - Direct download of saved Instagram media
app.get('/api/instagram/downloader/file/:filename', async (req: Request, res: Response) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(process.cwd(), 'downloads', filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'فایل مورد نظر یافت نشد.' });
    }
    res.download(filePath, filename);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/instagram/avatar-proxy - Proxy Instagram CDN profile pictures to avoid CORP/CORS browser blocks
app.get('/api/instagram/avatar-proxy', async (req: Request, res: Response) => {
  try {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl || !rawUrl.startsWith('http')) {
      return res.status(400).end();
    }
    const vpn = await getVpnProxyConfig();
    const curlArgs = ['-sSL', '--max-time', '15', '-A', 'Mozilla/5.0'];
    if (vpn.isRunning && vpn.httpProxy) {
      curlArgs.push('-x', vpn.httpProxy);
    }
    curlArgs.push(rawUrl);

    const { stdout } = await execFileAsync('curl', curlArgs, {
      encoding: 'buffer' as any,
      maxBuffer: 20 * 1024 * 1024
    });

    if (stdout && stdout.length > 50) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(stdout);
    }
    res.status(404).end();
  } catch {
    res.status(404).end();
  }
});

// GET /api/instagram/media-proxy - Stream / proxy Instagram video & image URLs to browser
app.get('/api/instagram/media-proxy', async (req: Request, res: Response) => {
  try {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl || !rawUrl.startsWith('http')) {
      return res.status(400).end();
    }
    const vpn = await getVpnProxyConfig();
    const curlArgs = ['-sSL', '--max-time', '30', '-A', 'Mozilla/5.0'];
    if (vpn.isRunning && vpn.httpProxy) {
      curlArgs.push('-x', vpn.httpProxy);
    }
    curlArgs.push(rawUrl);

    const isVideo = rawUrl.includes('.mp4') || String(req.query.type || '') === 'video';
    const { stdout } = await execFileAsync('curl', curlArgs, {
      encoding: 'buffer' as any,
      maxBuffer: 150 * 1024 * 1024
    });

    if (stdout && stdout.length > 50) {
      res.setHeader('Content-Type', isVideo ? 'video/mp4' : 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      if (req.query.download === '1') {
        const ext = isVideo ? 'mp4' : 'jpg';
        const name = String(req.query.name || `instagram_media_${Date.now()}.${ext}`);
        res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      }
      return res.send(stdout);
    }
    res.status(404).end();
  } catch {
    res.status(404).end();
  }
});

// 404 Handler for /api routes to prevent falling through to Vite SPA index.html
app.use('/api/*', (req: Request, res: Response) => {
  res.status(404).json({ error: `API endpoint ${req.originalUrl} not found` });
});

// ---------------------- VITE & PRODUCTION HANDLER ----------------------
// Auto-verify and install prerequisites on server startup/deployment
async function ensurePrerequisitesOnBoot() {
  try {
    const homeDir = os.homedir() || '/root';
    const denoBinDir = path.join(homeDir, '.deno', 'bin');
    if (!(process.env.PATH || '').includes(denoBinDir)) {
      process.env.DENO_INSTALL = path.join(homeDir, '.deno');
      process.env.PATH = `${denoBinDir}:/root/.deno/bin:${process.env.PATH || ''}:/usr/local/bin`;
    }

    const downloadsDir = path.join(process.cwd(), 'downloads');
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }

    // Ensure Deno is installed and linked to /usr/local/bin/deno
    exec('deno --version', (denoErr) => {
      if (denoErr) {
        console.log('[Prerequisites] Deno not found. Auto-installing Deno...');
        exec('curl -fsSL https://deno.land/install.sh | sh && ln -sf "$HOME/.deno/bin/deno" /usr/local/bin/deno', (installDenoErr) => {
          if (installDenoErr) {
            console.error('[Prerequisites] Deno auto-install warning:', installDenoErr.message);
          } else {
            console.log('[Prerequisites] Deno installed successfully.');
          }
        });
      } else {
        console.log('[Prerequisites] Deno verified.');
      }
    });

    // Quick check if python packages (yt-dlp, pytubefix, aiograpi) are present
    exec('python3 -c "import yt_dlp, pytubefix, aiograpi"', (err) => {
      if (err) {
        console.log('[Prerequisites] Missing Python modules (yt-dlp/pytubefix/aiograpi) detected. Auto-installing...');
        const installCmd = 'python3 -m pip install --no-cache-dir --break-system-packages yt-dlp pytubefix bgutil-ytdlp-pot-provider aiograpi instagrapi curl-cffi Pillow || pip3 install --no-cache-dir --break-system-packages yt-dlp pytubefix bgutil-ytdlp-pot-provider aiograpi instagrapi curl-cffi Pillow || (curl -sS https://bootstrap.pypa.io/get-pip.py | python3 - --break-system-packages && python3 -m pip install --no-cache-dir --break-system-packages yt-dlp pytubefix bgutil-ytdlp-pot-provider aiograpi instagrapi curl-cffi Pillow)';
        exec(installCmd, (installErr) => {
          if (installErr) {
            console.error('[Prerequisites] Auto-install warning:', installErr.message);
          } else {
            console.log('[Prerequisites] Core Python packages (yt-dlp, pytubefix, aiograpi) installed successfully.');
          }
        });
      } else {
        console.log('[Prerequisites] Core Python packages (yt-dlp, pytubefix, aiograpi) verified.');
      }
    });
  } catch (e: any) {
    console.warn('[Prerequisites] Boot verification skipped:', e.message);
  }
}

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
    // Auto-verify and install prerequisites on startup
    ensurePrerequisitesOnBoot();
    // Only launch PO Token server if explicitly enabled in config (default is false/off)
    if (poTokenState.desiredRunning) {
      startPoTokenServer();
    } else {
      addPoTokenLog('سرویس PO Token در حالت پیش‌فرض خاموش است.');
    }
  });
}

startServer();
