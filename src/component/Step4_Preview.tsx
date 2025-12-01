import React, { useMemo, useState } from 'react';

interface VideoSchedule {
  channelId: string;
  channelName: string;
  accountId: string;
  date: string;
  videoPath: string;
  videoName: string;
}

interface UploadProgress {
  phase: 'idle' | 'uploading' | 'scheduling' | 'completed' | 'error';
  uploadedCount: number;
  scheduledCount: number;
  totalVideos: number;
  currentFile?: string;
  message?: string;
}

interface Step4PreviewProps {
  config: {
    schedule: VideoSchedule[];
    videoTitle?: string;
    selectedChannels: string[];
    videosPerDay: number;
    accounts?: Array<{
      accountId: string;
      accountName: string;
    }>;
  };
  onPrev: () => void;
  onReset: () => void;
}

export default function Step4_Preview({ config, onPrev, onReset }: Step4PreviewProps) {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    phase: 'idle',
    uploadedCount: 0,
    scheduledCount: 0,
    totalVideos: config.schedule.length
  });

  const accountNameMap = useMemo(() => {
    const map = new Map<string, string>();
    (config.accounts || []).forEach(acc => {
      map.set(acc.accountId, acc.accountName);
    });
    return map;
  }, [config.accounts]);

  // Group by date for preview
  const scheduleByDate = config.schedule.reduce((acc, item) => {
    const d = new Date(item.date);
    const dateKey = d.toISOString().split('T')[0];
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(item);
    return acc;
  }, {} as Record<string, VideoSchedule[]>);

  const dates = Object.keys(scheduleByDate).sort();

  const handleStartUpload = async () => {
    setUploadProgress({
      phase: 'uploading',
      uploadedCount: 0,
      scheduledCount: 0,
      totalVideos: config.schedule.length,
      message: 'Đang chuẩn bị upload...'
    });

    try {
      console.log('[Step4] Starting fast batch upload:', {
        totalVideos: config.schedule.length,
        totalChannels: config.selectedChannels.length,
        videosPerDay: config.videosPerDay
      });

      // ============= STRATEGY: UPLOAD THEO TIME SLOT =============
      // Group videos theo time slot (cùng giờ = cùng nhóm)
      const groupedByTime = config.schedule.reduce((acc, item) => {
        const timeKey = item.date; // ISO datetime
        if (!acc[timeKey]) acc[timeKey] = [];
        acc[timeKey].push(item);
        return acc;
      }, {} as Record<string, VideoSchedule[]>);

      const timeSlots = Object.keys(groupedByTime).sort();
      let uploadedCount = 0;
      let scheduledCount = 0;

      console.log(`[Step4] Total time slots: ${timeSlots.length}`);

      // Listen to progress events from backend
      window.electronAPI.onBulkUploadProgress?.((data: any) => {
        if (data.phase === 'upload') {
          setUploadProgress({
            phase: 'uploading',
            uploadedCount: data.uploadedCount || data.current,
            scheduledCount: 0,
            totalVideos: data.total,
            currentFile: data.fileName,
            message: `Uploading ${data.current}/${data.total}: ${data.fileName}`
          });
        } else if (data.phase === 'schedule') {
          setUploadProgress({
            phase: 'scheduling',
            uploadedCount: data.total,
            scheduledCount: data.current,
            totalVideos: data.total,
            message: `Creating schedules ${data.current}/${data.total}`
          });
        }
      });

      // ============= UPLOAD TỪNG TIME SLOT =============
      for (let i = 0; i < timeSlots.length; i++) {
        const timeSlot = timeSlots[i];
        const videos = groupedByTime[timeSlot];
        
        setUploadProgress({
          phase: 'uploading',
          uploadedCount: uploadedCount,
          scheduledCount: 0,
          totalVideos: config.schedule.length,
          message: `Time slot ${i + 1}/${timeSlots.length}: ${videos.length} videos (${new Date(timeSlot).toLocaleString('vi-VN')})`
        });

        console.log(`[Step4] Uploading time slot ${i + 1}/${timeSlots.length}:`, {
          time: timeSlot,
          videoCount: videos.length,
          channels: videos.map(v => v.channelName).join(', ')
        });

        // Upload nhóm video cùng time slot
        const result = await window.electronAPI.uploadVideoGroup({
          videos: videos.map(v => ({
            channelId: v.channelId,
            videoPath: v.videoPath,
            scheduledDate: v.date,
            videoName: v.videoName,
            accountId: v.accountId
          })),
          title: config.videoTitle || ''
        });

        if (!result.success) {
          throw new Error(result.error || `Failed at time slot ${i + 1}`);
        }

        uploadedCount += videos.length;
        scheduledCount += videos.length;
        
        console.log(`[Step4] Time slot ${i + 1} completed. Progress: ${uploadedCount}/${config.schedule.length}`);
        
        // Update progress
        setUploadProgress({
          phase: 'uploading',
          uploadedCount: uploadedCount,
          scheduledCount: scheduledCount,
          totalVideos: config.schedule.length,
          message: `Completed ${uploadedCount}/${config.schedule.length} videos`
        });
        
        // Delay nhỏ giữa các time slot để tránh rate limit
        if (i < timeSlots.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // ============= HOÀN THÀNH =============
      setUploadProgress({
        phase: 'completed',
        uploadedCount: config.schedule.length,
        scheduledCount: config.schedule.length,
        totalVideos: config.schedule.length,
        message: '✅ Upload hoàn thành!'
      });

      console.log('[Step4] Upload completed successfully:', {
        totalUploaded: uploadedCount,
        totalScheduled: scheduledCount
      });

    } catch (error: any) {
      console.error('[Step4] Upload error:', error);
      setUploadProgress({
        phase: 'error',
        uploadedCount: uploadProgress.uploadedCount,
        scheduledCount: uploadProgress.scheduledCount,
        totalVideos: config.schedule.length,
        message: `❌ Lỗi: ${error.message || 'Không thể upload'}`
      });
    }
  };

  const uploadPercent = uploadProgress.totalVideos > 0
    ? Math.round((uploadProgress.uploadedCount / uploadProgress.totalVideos) * 100)
    : 0;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">
        Bước 4: Xem trước & Upload
      </h2>
      
      <p className="text-sm text-gray-600 mb-6">
        Kiểm tra lịch và bắt đầu upload hàng loạt lên Planly
      </p>

      {/* Upload Progress */}
      {uploadProgress.phase !== 'idle' && (
        <div className="mb-6 p-6 bg-linear-to-br from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-300">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800 text-lg">
              {uploadProgress.phase === 'uploading' && '📤 Đang upload...'}
              {uploadProgress.phase === 'scheduling' && '📅 Đang tạo lịch...'}
              {uploadProgress.phase === 'completed' && '✅ Hoàn thành!'}
              {uploadProgress.phase === 'error' && '❌ Lỗi'}
            </h3>
            <span className="text-3xl font-bold text-blue-600">{uploadPercent}%</span>
          </div>
          
          <div className="w-full bg-gray-200 rounded-full h-4 mb-4">
            <div
              className={`h-4 rounded-full transition-all duration-300 ${
                uploadProgress.phase === 'error' ? 'bg-red-600' : 
                uploadProgress.phase === 'completed' ? 'bg-green-600' : 'bg-blue-600'
              }`}
              style={{ width: `${uploadPercent}%` }}
            />
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Videos uploaded:</span>
              <span className="font-semibold text-blue-600">
                {uploadProgress.uploadedCount} / {uploadProgress.totalVideos}
              </span>
            </div>
            {uploadProgress.phase === 'scheduling' && (
              <div className="flex justify-between">
                <span className="text-gray-600">Schedules created:</span>
                <span className="font-semibold text-green-600">
                  {uploadProgress.scheduledCount} / {uploadProgress.totalVideos}
                </span>
              </div>
            )}
            {uploadProgress.message && (
              <p className={`mt-2 p-2 rounded ${
                uploadProgress.phase === 'error' ? 'bg-red-100 text-red-700' :
                uploadProgress.phase === 'completed' ? 'bg-green-100 text-green-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {uploadProgress.message}
              </p>
            )}
            {uploadProgress.currentFile && (
              <p className="text-xs text-gray-500 truncate">
                📄 {uploadProgress.currentFile}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Schedule Preview */}
      <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto mb-6">
        <div className="flex items-center justify-between mb-4 sticky top-0 bg-gray-50 pb-2">
          <h3 className="font-semibold text-gray-800">📅 Lịch upload chi tiết</h3>
          <span className="text-sm text-gray-600">
            {config.schedule.length} videos × {dates.length} ngày
          </span>
        </div>

        <div className="space-y-4">
          {dates.map((date) => (
            <div key={date} className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                <h4 className="font-semibold text-gray-800">
                  {new Date(date).toLocaleDateString('vi-VN', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </h4>
                <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                  {scheduleByDate[date].length} videos
                </span>
              </div>

              {/* Group by channel in this date */}
              {Object.entries(
                scheduleByDate[date].reduce((acc, item) => {
                  if (!acc[item.channelName]) acc[item.channelName] = [];
                  acc[item.channelName].push(item);
                  return acc;
                }, {} as Record<string, VideoSchedule[]>)
              ).map(([channelName, videos]) => (
                <div key={channelName} className="mb-3">
                  <p className="text-xs font-semibold text-gray-600 mb-1">
                    📺 {channelName} • {accountNameMap.get(videos[0]?.accountId) || 'Unknown account'} ({videos.length} videos)
                  </p>
                  <div className="space-y-1">
                    {videos.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 p-2 bg-gray-50 rounded text-xs"
                      >
                        <span className="text-gray-400">
                          {new Date(item.date).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        <span className="text-gray-700 truncate flex-1">
                          {item.videoName}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        {uploadProgress.phase === 'idle' && (
          <>
            <button
              onClick={onPrev}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              ← Quay lại
            </button>
            <button
              onClick={handleStartUpload}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold text-lg shadow-lg"
            >
              🚀 Bắt đầu upload ({config.schedule.length} videos)
            </button>
          </>
        )}

        {(uploadProgress.phase === 'uploading' || uploadProgress.phase === 'scheduling') && (
          <button
            disabled
            className="flex-1 px-6 py-3 bg-gray-400 text-white rounded-lg cursor-not-allowed"
          >
            ⏳ Đang xử lý...
          </button>
        )}

        {uploadProgress.phase === 'completed' && (
          <button
            onClick={onReset}
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
          >
            ✨ Bắt đầu mới
          </button>
        )}

        {uploadProgress.phase === 'error' && (
          <>
            <button
              onClick={onPrev}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              ← Quay lại
            </button>
            <button
              onClick={handleStartUpload}
              className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
            >
              🔄 Thử lại
            </button>
          </>
        )}
      </div>

      {/* Info Box */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs text-gray-700">
          💡 <strong>Tối ưu tốc độ upload:</strong><br />
          • Upload theo <strong>time slot</strong> - các video cùng giờ được upload cùng lúc<br />
          • Backend tự động xử lý <strong>{config.schedule.length} videos</strong> với concurrency cao<br />
          • Tạo schedule theo <strong>batch</strong> để giảm số lượng API call<br />
          • Ước tính thời gian: <strong>~{Math.ceil(config.schedule.length / 60)} phút</strong> (1 video/giây)
        </p>
      </div>
    </div>
  );
}