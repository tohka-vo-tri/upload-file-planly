import React, { useState } from 'react';

interface VideoSchedule {
  channelId: string;
  channelName: string;
  date: string;
  videoPath: string;
  videoName: string;
}

interface UploadProgress {
  total: number;
  completed: number;
  current: string;
  status: 'idle' | 'uploading' | 'completed' | 'error';
}

interface Step4PreviewProps {
  config: {
    schedule: VideoSchedule[];
    videoTitle?: string; // Title for all videos
  };
  onPrev: () => void;
  onReset: () => void;
}

export default function Step4_Preview({ config, onPrev, onReset }: Step4PreviewProps) {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    total: config.schedule.length,
    completed: 0,
    current: '',
    status: 'idle'
  });

  // Group schedule by local date (YYYY-MM-DD) so items with times on the same day are together
  const scheduleByDate = config.schedule.reduce((acc, item) => {
    const d = new Date(item.date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateKey = `${yyyy}-${mm}-${dd}`;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(item);
    return acc;
  }, {} as Record<string, VideoSchedule[]>);

  const dates = Object.keys(scheduleByDate).sort();

  const handleStartUpload = async () => {
    setUploadProgress({ ...uploadProgress, status: 'uploading' });

    try {
      // Group videos by time slot (same datetime = same group)
      const groupedByTime = config.schedule.reduce((acc, item) => {
        const timeKey = item.date; // Full ISO datetime
        if (!acc[timeKey]) acc[timeKey] = [];
        acc[timeKey].push(item);
        return acc;
      }, {} as Record<string, VideoSchedule[]>);

      const timeSlots = Object.keys(groupedByTime).sort();
      let completedCount = 0;

      // Upload each time slot as a group
      for (let i = 0; i < timeSlots.length; i++) {
        const timeSlot = timeSlots[i];
        const videos = groupedByTime[timeSlot];
        
        setUploadProgress({
          total: config.schedule.length,
          completed: completedCount,
          current: `Khung giờ ${i + 1}/${timeSlots.length}: ${videos.length} video`,
          status: 'uploading'
        });

        // Upload all videos in this time slot at once
        const result = await window.electronAPI.uploadVideoGroup({
          videos: videos.map(v => ({
            channelId: v.channelId,
            videoPath: v.videoPath,
            scheduledDate: v.date,
            videoName: v.videoName // Pass video name for fallback title
          })),
          title: config.videoTitle || '' // Empty = use video filename
        });

        if (!result.success) {
          throw new Error(result.error || 'Upload failed');
        }

        completedCount += videos.length;
        
        // Small delay between time slots
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      setUploadProgress({
        total: config.schedule.length,
        completed: config.schedule.length,
        current: 'Hoàn thành!',
        status: 'completed'
      });
    } catch (error: any) {
      setUploadProgress({
        ...uploadProgress,
        status: 'error',
        current: error.message || 'Đã xảy ra lỗi'
      });
    }
  };

  const progressPercent = uploadProgress.total > 0
    ? Math.round((uploadProgress.completed / uploadProgress.total) * 100)
    : 0;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">
        Bước 4: Xem trước & Upload
      </h2>
      
      <p className="text-sm text-gray-600 mb-6">
        Kiểm tra lịch upload và bắt đầu tải video lên Planly
      </p>

      {/* Upload Progress */}
      {uploadProgress.status !== 'idle' && (
        <div className="mb-6 p-6 bg-linear-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800">Tiến trình upload</h3>
            <span className="text-2xl font-bold text-blue-600">{progressPercent}%</span>
          </div>
          
          <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="text-sm">
            <p className="text-gray-600">
              {uploadProgress.completed} / {uploadProgress.total} videos
            </p>
            {uploadProgress.status === 'uploading' && (
              <p className="text-blue-600 mt-1">
                ⏳ Đang upload: {uploadProgress.current}
              </p>
            )}
            {uploadProgress.status === 'completed' && (
              <p className="text-green-600 font-semibold mt-1">
                ✅ {uploadProgress.current}
              </p>
            )}
            {uploadProgress.status === 'error' && (
              <p className="text-red-600 font-semibold mt-1">
                ❌ {uploadProgress.current}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Schedule Preview */}
      <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto mb-6">
        <h3 className="font-semibold text-gray-800 mb-4 sticky top-0 bg-gray-50 pb-2">
          📅 Lịch upload chi tiết
        </h3>

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

              <div className="space-y-2">
                {scheduleByDate[date].map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg text-sm"
                  >
                    <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-semibold text-xs">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-800">{item.videoName}</p>
                      <p className="text-xs text-gray-500">→ {item.channelName} — <span className="text-gray-600">{new Date(item.date).toLocaleTimeString('vi-VN', {hour: '2-digit', minute: '2-digit'})}</span></p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        {uploadProgress.status === 'idle' && (
          <>
            <button
              onClick={onPrev}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              ← Quay lại
            </button>
            <button
              onClick={handleStartUpload}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold"
            >
              🚀 Bắt đầu upload ({config.schedule.length} videos)
            </button>
          </>
        )}

        {uploadProgress.status === 'uploading' && (
          <button
            disabled
            className="flex-1 px-6 py-3 bg-gray-400 text-white rounded-lg cursor-not-allowed"
          >
            ⏳ Đang upload...
          </button>
        )}

        {uploadProgress.status === 'completed' && (
          <button
            onClick={onReset}
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            ✨ Bắt đầu mới
          </button>
        )}

        {uploadProgress.status === 'error' && (
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
    </div>
  );
}
