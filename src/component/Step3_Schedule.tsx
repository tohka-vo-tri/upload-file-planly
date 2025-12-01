import React, { useState, useEffect } from 'react';

interface VideoSchedule {
  channelId: string;
  channelName: string;
  accountId: string;
  date: string;
  videoPath: string;
  videoName: string;
}

interface VideoFile {
  path: string;
  name: string;
  duration?: number;
  isValid: boolean;
  error?: string;
}

interface Step3ScheduleProps {
  config: {
    channels: any[];
    selectedChannels: string[];
    videoFolder: string;
    videosPerDay: number;
    schedule: VideoSchedule[];
    accounts: Array<{
      accountId: string;
      accountName: string;
    }>;
    startDate?: string;
    startTime?: string;
    intervalMinutes?: number;
    videoTitle?: string;
  };
  updateConfig: (updates: any) => void;
  onNext: () => void;
  onPrev: () => void;
}

export default function Step3_Schedule({ config, updateConfig, onNext, onPrev }: Step3ScheduleProps) {
  const [videoFiles, setVideoFiles] = useState<VideoFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);

  const handleSelectFolder = async () => {
    try {
      setValidating(true);
      const result = await window.electronAPI.selectVideoFolder();
      
      if (result.success && result.path && result.files) {
        updateConfig({ videoFolder: result.path });
        
        const BATCH_SIZE = 10;
        const validatedFiles: VideoFile[] = [];
        
        const validateVideo = async (filePath: string): Promise<VideoFile> => {
          const fileName = filePath.split(/[/\\]/).pop() || '';
          
          try {
            const metadataResult = await window.electronAPI.checkVideoMetadata(filePath);
            
            if (metadataResult.success && metadataResult.duration !== undefined) {
              const duration = metadataResult.duration;
              const isValid = duration <= 60;
              
              return {
                path: filePath,
                name: fileName,
                duration: duration,
                isValid: isValid,
                error: isValid ? undefined : `Video dài ${Math.round(duration)}s (vượt quá 60s)`
              };
            } else {
              return {
                path: filePath,
                name: fileName,
                isValid: false,
                error: metadataResult.error || 'Không thể đọc metadata'
              };
            }
          } catch (error: any) {
            return {
              path: filePath,
              name: fileName,
              isValid: false,
              error: error.message || 'Lỗi kiểm tra video'
            };
          }
        };
        
        for (let i = 0; i < result.files.length; i += BATCH_SIZE) {
          const batch = result.files.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.all(batch.map(validateVideo));
          validatedFiles.push(...batchResults);
          setVideoFiles([...validatedFiles]);
        }
        
        setVideoFiles(validatedFiles);
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
    } finally {
      setValidating(false);
    }
  };

  const generateSchedule = () => {
    setLoading(true);
    
    try {
      const selectedChannelIds = config.selectedChannels;
      const channelsInfo = config.channels.filter(c => selectedChannelIds.includes(c.id));
      const totalChannels = channelsInfo.length;
      const videosPerDay = config.videosPerDay || 6;
      
      // Chỉ dùng video hợp lệ
      const validVideos = videoFiles.filter(v => v.isValid);
      
      if (validVideos.length === 0 || totalChannels === 0) {
        updateConfig({ schedule: [] });
        return;
      }
      
      console.log('[Schedule] Generating:', {
        totalVideos: validVideos.length,
        totalChannels,
        videosPerDay
      });
      
      // ============= PHÂN BỔ VIDEO THEO TỪNG NGÀY/KÊNH =============
      // Đảm bảo mỗi video chỉ gắn với một kênh và mỗi kênh nhận đủ video theo ngày trước khi chuyển ngày mới
      const startDate = config.startDate || new Date().toISOString().split('T')[0];
      const startTime = config.startTime || '08:00';
      const intervalMinutes = Math.max(
        1,
        config.intervalMinutes && config.intervalMinutes > 0
          ? config.intervalMinutes
          : 120
      ); // mặc định cách nhau 2 tiếng nếu không cấu hình

      const firstDayStart = new Date(`${startDate}T${startTime}:00`);
      firstDayStart.setSeconds(0, 0);

      const schedule: VideoSchedule[] = [];
      const channelVideoCounts = new Map<string, number>();
      channelsInfo.forEach(channel => channelVideoCounts.set(channel.id, 0));

      const formatDate = (date: Date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const hh = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        const ss = String(date.getSeconds()).padStart(2, '0');
        return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
      };

      validVideos.forEach((video, globalIndex) => {
        const channelIndex = globalIndex % totalChannels;
        const channel = channelsInfo[channelIndex];
        if (!channel) return;

        const channelVideoIndex = channelVideoCounts.get(channel.id) || 0;
        const channelDay = Math.floor(channelVideoIndex / videosPerDay);
        const indexWithinDay = channelVideoIndex % videosPerDay;

        const scheduleDate = new Date(firstDayStart);
        scheduleDate.setDate(scheduleDate.getDate() + channelDay);
        scheduleDate.setMinutes(scheduleDate.getMinutes() + indexWithinDay * intervalMinutes);

        const minuteOffset = channelIndex >= 60 ? Math.floor(channelIndex / 60) : 0;
        if (minuteOffset > 0) {
          scheduleDate.setMinutes(scheduleDate.getMinutes() + minuteOffset);
        }
        scheduleDate.setSeconds(channelIndex % 60);
        scheduleDate.setMilliseconds(0);

        const dateStr = formatDate(scheduleDate);

        schedule.push({
          channelId: channel.id,
          channelName: channel.name,
          accountId: channel.accountId,
          date: dateStr,
          videoPath: video.path,
          videoName: video.name
        });

        channelVideoCounts.set(channel.id, channelVideoIndex + 1);
      });

  // Sắp xếp theo thời gian để đảm bảo preview và upload theo đúng thứ tự
  schedule.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      updateConfig({ schedule });
      
      console.log('[Schedule] Generated:', {
        totalSchedules: schedule.length,
        firstDate: schedule[0]?.date,
        lastDate: schedule[schedule.length - 1]?.date,
        sample: schedule.slice(0, 3).map(s => ({
          channel: s.channelName,
          video: s.videoName,
          date: s.date
        }))
      });
      
    } catch (error) {
      console.error('Error generating schedule:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-generate khi có video hoặc config thay đổi
  useEffect(() => {
    const validVideos = videoFiles.filter(v => v.isValid);
    if (validVideos.length > 0 && config.selectedChannels.length > 0) {
      generateSchedule();
    }
  }, [videoFiles, config.videosPerDay, config.selectedChannels, config.startDate, config.startTime, config.intervalMinutes]);

  const handleNext = () => {
    if (!config.videoFolder || videoFiles.length === 0) {
      alert('Vui lòng chọn folder chứa video!');
      return;
    }
    if (config.schedule.length === 0) {
      alert('Không có video nào để lên lịch!');
      return;
    }
    onNext();
  };

  // Tính toán thống kê
  const validVideosCount = videoFiles.filter(v => v.isValid).length;
  const videosPerChannel = config.selectedChannels.length > 0 
    ? Math.ceil(validVideosCount / config.selectedChannels.length) 
    : 0;
  const totalDays = config.videosPerDay > 0 
    ? Math.ceil(videosPerChannel / config.videosPerDay) 
    : 0;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">
        Bước 3: Cấu hình lịch upload
      </h2>

      <p className="text-sm text-gray-600 mb-6">
        Chọn folder video và cấu hình lịch upload tự động
      </p>

      <div className="space-y-6">
        {/* Select Video Folder */}
        <div className="p-6 bg-gray-50 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            📁 Folder chứa video
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={config.videoFolder}
              readOnly
              placeholder="Chưa chọn folder..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-white"
            />
            <button
              onClick={handleSelectFolder}
              disabled={validating}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400"
            >
              {validating ? '🔍 Đang kiểm tra...' : 'Chọn folder'}
            </button>
          </div>
          
          {videoFiles.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-green-600">
                ✅ Tìm thấy {videoFiles.length} video
              </p>
              <p className="text-sm font-semibold text-blue-600">
                ✓ {validVideosCount} video hợp lệ (≤60s)
              </p>
              {videoFiles.filter(v => !v.isValid).length > 0 && (
                <p className="text-sm font-semibold text-red-600">
                  ✗ {videoFiles.filter(v => !v.isValid).length} video không hợp lệ (Quá 60s)
                </p>
              )}
            </div>
          )}
          
          {/* Video List */}
          {videoFiles.length > 0 && (
            <div className="mt-4 max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
              {videoFiles.map((video, idx) => (
                <div
                  key={idx}
                  className={`p-3 border-b border-gray-100 flex items-center justify-between ${
                    video.isValid ? 'bg-white' : 'bg-red-50'
                  }`}
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {video.isValid ? '✅' : '❌'} {video.name}
                    </p>
                    {video.duration !== undefined && (
                      <p className={`text-xs ${video.isValid ? 'text-gray-500' : 'text-red-600'}`}>
                        {video.isValid 
                          ? `Thời lượng: ${Math.round(video.duration)}s` 
                          : video.error}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ngày bắt đầu */}
        <div className="p-6 bg-gray-50 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            📅 Ngày & giờ bắt đầu lên lịch
          </label>
          <div className="flex gap-3 items-center">
            <input
              type="date"
              value={config.startDate || new Date().toISOString().split('T')[0]}
              onChange={(e) => updateConfig({ startDate: e.target.value })}
              className="px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="time"
              value={config.startTime || '08:00'}
              onChange={(e) => updateConfig({ startTime: e.target.value })}
              className="px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">Bắt đầu từ ngày này</span>
          </div>
        </div>

        {/* Videos Per Day */}
        <div className="p-6 bg-gray-50 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            🎬 Số video mỗi ngày cho 1 kênh
          </label>
          <div className="flex items-center gap-4">
            <input
              type="number"
              min="1"
              max="20"
              value={config.videosPerDay || 6}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 1 && val <= 20) {
                  updateConfig({ videosPerDay: val });
                }
              }}
              className="w-24 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <span className="text-sm text-gray-600">video/ngày/kênh</span>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            💡 Mặc định: 6 video/ngày, các video cách nhau 120 phút
          </p>
        </div>

        {/* Interval Minutes */}
        <div className="p-6 bg-gray-50 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            ⏱️ Khoảng cách giữa các video (phút)
          </label>
          <div className="flex items-center gap-4">
            <input
              type="number"
              min="1"
              max="720"
              value={config.intervalMinutes || 120}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1 && val <= 720) {
                  updateConfig({ intervalMinutes: val });
                }
              }}
              className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <span className="text-sm text-gray-600">phút giữa mỗi video</span>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            💡 Ví dụ: nhập 90 = mỗi video cách nhau 1 tiếng 30 phút. Mặc định là 120 phút.
          </p>
        </div>

        {/* Video Title */}
        <div className="p-6 bg-gray-50 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            📝 Tiêu đề cho video
          </label>
          <textarea
            value={config.videoTitle || ''}
            onChange={(e) => updateConfig({ videoTitle: e.target.value })}
            className="block p-2.5 w-full text-sm text-gray-900 bg-white rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="Để trống = dùng tên file làm tiêu đề"
            rows={3}
          />
          <p className="mt-2 text-xs text-gray-500">
            💡 Tiêu đề này áp dụng cho tất cả video. Để trống sẽ dùng tên file.
          </p>
        </div>

        {/* Summary Stats */}
        {config.schedule.length > 0 && (
          <div className="p-6 bg-linear-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-gray-800 mb-4">📊 Thống kê lịch</h3>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-white p-4 rounded-lg shadow-sm">
                <p className="text-xs text-gray-600 mb-1">Tổng video</p>
                <p className="text-3xl font-bold text-blue-600">{validVideosCount}</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow-sm">
                <p className="text-xs text-gray-600 mb-1">Số kênh</p>
                <p className="text-3xl font-bold text-green-600">{config.selectedChannels.length}</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow-sm">
                <p className="text-xs text-gray-600 mb-1">Video/kênh</p>
                <p className="text-3xl font-bold text-purple-600">{videosPerChannel}</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow-sm">
                <p className="text-xs text-gray-600 mb-1">Tổng số ngày</p>
                <p className="text-3xl font-bold text-orange-600">{totalDays}</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg">
              <p className="text-sm text-gray-700 space-y-1">
                <span className="block">📅 <strong>Mỗi kênh:</strong> {config.videosPerDay} video/ngày × {totalDays} ngày</span>
                <span className="block">🎯 <strong>Tổng cộng:</strong> {config.selectedChannels.length} kênh × {videosPerChannel} video = {config.schedule.length} lịch</span>
                <span className="block">📆 <strong>Từ ngày:</strong> {config.startDate} lúc {config.startTime}</span>
                <span className="block">⏱️ <strong>Khoảng cách:</strong> {config.intervalMinutes || 120} phút giữa các video</span>
              </p>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-gray-700">
            ℹ️ <strong>Cách hoạt động:</strong><br />
            • Tự động phân chia <strong>{validVideosCount} video</strong> đều cho <strong>{config.selectedChannels.length} kênh</strong><br />
            • Mỗi kênh nhận <strong>~{videosPerChannel} video</strong>, upload <strong>{config.videosPerDay} video/ngày</strong><br />
            • Khung giờ cố định: 8h, 10h, 12h, 14h, 16h, 18h (hoặc tùy chỉnh)<br />
            • Tổng thời gian: <strong>{totalDays} ngày</strong>
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-4 mt-6">
        <button
          onClick={onPrev}
          className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
        >
          ← Quay lại
        </button>
        <button
          onClick={handleNext}
          disabled={!config.videoFolder || config.schedule.length === 0 || loading}
          className={`flex-1 px-6 py-2 rounded-lg font-medium text-white transition ${
            !config.videoFolder || config.schedule.length === 0 || loading
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {loading ? 'Đang xử lý...' : `Tiếp theo → (${config.schedule.length} lịch)`}
        </button>
      </div>
    </div>
  );
}