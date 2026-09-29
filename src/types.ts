export type Language = 'fa' | 'en';
export type ThemeMode = 'dark' | 'light';

export interface User {
  username: string;
  role: string;
  loginTime: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
}

export interface RailwayProjectUsage {
  id: string;
  name: string;
  cpuUsage: number;
  memoryUsageGb: number;
  diskUsageGb: number;
  networkRxGb: number;
  networkTxGb: number;
  ephemeralDiskUsageGb: number;
  backupUsageGb: number;
}

export interface RailwayInfo {
  account: string;
  email?: string;
  workspaceId: string;
  workspaceName: string;
  plan: string;
  periodStart: string;
  periodEnd: string;
  daysLeft: number;
  spent: number;
  creditBalance: number;
  left: number;
  hardCap: string;
  softLimit?: number | null;
  isOverLimit?: boolean;
  hasExhaustedFreePlan?: boolean;
  state?: string;
  planLimitText: string;
  planLimits?: {
    projects?: number;
    cpu?: number;
    ramMB?: string;
    diskMB?: string;
    volMB?: string;
    includedUsageDollars?: number;
  };
  projects: RailwayProjectUsage[];
  formattedText: string;
  fetchedAt: string;
}

export interface SystemMetrics {
  timestamp: number;
  cpuPercent: number;
  cpuCores: number;
  cpuModel: string;
  ramTotalMB: number;
  ramUsedMB: number;
  ramFreeMB: number;
  ramPercent: number;
  diskTotalGB: number;
  diskUsedGB: number;
  diskFreeGB: number;
  diskUsedMB?: number;
  diskPercent: number;
  netRxKbps: number;
  netTxKbps: number;
  uptimeSeconds: number;
  platform: string;
  hostname: string;
  loadAvg: number[];
  isContainer?: boolean;
  containerInfo?: string;
  railwayConfigured?: boolean;
  railwayInfo?: RailwayInfo | null;
  railwayError?: string | null;
}

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  permissions: string;
  modifiedAt: string;
  extension?: string;
}

export interface BackgroundTask {
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

export interface SystemProcess {
  pid: number;
  user: string;
  cpu: number;
  mem: number;
  vsz: string;
  rss: string;
  tty: string;
  stat: string;
  time: string;
  command: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  source: string;
  message: string;
}

export interface TerminalHistoryItem {
  id: string;
  command: string;
  output: string;
  cwd: string;
  timestamp: string;
  exitCode?: number;
  isRunning?: boolean;
}

export interface TerminalTab {
  id: string;
  title: string;
  cwd: string;
  history: TerminalHistoryItem[];
  command: string;
  isExecuting: boolean;
  currentProcessId: string | null;
  executedCommandsList: string[];
  commandHistoryIndex: number;
  autoScroll: boolean;
}

export interface TelegramBotConfig {
  bot_token: string;
  admin_user_id: number | string;
}

export interface TelegramBotStatus {
  isRunning: boolean;
  pid?: number;
  startedAt?: string;
  logs: string[];
  configValid?: boolean;
}

