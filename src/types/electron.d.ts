export interface PlanlyAccount {
  id: string;
  name: string;
  teamId: string;
  token: string;
  createdAt: string;
  lastUsed?: string;
}

export interface ElectronAPI {
  connectPlanly: (params: {
    token: string;
    teamId: string;
    accountName?: string;
    accountId?: string;
  } | string, teamId?: string) => Promise<{
    success: boolean;
    accountId?: string;
    accountName?: string;
    channels?: any[];
    data?: any[]; // backward compatibility
    error?: string;
  }>;

  disconnectPlanly: (accountId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
  
  selectVideoFolder: () => Promise<{
    success: boolean;
    path?: string;
    files?: string[];
    error?: string;
  }>;
  
  uploadVideo: (params: {
    channelId: string;
    videoPath: string;
    scheduledDate: string;
    title: string;
  }) => Promise<{
    success: boolean;
    error?: string;
  }>;
  
  uploadVideoGroup: (params: {
    videos: Array<{
      channelId: string;
      videoPath: string;
      scheduledDate: string;
      videoName?: string;
      accountId?: string;
    }>;
    title: string;
  }) => Promise<{
    success: boolean;
    count?: number;
    error?: string;
  }>;
  
  // Account Management
  loadAccounts: () => Promise<{
    success: boolean;
    data?: PlanlyAccount[];
    error?: string;
  }>;
  
  saveAccount: (accountData: {
    name: string;
    teamId: string;
    token: string;
  }) => Promise<{
    success: boolean;
    data?: PlanlyAccount;
    error?: string;
  }>;
  
  deleteAccount: (accountId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
  
  getAccount: (accountId: string) => Promise<{
    success: boolean;
    data?: PlanlyAccount;
    error?: string;
  }>;
  
  // Video metadata check
  checkVideoMetadata: (filePath: string) => Promise<{
    success: boolean;
    duration?: number;
    size?: number;
    codec?: string;
    error?: string;
  }>;
  
  // Bulk Upload with Pause/Resume
  bulkUploadSchedule: (params: {
    folderPath: string;
    channelIds: string[];
    startDate: string;
    videosPerDay: number;
    timeSlots: string[];
    title?: string;
    resumeFromSaved?: boolean;
  }) => Promise<{
    success: boolean;
    cancelled?: boolean;
    message?: string;
    stats?: {
      totalVideos: number;
      totalChannels: number;
      videosPerChannel: number;
      totalDays: number;
      uploadedCount: number;
      failedCount: number;
      scheduledCount: number;
    };
    failedVideos?: Array<{
      videoPath: string;
      videoName: string;
      error: string;
    }>;
    progress?: {
      uploaded: number;
      total: number;
      failed: number;
    };
    error?: string;
  }>;
  
  pauseBulkUpload: () => Promise<{
    success: boolean;
    message?: string;
    progress?: {
      uploaded: number;
      failed: number;
    };
  }>;
  
  resumeBulkUpload: () => Promise<{
    success: boolean;
    message?: string;
  }>;
  
  cancelBulkUpload: () => Promise<{
    success: boolean;
    message?: string;
    progress?: {
      uploaded: number;
      failed: number;
    };
  }>;
  
  getBulkUploadStatus: () => Promise<{
    isRunning: boolean;
    isPaused: boolean;
    currentPhase: string;
    uploadedCount: number;
    failedCount: number;
    hasSavedProgress: boolean;
  }>;
  
  clearBulkUploadProgress: () => Promise<{
    success: boolean;
    message?: string;
  }>;
  
  onBulkUploadProgress: (callback: (data: {
    phase: 'upload' | 'schedule';
    current: number;
    total: number;
    fileName?: string;
    uploadedCount?: number;
    failedCount?: number;
  }) => void) => () => void; // Returns cleanup function
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
