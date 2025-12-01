import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';

// Import Planly helper functions
import * as planlyHelper from './api/planly-helper';
import * as accountStorage from './api/account-storage';
import ffmpeg from 'fluent-ffmpeg';

// Get ffmpeg and ffprobe paths
// In production, binaries are in extraResources
// In development, use node_modules
const isDev = !app.isPackaged;
let ffmpegPath: string;
let ffprobePath: string;

if (isDev) {
  ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
  ffprobePath = require('@ffprobe-installer/ffprobe').path;
} else {
  // In production, get from extraResources
  const resourcesPath = process.resourcesPath;
  const ffmpegModule = path.join(resourcesPath, '@ffmpeg-installer', 'ffmpeg');
  const ffprobeModule = path.join(resourcesPath, '@ffprobe-installer', 'ffprobe');
  
  try {
    // Try to load from extraResources
    ffmpegPath = require(ffmpegModule).path;
    ffprobePath = require(ffprobeModule).path;
  } catch (e) {
    // Fallback to default paths
    ffmpegPath = path.join(resourcesPath, '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe');
    ffprobePath = path.join(resourcesPath, '@ffprobe-installer', 'win32-x64', 'ffprobe.exe');
  }
}

// Set ffmpeg and ffprobe paths from installed packages
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// Store credentials globally for the session
let globalToken = '';
let globalTeamId = '';

interface ConnectedAccount {
  token: string;
  teamId: string;
  accountName: string;
}

const connectedAccounts = new Map<string, ConnectedAccount>();
const accountChannelsMap = new Map<string, Set<string>>();
const channelAccountMap = new Map<string, string>();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

// ============================================================================
// IPC Handlers for Planly Integration
// ============================================================================

/**
 * Step 1: Connect to Planly and get list of channels
 */
ipcMain.handle('connect-planly', async (event, payload: any, maybeTeamId?: string) => {
  try {
    let token: string | undefined;
    let teamId: string | undefined;
    let accountName: string | undefined;
    let providedAccountId: string | undefined;

    if (payload && typeof payload === 'object' && 'token' in payload) {
      token = payload.token;
      teamId = payload.teamId;
      accountName = payload.accountName;
      providedAccountId = payload.accountId;
    } else {
      token = typeof payload === 'string' ? payload : undefined;
      teamId = typeof maybeTeamId === 'string' ? maybeTeamId : undefined;
    }

    // Validate inputs
    if (!token || !teamId) {
      throw new Error('Token và Team ID không được để trống');
    }
    
    const accountId = providedAccountId || `acc_${teamId}_${Date.now()}`;
    const accountLabel = accountName && accountName.trim().length > 0
      ? accountName.trim()
      : `Account ${connectedAccounts.size + 1}`;

    // Store credentials for later use (legacy single-account flows)
    globalToken = token;
    globalTeamId = teamId;

    // Keep track of multi-account credentials
    connectedAccounts.set(accountId, {
      token,
      teamId,
      accountName: accountLabel
    });
    
    // Call Planly API to get channels
    const result = await planlyHelper.listChannels(teamId, token);

    // Remove old channel mappings for this account (reconnect case)
    const previousChannelIds = accountChannelsMap.get(accountId);
    if (previousChannelIds) {
      previousChannelIds.forEach(id => channelAccountMap.delete(id));
      accountChannelsMap.delete(accountId);
    }

    const channelIdsForAccount = new Set<string>();
    
    // Transform data to match our interface
    const channels = (result.data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      platform: c.social_network || 'Unknown',
      url: c.url,
      status: c.status,
      accountId,
      accountName: accountLabel
    }));

  channels.forEach((channel: any) => {
      channelAccountMap.set(channel.id, accountId);
      channelIdsForAccount.add(channel.id);
    });
    accountChannelsMap.set(accountId, channelIdsForAccount);
    
    return {
      success: true,
      accountId,
      accountName: accountLabel,
      channels,
      data: channels
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Không thể kết nối với Planly'
    }
  }
});

ipcMain.handle('disconnect-planly', async (event, accountId: string) => {
  try {
    if (!accountId) {
      throw new Error('Thiếu accountId để ngắt kết nối');
    }

    connectedAccounts.delete(accountId);

    const channelIds = accountChannelsMap.get(accountId);
    if (channelIds) {
      channelIds.forEach(id => channelAccountMap.delete(id));
      accountChannelsMap.delete(accountId);
    }

    if (connectedAccounts.size === 0) {
      globalToken = '';
      globalTeamId = '';
    }

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Không thể ngắt kết nối tài khoản'
    };
  }
});

