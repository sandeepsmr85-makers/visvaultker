export enum AutomationStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  category?: string;
}

export interface Step {
  id: string;
  action: 'GOTO' | 'ACT' | 'EXTRACT' | 'OBSERVE';
  description: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  data?: any;
}

export interface ClientConfig {
  apiEndpoint: string;
  modelName: string;
  actualModelName: string;
  apiKey?: string;
}

export const DEFAULT_CONFIG: ClientConfig = {
  apiEndpoint: "https://api.custom-llm-provider.com/v1",
  modelName: "gpt-4o",
  actualModelName: "gpt-4-1-2025-04-14-eastus-dz",
};