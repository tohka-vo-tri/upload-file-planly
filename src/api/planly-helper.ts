// Helper functions to interact with Planly API
// Based on planly-upload.js logic

import fs from 'fs';
import path from 'path';

// Video extensions supported
const VIDEO_EXTS = ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'flv', 'wmv'];

interface StartUploadParams {
  teamId: string;
  contentLength: number;
  contentType: string;
  fileName: string;
}

interface ScheduleParams {
  channelId: string;
  publishOn: string;
  content: string;
  mediaId: string;
  status: number;
  options?: any;
}

/**
 * List all channels for a team
 */
export async function listChannels(teamId: string, token: string): Promise<any> {
  const res = await fetch('https://app.planly.com/api/v2/channels/list', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ team_id: teamId })
  });
  
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`channels/list failed: ${res.status} ${res.statusText} - ${txt}`);
  }
  
  return res.json();
}

/**
 * Start upload process - get presigned URL and mediaId
 */
export async function startUpload(params: StartUploadParams, token: string): Promise<any> {
  const res = await fetch('https://app.planly.com/api/v2/media/start-upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });
  
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`start-upload failed: ${res.status} ${res.statusText} - ${txt}`);
  }
  
  return res.json();
}

/**
 * Upload video file to presigned URL
 */
export async function putToPresignedUrl(
  uploadUrl: string,
  filePath: string,
  contentType: string,
  contentLength: number
): Promise<void> {
  const stream = fs.createReadStream(filePath);
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    // @ts-ignore - Node.js fetch supports ReadStream
    duplex: 'half',
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(contentLength)
    },
    // @ts-ignore - Node.js fetch supports ReadStream
    body: stream
  });
  
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`PUT to uploadUrl failed: ${res.status} ${res.statusText} - ${txt}`);
  }
}

/**
 * Finish upload process
 */
export async function finishUpload(mediaId: string, token: string): Promise<any> {
  const res = await fetch('https://app.planly.com/api/v2/media/finish-upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ mediaId })
  });
  
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`finish-upload failed: ${res.status} ${res.statusText} - ${txt}`);
  }
  
  return res.json();
}

/**
 * Create schedule for a single channel
 */
export async function createSchedule(params: ScheduleParams, token: string): Promise<any> {
  const { channelId, publishOn, content, mediaId, status, options } = params;
  
  const body = {
    schedules: [
      {
        channelId,
        publishOn,
        status,
        content,
        media: [
          { id: mediaId, options: {} }
        ],
        options: options || {}
      }
    ]
  };

  console.log('[Planly API] schedules/create request:', JSON.stringify(body, null, 2));

  const res = await fetch('https://app.planly.com/api/v2/schedules/create', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error('[Planly API] schedules/create error response:', txt);
    throw new Error(`schedules/create failed: ${res.status} ${res.statusText} - ${txt}`);
  }
  
  return res.json();
}

/**
 * Create schedule group using the new schedule-groups/create API
 * This allows creating multiple schedules in a single API call
 */
export async function createScheduleGroup(
  schedules: Array<{
    channelId: string;
    publishOn: string;
    content: string;
    mediaId: string;
  }>,
  teamId: string,
  token: string,
  publishNow: boolean = false
): Promise<any> {
  // Group schedules by publishOn time
  const groupedByTime = schedules.reduce((acc, s) => {
    const timeKey = publishNow ? new Date().toISOString() : s.publishOn;
    if (!acc[timeKey]) acc[timeKey] = [];
    acc[timeKey].push(s);
    return acc;
  }, {} as Record<string, typeof schedules>);

  // Build schedule groups
  const scheduleGroups = Object.entries(groupedByTime).map(([publishOn, items]) => ({
    publishOn,
    schedules: items.map(item => ({
      channelId: item.channelId,
      content: item.content,
      status: 1, // Add status field (1 = scheduled)
      media: [
        {
          id: item.mediaId,
          options: {}
        }
      ],
      options: {
        postType: 0
      }
    }))
  }));

  const body = {
    teamId,
    scheduleGroups
  };

  console.log('[Planly API] schedule-groups/create request:', JSON.stringify(body, null, 2));

  const res = await fetch('https://app.planly.com/api/v2/schedule-groups/create', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`schedule-groups/create failed: ${res.status} ${res.statusText} - ${txt}`);
  }
  
  return res.json();
}

/**
 * Check if file is a video
 */
export function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath || '').toLowerCase().replace('.', '');
  return VIDEO_EXTS.includes(ext);
}

/**
 * List all video files in a directory
 */
export function listVideosInDir(dirPath: string): string[] {
  const results: string[] = [];
  const stack: string[] = [dirPath];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) continue;

    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }

        if (entry.isFile() && isVideoFile(fullPath)) {
          results.push(fullPath);
        }
      }
    } catch (err) {
      console.warn('[listVideosInDir] Skip folder due to error:', currentDir, err);
    }
  }

  return results.sort((a, b) => a.localeCompare(b));
}

/**
 * Complete upload flow: start -> upload -> finish
 */
export async function uploadVideoFile(
  filePath: string,
  teamId: string,
  token: string
): Promise<string> {
  const contentType = 'video/mp4';
  const contentLength = fs.statSync(filePath).size;
  const fileName = path.basename(filePath);

  // Step 1: Start upload
  const { mediaId, uploadUrl } = await startUpload({
    teamId,
    contentLength,
    contentType,
    fileName
  }, token);
  
  console.log(`[Planly] start-upload -> mediaId: ${mediaId}`);

  // Step 2: Upload to presigned URL
  await putToPresignedUrl(uploadUrl, filePath, contentType, contentLength);
  console.log(`[Planly] PUT upload -> success`);

  // Step 3: Finish upload
  await finishUpload(mediaId, token);
  console.log(`[Planly] finish-upload -> success`);

  return mediaId;
}

// Default export with all functions
export default {
  listChannels,
  startUpload,
  putToPresignedUrl,
  finishUpload,
  createSchedule,
  createScheduleGroup,
  isVideoFile,
  listVideosInDir,
  uploadVideoFile
};
