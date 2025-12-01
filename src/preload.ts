// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Step 1: Connect to Planly and get channels
  connectPlanly: (params: { token: string; teamId: string; accountName?: string; accountId?: string } | string, teamId?: string) => 
    ipcRenderer.invoke('connect-planly', params, teamId),

  disconnectPlanly: (accountId: string) =>
    ipcRenderer.invoke('disconnect-planly', accountId),
  
  // Step 3: Select video folder
  selectVideoFolder: () => 
    ipcRenderer.invoke('select-video-folder'),
  
  // Step 4: Upload video
  uploadVideo: (params: {
    channelId: string;
    videoPath: string;
    scheduledDate: string;
    title: string;
  }) => ipcRenderer.invoke('upload-video', params),
  
  // Upload video group (same time slot, different channels)
  uploadVideoGroup: (params: {
    videos: Array<{
      channelId: string;
      videoPath: string;
      scheduledDate: string;
      accountId?: string;
    }>;
    title: string;
  }) => ipcRenderer.invoke('upload-video-group', params),
  
  // Account Management
  loadAccounts: () => 
    ipcRenderer.invoke('load-accounts'),
  
  saveAccount: (accountData: {
    name: string;
    teamId: string;
    token: string;
  }) => ipcRenderer.invoke('save-account', accountData),
  
  deleteAccount: (accountId: string) => 
    ipcRenderer.invoke('delete-account', accountId),
  
  getAccount: (accountId: string) => 
    ipcRenderer.invoke('get-account', accountId),
  
  // Video metadata check
  checkVideoMetadata: (filePath: string) =>
    ipcRenderer.invoke('check-video-metadata', filePath),
  
  // Bulk Upload with Pause/Resume
  bulkUploadSchedule: (params: {
    folderPath: string;
    channelIds: string[];
    startDate: string;
    videosPerDay: number;
    timeSlots: string[];
    title?: string;
    resumeFromSaved?: boolean;
  }) => ipcRenderer.invoke('bulk-upload-schedule', params),
  
  pauseBulkUpload: () => 
    ipcRenderer.invoke('pause-bulk-upload'),
  
  resumeBulkUpload: () => 
    ipcRenderer.invoke('resume-bulk-upload'),
  
  cancelBulkUpload: () => 
    ipcRenderer.invoke('cancel-bulk-upload'),
  
  getBulkUploadStatus: () => 
    ipcRenderer.invoke('get-bulk-upload-status'),
  
  clearBulkUploadProgress: () => 
    ipcRenderer.invoke('clear-bulk-upload-progress'),
  
  // Listen to bulk upload progress events
  onBulkUploadProgress: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('bulk-upload-progress', listener);
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('bulk-upload-progress', listener);
    };
  }
});