// ============================================================================
// Video Metadata Check
// ============================================================================

/**
 * Check video metadata (duration, size, codec)
 */
ipcMain.handle('check-video-metadata', async (event, filePath: string) => {
  return new Promise((resolve) => {
    try {
      console.log('[IPC] check-video-metadata:', path.basename(filePath));
      
      if (!fs.existsSync(filePath)) {
        resolve({
          success: false,
          error: 'File không tồn tại'
        });
        return;
      }
      
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          console.error('[IPC] ffprobe error:', err);
          resolve({
            success: false,
            error: err.message || 'Không thể đọc metadata'
          });
          return;
        }
        
        try {
          const duration = metadata.format.duration || 0;
          const size = metadata.format.size || 0;
          const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
          const codec = videoStream?.codec_name || 'unknown';
          
          console.log('[IPC] Video metadata:', {
            file: path.basename(filePath),
            duration: `${duration}s (${Math.round(duration)}s)`,
            size: `${Math.round(size / 1024 / 1024)}MB`,
            codec,
            isValid: duration <= 60 ? 'YES ✅' : 'NO ❌'
          });
          
          resolve({
            success: true,
            duration,
            size,
            codec
          });
        } catch (parseError: any) {
          console.error('[IPC] Error parsing metadata:', parseError);
          resolve({
            success: false,
            error: 'Lỗi khi parse metadata'
          });
        }
      });
    } catch (error: any) {
      console.error('[IPC] check-video-metadata error:', error);
      resolve({
        success: false,
        error: error.message || 'Lỗi không xác định'
      });
    }
  });
});

/**
 * Step 3: Select video folder and scan for video files
 */
ipcMain.handle('select-video-folder', async (event) => {
  try {
    console.log('[IPC] select-video-folder called');
    
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Chọn thư mục chứa video'
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false };
    }
    
    const folderPath = result.filePaths[0];
    console.log('[IPC] Selected folder:', folderPath);
    
    // Scan for video files
    const videoFiles = planlyHelper.listVideosInDir(folderPath);
    
    console.log(`[IPC] Found ${videoFiles.length} video files`);
    
    return {
      success: true,
      path: folderPath,
      files: videoFiles
    };
  } catch (error: any) {
    console.error('[IPC] select-video-folder error:', error);
    return {
      success: false,
      error: error.message || 'Không thể chọn thư mục'
    };
  }
});

/**
 * Upload multiple videos as a group (same time slot, different channels)
 * Used by Step4_Preview for the original 4-step workflow
 */
ipcMain.handle('upload-video-group', async (event, params: {
  videos: Array<{
    channelId: string;
    videoPath: string;
    scheduledDate: string;
    videoName?: string;
    accountId?: string;
  }>;
  title: string;
}) => {
  try {
    const { videos, title } = params;

    if (!videos || videos.length === 0) {
      throw new Error('Không có video nào để upload');
    }

    console.log('[IPC] upload-video-group called', {
      count: videos.length,
      title,
      scheduledDate: videos[0]?.scheduledDate
    });

    const videosByAccount = new Map<string, typeof videos>();
    for (const video of videos) {
      const accountId = video.accountId || channelAccountMap.get(video.channelId);
      if (!accountId) {
        throw new Error(`Không tìm thấy tài khoản cho channel ${video.channelId}`);
      }
      if (!videosByAccount.has(accountId)) {
        videosByAccount.set(accountId, []);
      }
      videosByAccount.get(accountId)!.push(video);
    }

    const perAccountResults: Array<{ accountId: string; result: any }> = [];
    let processedCount = 0;

    const processAccountVideos = async (
      accountId: string,
      accountVideos: typeof videos,
      credentials: ConnectedAccount
    ) => {
      console.log(`[IPC] Processing account ${accountId} (${credentials.accountName}) with ${accountVideos.length} videos`);

      const uploadedVideos: Array<{
        channelId: string;
        mediaId: string;
        publishOn: string;
        videoName: string;
      }> = [];
      const CONCURRENT_UPLOADS = 5;

      const uploadWithRetry = async (video: typeof accountVideos[0]) => {
        if (!fs.existsSync(video.videoPath)) {
          throw new Error(`File không tồn tại: ${video.videoPath}`);
        }

        let retries = 3;
        let mediaId: string | null = null;

        while (retries > 0 && !mediaId) {
          try {
            mediaId = await planlyHelper.uploadVideoFile(
              video.videoPath,
              credentials.teamId,
              credentials.token
            );

            console.log(`[IPC] [${credentials.accountName}] Video uploaded:`, path.basename(video.videoPath), 'mediaId:', mediaId);
          } catch (error: any) {
            retries--;
            console.error(`[IPC] [${credentials.accountName}] Upload failed, retries left: ${retries}`, error.message);

            if (retries === 0) {
              throw new Error(`Failed to upload ${path.basename(video.videoPath)}: ${error.message}`);
            }

            await new Promise(resolve => setTimeout(resolve, (4 - retries) * 2000));
          }
        }

        let publishOnISO: string;
        const scheduleDate = new Date(video.scheduledDate);
        if (Number.isNaN(scheduleDate.getTime())) {
          const cleanDate = video.scheduledDate.replace(/[Z]|([+-]\d{2}:\d{2})$/, '');
          publishOnISO = `${cleanDate}Z`;
          console.warn('[IPC] scheduleDate parsing failed, fallback to append Z:', video.scheduledDate);
        } else {
          publishOnISO = scheduleDate.toISOString().replace('.000Z', 'Z');
        }

        console.log('[IPC] Publishing at:', {
          original: video.scheduledDate,
          sent: publishOnISO,
          account: credentials.accountName
        });

        uploadedVideos.push({
          channelId: video.channelId,
          mediaId: mediaId!,
          publishOn: publishOnISO,
          videoName: video.videoName || path.basename(video.videoPath)
        });
      };

      for (let i = 0; i < accountVideos.length; i += CONCURRENT_UPLOADS) {
        const batch = accountVideos.slice(i, i + CONCURRENT_UPLOADS);
        console.log(`[IPC] [${credentials.accountName}] Batch ${Math.floor(i / CONCURRENT_UPLOADS) + 1}/${Math.ceil(accountVideos.length / CONCURRENT_UPLOADS)} (${batch.length} videos)`);

        await Promise.all(batch.map(video => uploadWithRetry(video)));

        if (i + CONCURRENT_UPLOADS < accountVideos.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      const schedules = uploadedVideos.map(v => {
        let content = title?.trim() || v.videoName.replace(/\.[^/.]+$/, '');
        if (!content || content.length === 0) {
          content = v.videoName;
        }
        return {
          channelId: v.channelId,
          publishOn: v.publishOn,
          content,
          mediaId: v.mediaId
        };
      });

      console.log('[IPC] Creating schedules for account:', {
        accountId,
        accountName: credentials.accountName,
        count: schedules.length
      });

      let scheduleResult;
      try {
        scheduleResult = await planlyHelper.createScheduleGroup(
          schedules,
          credentials.teamId,
          credentials.token,
          false
        );
        console.log('[IPC] Schedule group created successfully for account:', credentials.accountName);
      } catch (error: any) {
        console.warn(`[IPC] schedule-groups/create failed for ${credentials.accountName}, trying individual schedules:`, error.message);

        const individualResults = [];
        for (const schedule of schedules) {
          try {
            const result = await planlyHelper.createSchedule({
              channelId: schedule.channelId,
              publishOn: schedule.publishOn,
              content: schedule.content,
              mediaId: schedule.mediaId,
              status: 1,
              options: {}
            }, credentials.token);
            individualResults.push(result);
            console.log('[IPC] Individual schedule created for channel:', schedule.channelId.substring(0, 8));
          } catch (scheduleError: any) {
            console.error('[IPC] Failed to create individual schedule:', scheduleError.message);
          }
        }
        scheduleResult = { success: true, count: individualResults.length, results: individualResults };
      }

      return {
        processed: accountVideos.length,
        scheduleResult
      };
    };

    for (const [accountId, accountVideos] of videosByAccount.entries()) {
      const credentials = connectedAccounts.get(accountId);
      if (!credentials) {
        throw new Error(`Tài khoản ${accountId} chưa kết nối hoặc đã bị xóa`);
      }

      // Keep legacy globals in sync for single-account flows
      globalToken = credentials.token;
      globalTeamId = credentials.teamId;

      const result = await processAccountVideos(accountId, accountVideos, credentials);
      processedCount += result.processed;
      perAccountResults.push({
        accountId,
        result: result.scheduleResult
      });
    }

    return {
      success: true,
      count: processedCount,
      scheduleResult: perAccountResults
    };
  } catch (error: any) {
    console.error('[IPC] upload-video-group error:', error);
    return {
      success: false,
      error: error.message || 'Không thể upload video group'
    };
  }
});

/**
 * BULK UPLOAD - Upload hàng loạt video và tự động phân bổ cho nhiều channels
 * Có tính năng PAUSE/RESUME và lưu progress
 */

// ============= STATE MANAGEMENT =============
interface BulkUploadState {
  isRunning: boolean;
  isPaused: boolean;
  shouldCancel: boolean;
  currentPhase: 'upload' | 'schedule' | 'idle';
  uploadedVideos: Array<{
    channelId: string;
    mediaId: string;
    publishOn: string;
    content: string;
    videoName: string;
  }>;
  failedVideos: Array<{
    videoPath: string;
    videoName: string;
    error: string;
  }>;
}

let bulkUploadState: BulkUploadState = {
  isRunning: false,
  isPaused: false,
  shouldCancel: false,
  currentPhase: 'idle',
  uploadedVideos: [],
  failedVideos: []
};

// ============= PROGRESS PERSISTENCE =============
const PROGRESS_FILE = path.join(app.getPath('userData'), 'bulk-upload-progress.json');

function saveProgress() {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(bulkUploadState, null, 2));
    console.log('[BULK] Progress saved');
  } catch (error) {
    console.error('[BULK] Failed to save progress:', error);
  }
}

function loadProgress(): BulkUploadState | null {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[BULK] Failed to load progress:', error);
  }
  return null;
}

function clearProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE);
      console.log('[BULK] Progress file deleted');
    }
  } catch (error) {
    console.error('[BULK] Failed to delete progress:', error);
  }
}

// ============= MAIN BULK UPLOAD HANDLER =============
ipcMain.handle('bulk-upload-schedule', async (event, params: {
  folderPath: string;
  channelIds: string[];
  startDate: string;
  videosPerDay: number;
  timeSlots: string[];
  title?: string;
  resumeFromSaved?: boolean; // Có resume từ lần trước không?
}) => {
  try {
    const { folderPath, channelIds, startDate, videosPerDay, timeSlots, title, resumeFromSaved } = params;
    
    // ============= CHECK IF RESUME =============
    if (resumeFromSaved) {
      const savedState = loadProgress();
      if (savedState && savedState.uploadedVideos.length > 0) {
        console.log('[BULK] Resuming from saved progress:', savedState.uploadedVideos.length, 'videos already uploaded');
        bulkUploadState = {
          ...savedState,
          isRunning: true,
          isPaused: false,
          shouldCancel: false
        };
      } else {
        console.log('[BULK] No saved progress found, starting fresh');
        bulkUploadState = {
          isRunning: true,
          isPaused: false,
          shouldCancel: false,
          currentPhase: 'upload',
          uploadedVideos: [],
          failedVideos: []
        };
      }
    } else {
      // Reset state
      bulkUploadState = {
        isRunning: true,
        isPaused: false,
        shouldCancel: false,
        currentPhase: 'upload',
        uploadedVideos: [],
        failedVideos: []
      };
      clearProgress(); // Xóa progress cũ
    }
    
    console.log('[BULK] bulk-upload-schedule started', {
      folderPath,
      channelCount: channelIds.length,
      videosPerDay,
      timeSlots,
      resume: resumeFromSaved
    });
    
    // ============= VALIDATION =============
    if (!globalToken || !globalTeamId) {
      throw new Error('Chưa kết nối với Planly. Vui lòng quay lại Bước 1.');
    }
    
    if (!fs.existsSync(folderPath)) {
      throw new Error(`Folder không tồn tại: ${folderPath}`);
    }
    
    if (channelIds.length === 0) {
      throw new Error('Phải chọn ít nhất 1 channel');
    }
    
    if (timeSlots.length !== videosPerDay) {
      throw new Error(`Số time slots (${timeSlots.length}) phải bằng videosPerDay (${videosPerDay})`);
    }
    
    // ============= STEP 1: ĐỌC VIDEO =============
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
    const allFiles = fs.readdirSync(folderPath);
    const videoFiles = allFiles.filter(file => 
      videoExtensions.includes(path.extname(file).toLowerCase())
    );
    
    console.log(`[BULK] Found ${videoFiles.length} videos in folder`);
    
    if (videoFiles.length === 0) {
      throw new Error('Không tìm thấy video nào trong folder');
    }
    
    // ============= STEP 2: PHÂN BỔ VIDEO =============
    const videosPerChannel = Math.ceil(videoFiles.length / channelIds.length);
    const channelAssignments: Map<string, string[]> = new Map();
    const channelIndexMap = new Map<string, number>();
    
    channelIds.forEach((channelId, index) => {
      const startIdx = index * videosPerChannel;
      const endIdx = Math.min(startIdx + videosPerChannel, videoFiles.length);
      const assignedVideos = videoFiles.slice(startIdx, endIdx);
      channelAssignments.set(channelId, assignedVideos);
      channelIndexMap.set(channelId, index);
    });
    
    // ============= STEP 3: TẠO LỊCH TRÌNH =============
    interface ScheduleItem {
      channelId: string;
      videoPath: string;
      videoName: string;
      scheduledDate: Date;
      timeSlot: string;
    }
    
  const allSchedules: ScheduleItem[] = [];
  const startDateTime = new Date(startDate);
  startDateTime.setHours(0, 0, 0, 0);
    
    channelAssignments.forEach((videos, channelId) => {
      const channelIndex = channelIndexMap.get(channelId) || 0;
      videos.forEach((videoFile, videoIndex) => {
        const dayOffset = Math.floor(videoIndex / videosPerDay);
        const timeSlotIndex = videoIndex % videosPerDay;
        
        const scheduleDate = new Date(startDateTime);
        scheduleDate.setDate(scheduleDate.getDate() + dayOffset);
        
        const [hours, minutes] = timeSlots[timeSlotIndex].split(':');
        const baseHours = parseInt(hours, 10);
        const baseMinutes = parseInt(minutes, 10);
        scheduleDate.setHours(baseHours, baseMinutes, 0, 0);
        
        // Offset each channel slightly to avoid identical timestamps
        const minuteOffset = channelIndex >= 60 ? Math.floor(channelIndex / 60) : 0;
        const secondOffset = channelIndex % 60;
        if (minuteOffset > 0) {
          scheduleDate.setMinutes(scheduleDate.getMinutes() + minuteOffset);
        }
        scheduleDate.setSeconds(secondOffset);
        scheduleDate.setMilliseconds(0);
        
        allSchedules.push({
          channelId,
          videoPath: path.join(folderPath, videoFile),
          videoName: videoFile,
          scheduledDate: scheduleDate,
          timeSlot: timeSlots[timeSlotIndex]
        });
      });
    });
    
    console.log(`[BULK] Created ${allSchedules.length} schedules`);
    
    // ============= STEP 4: LỌC VIDEO ĐÃ UPLOAD =============
    const uploadedVideoNames = new Set(bulkUploadState.uploadedVideos.map(v => v.videoName));
    const remainingSchedules = allSchedules.filter(s => !uploadedVideoNames.has(s.videoName));
    
    console.log(`[BULK] Already uploaded: ${bulkUploadState.uploadedVideos.length}`);
    console.log(`[BULK] Remaining: ${remainingSchedules.length}`);
    
    if (remainingSchedules.length === 0 && bulkUploadState.uploadedVideos.length > 0) {
      console.log('[BULK] All videos already uploaded, proceeding to scheduling phase');
      bulkUploadState.currentPhase = 'schedule';
    }
    
    // ============= STEP 5: UPLOAD VIDEOS (CÓ PAUSE/RESUME) =============
    if (bulkUploadState.currentPhase === 'upload' && remainingSchedules.length > 0) {
      const CONCURRENT_UPLOADS = 20; // Tăng lên 20 videos cùng lúc để nhanh hơn
      
      const uploadWithRetry = async (schedule: ScheduleItem, index: number, total: number) => {
        // CHECK PAUSE
        while (bulkUploadState.isPaused) {
          console.log('[BULK] Upload paused, waiting...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // CHECK CANCEL
        if (bulkUploadState.shouldCancel) {
          throw new Error('Upload cancelled by user');
        }
        
        let retries = 3;
        let mediaId: string | null = null;
        
        while (retries > 0 && !mediaId) {
          try {
            console.log(`[BULK] Uploading ${index + 1}/${total}: ${schedule.videoName}`);
            
            mediaId = await planlyHelper.uploadVideoFile(
              schedule.videoPath,
              globalTeamId,
              globalToken
            );
            
            console.log(`[BULK] ✓ Uploaded ${index + 1}/${total}: ${schedule.videoName} → ${mediaId}`);
            
            // Lưu vào state
            const uploadedItem = {
              channelId: schedule.channelId,
              mediaId: mediaId!,
              publishOn: schedule.scheduledDate.toISOString(),
              content: title?.trim() || schedule.videoName.replace(/\.[^/.]+$/, ''),
              videoName: schedule.videoName
            };
            
            bulkUploadState.uploadedVideos.push(uploadedItem);
            saveProgress(); // LƯU PROGRESS SAU MỖI VIDEO
            
            // Gửi progress
            event.sender.send('bulk-upload-progress', {
              phase: 'upload',
              current: bulkUploadState.uploadedVideos.length,
              total: allSchedules.length,
              fileName: schedule.videoName,
              uploadedCount: bulkUploadState.uploadedVideos.length,
              failedCount: bulkUploadState.failedVideos.length
            });
            
          } catch (error: any) {
            retries--;
            console.error(`[BULK] ✗ Upload failed (${3 - retries}/3): ${schedule.videoName}`, error.message);
            
            if (retries === 0) {
              // Lưu video thất bại
              bulkUploadState.failedVideos.push({
                videoPath: schedule.videoPath,
                videoName: schedule.videoName,
                error: error.message
              });
              saveProgress();
              
              throw new Error(`Failed to upload ${schedule.videoName}: ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, (4 - retries) * 3000));
          }
        }
        
        return bulkUploadState.uploadedVideos[bulkUploadState.uploadedVideos.length - 1];
      };
      
      // Upload theo batch
      for (let i = 0; i < remainingSchedules.length; i += CONCURRENT_UPLOADS) {
        // CHECK CANCEL
        if (bulkUploadState.shouldCancel) {
          console.log('[BULK] Upload cancelled');
          return {
            success: false,
            cancelled: true,
            message: 'Upload đã bị hủy. Progress đã được lưu.',
            progress: {
              uploaded: bulkUploadState.uploadedVideos.length,
              total: allSchedules.length,
              failed: bulkUploadState.failedVideos.length
            }
          };
        }
        
        const batch = remainingSchedules.slice(i, i + CONCURRENT_UPLOADS);
        const batchNumber = Math.floor(i / CONCURRENT_UPLOADS) + 1;
        const totalBatches = Math.ceil(remainingSchedules.length / CONCURRENT_UPLOADS);
        
        console.log(`[BULK] === Batch ${batchNumber}/${totalBatches} (${batch.length} videos) ===`);
        
        // Upload batch (bỏ qua video lỗi)
        const batchResults = await Promise.allSettled(
          batch.map((schedule, batchIndex) => 
            uploadWithRetry(schedule, i + batchIndex, remainingSchedules.length)
          )
        );
        
        // Đếm thành công/thất bại
        const succeeded = batchResults.filter(r => r.status === 'fulfilled').length;
        const failed = batchResults.filter(r => r.status === 'rejected').length;
        console.log(`[BULK] Batch ${batchNumber} completed: ${succeeded} succeeded, ${failed} failed`);
        
        // Delay giữa các batch
        if (i + CONCURRENT_UPLOADS < remainingSchedules.length) {
          console.log('[BULK] Waiting 1s before next batch...'); // Giảm delay xuống 1s
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      console.log(`[BULK] ✓ Upload phase completed: ${bulkUploadState.uploadedVideos.length} uploaded, ${bulkUploadState.failedVideos.length} failed`);
    }
    
    // ============= STEP 6: TẠO SCHEDULES =============
    bulkUploadState.currentPhase = 'schedule';
    saveProgress();
    
    const SCHEDULES_PER_BATCH = 50;
    const createdSchedules = [];
    const uploadedVideosToSchedule = bulkUploadState.uploadedVideos;
    
    for (let i = 0; i < uploadedVideosToSchedule.length; i += SCHEDULES_PER_BATCH) {
      // CHECK PAUSE
      while (bulkUploadState.isPaused) {
        console.log('[BULK] Scheduling paused, waiting...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // CHECK CANCEL
      if (bulkUploadState.shouldCancel) {
        console.log('[BULK] Scheduling cancelled');
        return {
          success: false,
          cancelled: true,
          message: 'Scheduling đã bị hủy',
          progress: {
            uploaded: bulkUploadState.uploadedVideos.length,
            scheduled: createdSchedules.length,
            total: allSchedules.length
          }
        };
      }
      
      const scheduleBatch = uploadedVideosToSchedule.slice(i, i + SCHEDULES_PER_BATCH);
      const batchNumber = Math.floor(i / SCHEDULES_PER_BATCH) + 1;
      const totalBatches = Math.ceil(uploadedVideosToSchedule.length / SCHEDULES_PER_BATCH);
      
      console.log(`[BULK] Creating schedules batch ${batchNumber}/${totalBatches} (${scheduleBatch.length} schedules)`);
      
      try {
        const result = await planlyHelper.createScheduleGroup(
          scheduleBatch,
          globalTeamId,
          globalToken,
          false
        );
        
        createdSchedules.push(result);
        
        event.sender.send('bulk-upload-progress', {
          phase: 'schedule',
          current: Math.min(i + SCHEDULES_PER_BATCH, uploadedVideosToSchedule.length),
          total: uploadedVideosToSchedule.length
        });
        
        if (i + SCHEDULES_PER_BATCH < uploadedVideosToSchedule.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error: any) {
        console.error(`[BULK] Schedule batch ${batchNumber} failed:`, error.message);
        // Fallback: tạo từng schedule riêng
        for (const schedule of scheduleBatch) {
          try {
            const singleResult = await planlyHelper.createSchedule(
              { ...schedule, status: 1, options: {} },
              globalToken
            );
            createdSchedules.push(singleResult);
          } catch (err: any) {
            console.error(`[BULK] Failed schedule for ${schedule.content}:`, err.message);
          }
        }
      }
    }
    
    console.log(`[BULK] ✓ Scheduling completed: ${createdSchedules.length} schedules created`);
    
    // ============= CLEANUP & RETURN =============
    bulkUploadState.isRunning = false;
    bulkUploadState.currentPhase = 'idle';
    clearProgress(); // Xóa progress sau khi hoàn thành
    
    return {
      success: true,
      stats: {
        totalVideos: videoFiles.length,
        totalChannels: channelIds.length,
        videosPerChannel,
        totalDays: Math.ceil(videosPerChannel / videosPerDay),
        uploadedCount: bulkUploadState.uploadedVideos.length,
        failedCount: bulkUploadState.failedVideos.length,
        scheduledCount: createdSchedules.length
      },
      failedVideos: bulkUploadState.failedVideos,
      schedules: createdSchedules
    };
    
  } catch (error: any) {
    console.error('[BULK] bulk-upload-schedule error:', error);
    bulkUploadState.isRunning = false;
    saveProgress(); // Lưu progress khi lỗi
    
    return {
      success: false,
      error: error.message || 'Không thể bulk upload',
      progress: {
        uploaded: bulkUploadState.uploadedVideos.length,
        total: bulkUploadState.uploadedVideos.length + bulkUploadState.failedVideos.length,
        failed: bulkUploadState.failedVideos.length
      }
    };
  }
});

// ============= PAUSE HANDLER =============
ipcMain.handle('pause-bulk-upload', async () => {
  if (bulkUploadState.isRunning) {
    bulkUploadState.isPaused = true;
    saveProgress();
    console.log('[BULK] Upload paused');
    return { 
      success: true, 
      message: 'Upload đã tạm dừng',
      progress: {
        uploaded: bulkUploadState.uploadedVideos.length,
        failed: bulkUploadState.failedVideos.length
      }
    };
  }
  return { success: false, message: 'Không có upload nào đang chạy' };
});

// ============= RESUME HANDLER =============
ipcMain.handle('resume-bulk-upload', async () => {
  if (bulkUploadState.isRunning && bulkUploadState.isPaused) {
    bulkUploadState.isPaused = false;
    console.log('[BULK] Upload resumed');
    return { success: true, message: 'Upload đã tiếp tục' };
  }
  return { success: false, message: 'Không có upload nào đang tạm dừng' };
});

// ============= CANCEL HANDLER =============
ipcMain.handle('cancel-bulk-upload', async () => {
  if (bulkUploadState.isRunning) {
    bulkUploadState.shouldCancel = true;
    bulkUploadState.isPaused = false;
    saveProgress();
    console.log('[BULK] Upload cancelled by user');
    return { 
      success: true, 
      message: 'Upload đã bị hủy. Progress đã được lưu.',
      progress: {
        uploaded: bulkUploadState.uploadedVideos.length,
        failed: bulkUploadState.failedVideos.length
      }
    };
  }
  return { success: false, message: 'Không có upload nào đang chạy' };
});

// ============= GET STATUS HANDLER =============
ipcMain.handle('get-bulk-upload-status', async () => {
  return {
    isRunning: bulkUploadState.isRunning,
    isPaused: bulkUploadState.isPaused,
    currentPhase: bulkUploadState.currentPhase,
    uploadedCount: bulkUploadState.uploadedVideos.length,
    failedCount: bulkUploadState.failedVideos.length,
    hasSavedProgress: fs.existsSync(PROGRESS_FILE)
  };
});

// ============= CLEAR SAVED PROGRESS =============
ipcMain.handle('clear-bulk-upload-progress', async () => {
  clearProgress();
  bulkUploadState = {
    isRunning: false,
    isPaused: false,
    shouldCancel: false,
    currentPhase: 'idle',
    uploadedVideos: [],
    failedVideos: []
  };
  return { success: true, message: 'Progress đã được xóa' };
});

// ============================================================================
// Account Management Handlers
// ============================================================================

/**
 * Load all saved accounts
 */
ipcMain.handle('load-accounts', async (event) => {
  try {
    console.log('[IPC] load-accounts called');
    const accounts = accountStorage.loadAccounts();
    
    // Remove sensitive token from response (only send partial token)
    const sanitizedAccounts = accounts.map(acc => ({
      ...acc,
      token: acc.token ? `${acc.token.substring(0, 10)}...` : ''
    }));
    
    console.log(`[IPC] Loaded ${accounts.length} accounts`);
    return {
      success: true,
      data: accounts // Return full data with tokens for actual use
    };
  } catch (error: any) {
    console.error('[IPC] load-accounts error:', error);
    return {
      success: false,
      error: error.message || 'Không thể tải danh sách tài khoản'
    };
  }
});

/**
 * Save a new account
 */
ipcMain.handle('save-account', async (event, accountData: {
  name: string;
  teamId: string;
  token: string;
}) => {
  try {
    console.log('[IPC] save-account called:', accountData.name);
    
    if (!accountData.name || !accountData.teamId || !accountData.token) {
      throw new Error('Tên, Team ID và Token không được để trống');
    }
    
    const savedAccount = accountStorage.saveAccount(accountData);
    
    console.log('[IPC] Account saved successfully:', savedAccount.id);
    return {
      success: true,
      data: savedAccount
    };
  } catch (error: any) {
    console.error('[IPC] save-account error:', error);
    return {
      success: false,
      error: error.message || 'Không thể lưu tài khoản'
    };
  }
});

/**
 * Delete an account
 */
ipcMain.handle('delete-account', async (event, accountId: string) => {
  try {
    console.log('[IPC] delete-account called:', accountId);
    
    const deleted = accountStorage.deleteAccount(accountId);
    
    if (deleted) {
      console.log('[IPC] Account deleted successfully');
      return { success: true };
    } else {
      throw new Error('Không tìm thấy tài khoản');
    }
  } catch (error: any) {
    console.error('[IPC] delete-account error:', error);
    return {
      success: false,
      error: error.message || 'Không thể xóa tài khoản'
    };
  }
});

/**
 * Get a specific account by ID
 */
ipcMain.handle('get-account', async (event, accountId: string) => {
  try {
    console.log('[IPC] get-account called:', accountId);
    
    const account = accountStorage.getAccount(accountId);
    
    if (account) {
      // Update last used
      accountStorage.updateLastUsed(accountId);
      
      return {
        success: true,
        data: account
      };
    } else {
      throw new Error('Không tìm thấy tài khoản');
    }
  } catch (error: any) {
    console.error('[IPC] get-account error:', error);
    return {
      success: false,
      error: error.message || 'Không thể lấy thông tin tài khoản'
    };
  }
});
