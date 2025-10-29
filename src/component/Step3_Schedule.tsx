import React, { useState, useEffect } from 'react';

interface VideoSchedule {
  channelId: string;
  channelName: string;
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
    startDate?: string; // YYYY-MM-DD
    startTime?: string; // HH:mm
    intervalMinutes?: number; // Minutes between each video
    videoTitle?: string; // Title for all videos
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
        
        // Validate videos in parallel batches to improve performance
        const BATCH_SIZE = 10; // Process 10 videos at a time
        const validatedFiles: VideoFile[] = [];
        
        // Helper function to validate a single video
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
        
        // Process videos in batches
        for (let i = 0; i < result.files.length; i += BATCH_SIZE) {
          const batch = result.files.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.all(batch.map(validateVideo));
          validatedFiles.push(...batchResults);
          
          // Update UI with progress
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

  const handleVideosPerDayChange = (value: string) => {
    // Allow empty input for typing
    if (value === '') {
      updateConfig({ videosPerDay: '' as any });
      return;
    }
    
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 1 && numValue <= 10) {
      updateConfig({ videosPerDay: numValue });
    }
  };

  const handleStartDateChange = (dateValue: string) => {
    updateConfig({ startDate: dateValue });
  };

  const handleStartTimeChange = (timeValue: string) => {
    updateConfig({ startTime: timeValue });
  };

  const handleIntervalChange = (value: string) => {
    // Allow empty input for typing
    if (value === '') {
      updateConfig({ intervalMinutes: '' as any });
      return;
    }
    
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 1 && numValue <= 1440) {
      updateConfig({ intervalMinutes: numValue });
    }
  };

  const handleTitleChange = (value: string) => {
    updateConfig({ videoTitle: value });
  };

  const generateSchedule = () => {
    setLoading(true);
    
    try {
      const selectedChannelIds = config.selectedChannels;
      const channelsInfo = config.channels.filter(c => selectedChannelIds.includes(c.id));
      const totalChannels = channelsInfo.length;
      const videosPerDay = config.videosPerDay;
      
      // Only use valid videos
      const validVideos = videoFiles.filter(v => v.isValid);
      
      const schedule: VideoSchedule[] = [];
      let videoIndex = 0;
      // Build starting datetime from config.startDate and config.startTime
      let currentDate: Date;
      if (config.startDate) {
        const time = config.startTime || '00:00';
        // Use local time string YYYY-MM-DDTHH:mm:00
        currentDate = new Date(`${config.startDate}T${time}:00`);
        if (isNaN(currentDate.getTime())) {
          currentDate = new Date();
        }
      } else {
        currentDate = new Date();
      }
      
      // Phân chia video: cùng 1 khung giờ có nhiều video từ các kênh khác nhau
      // Người dùng tự chọn khoảng cách giữa các video (intervalMinutes)
      
      const intervalMins = config.intervalMinutes || 60; // Default 60 minutes
      
      while (videoIndex < validVideos.length) {
        // Mỗi ngày có videosPerDay khung giờ
        for (let timeSlot = 0; timeSlot < videosPerDay && videoIndex < validVideos.length; timeSlot++) {
          // Generate current time slot (same time for all channels)
          const y = currentDate.getFullYear();
          const m = String(currentDate.getMonth() + 1).padStart(2, '0');
          const d = String(currentDate.getDate()).padStart(2, '0');
          const hh = String(currentDate.getHours()).padStart(2, '0');
          const mm = String(currentDate.getMinutes()).padStart(2, '0');
          const dateStr = `${y}-${m}-${d}T${hh}:${mm}:00`;
          
          // Assign 1 video to each channel at this time slot
          for (let i = 0; i < totalChannels && videoIndex < validVideos.length; i++) {
            const channel = channelsInfo[i];
            
            schedule.push({
              channelId: channel.id,
              channelName: channel.name,
              date: dateStr, // Same time for all channels in this slot
              videoPath: validVideos[videoIndex].path,
              videoName: validVideos[videoIndex].name
            });
            videoIndex++;
          }
          
          // Move to next time slot (add user-defined interval)
          currentDate.setMinutes(currentDate.getMinutes() + intervalMins);
        }
        
        // Reset to start time for next day
        if (config.startDate && config.startTime) {
          const [hh, mm] = config.startTime.split(':').map(n => parseInt(n, 10));
          currentDate.setDate(currentDate.getDate() + 1);
          currentDate.setHours(hh || 0, mm || 0, 0, 0);
        } else {
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }
      
      updateConfig({ schedule });
    } catch (error) {
      console.error('Error generating schedule:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const validVideos = videoFiles.filter(v => v.isValid);
    if (validVideos.length > 0 && config.selectedChannels.length > 0) {
      generateSchedule();
    }
  }, [videoFiles, config.videosPerDay, config.selectedChannels]);

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

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">
        Bước 3: Cấu hình lịch upload
      </h2>

      <p className="text-sm text-gray-600 mb-6">
        Chọn folder video và cấu hình lịch upload
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
                ✓ {videoFiles.filter(v => v.isValid).length} video hợp lệ (≤60s)
              </p>
              {videoFiles.filter(v => !v.isValid).length > 0 && (
                <p className="text-sm font-semibold text-red-600">
                  ✗ {videoFiles.filter(v => !v.isValid).length} video không hợp lệ ({'>'}60s)
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

        {/* Start date/time */}
        <div className="p-6 bg-gray-50 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-3">⏰ Ngày & giờ bắt đầu</label>
          <div className="flex gap-3 items-center">
            <input
              type="date"
              value={config.startDate || new Date().toISOString().split('T')[0]}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg outline-none"
            />
            <input
              type="time"
              value={config.startTime || new Date().toTimeString().slice(0,5)}
              onChange={(e) => handleStartTimeChange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg outline-none"
            />
            <div className="text-sm text-gray-600">Bắt đầu lên lịch từ ngày & giờ này</div>
          </div>
        </div>

        {/* Videos Per Day */}
        <div className="p-6 bg-gray-50 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            📅 Số video mỗi ngày cho 1 kênh
          </label>
          <div className="flex items-center gap-4">
            <input
              type="number"
              min="1"
              max="10"
              value={config.videosPerDay}
              onChange={(e) => handleVideosPerDayChange(e.target.value)}
              className="w-24 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <span className="text-sm text-gray-600">video/ngày/kênh</span>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            💡 Mỗi kênh sẽ nhận {config.videosPerDay || 0} video mỗi ngày
          </p>
        </div>

        {/* Time Interval Between Videos */}
        <div className="p-6 bg-gray-50 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            ⏱️ Khoảng cách giữa các video (phút)
          </label>
          <div className="flex items-center gap-4">
            <input
              type="number"
              min="1"
              max="1440"
              value={config.intervalMinutes || 60}
              onChange={(e) => handleIntervalChange(e.target.value)}
              className="w-24 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <span className="text-sm text-gray-600">phút</span>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            💡 Mỗi khung giờ sẽ có {config.selectedChannels.length} video (1 video/kênh). Các khung giờ cách nhau {config.intervalMinutes || 60} phút ({((config.intervalMinutes || 60) / 60).toFixed(1)} giờ).
          </p>
        </div>

        <div className="p-6 bg-gray-50 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            📝 Tiêu đề cho video
          </label>
          <div className="flex items-center gap-4">
            <textarea
              value={config.videoTitle || ''}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="block p-2.5 w-full text-sm text-gray-900 bg-white rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Nhập tiêu đề chung cho tất cả video..."
              rows={3}
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            💡 Tiêu đề này sẽ được áp dụng cho tất cả video khi upload lên Planly
          </p>
        </div>


        {/* Schedule Preview */}
        {config.schedule.length > 0 && (
          <div className="p-6 bg-linear-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-gray-800 mb-3">📊 Tóm tắt lịch</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-white p-3 rounded-lg">
                <p className="text-gray-600">Tổng video</p>
                <p className="text-2xl font-bold text-blue-600">{config.schedule.length}</p>
              </div>
              <div className="bg-white p-3 rounded-lg">
                <p className="text-gray-600">Số kênh</p>
                <p className="text-2xl font-bold text-green-600">{config.selectedChannels.length}</p>
              </div>
              <div className="bg-white p-3 rounded-lg">
                <p className="text-gray-600">Số khung giờ</p>
                <p className="text-2xl font-bold text-purple-600">
                  {new Set(config.schedule.map(s => s.date)).size}
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg">
                <p className="text-gray-600">Khung giờ/ngày</p>
                <p className="text-2xl font-bold text-orange-600">{config.videosPerDay}</p>
              </div>
            </div>
            <div className="mt-4 p-3 bg-white rounded-lg">
              <p className="text-xs text-gray-600">
                💡 <strong>Mỗi khung giờ có {config.selectedChannels.length} video</strong> (1 video từ mỗi kênh)
                <br />
                📅 <strong>Mỗi ngày có {config.videosPerDay} khung giờ</strong> = {config.videosPerDay * config.selectedChannels.length} video/ngày
                <br />
                🗓️ <strong>Tổng số ngày cần:</strong> {Math.ceil(config.schedule.length / (config.videosPerDay * config.selectedChannels.length))} ngày
              </p>
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-gray-700">
            ℹ️ <strong>Cách hoạt động:</strong><br />
            • <strong>Cùng 1 khung giờ</strong> sẽ có {config.selectedChannels.length} video (1 video từ mỗi kênh)<br />
            • Mỗi kênh nhận {config.videosPerDay} video mỗi ngày<br />
            • Các khung giờ cách nhau {config.intervalMinutes || 60} phút ({((config.intervalMinutes || 60) / 60).toFixed(1)} giờ)<br />
            • Tất cả {videoFiles.filter(v => v.isValid).length} video hợp lệ sẽ được upload lên Planly
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
          className={`flex-1 px-6 py-2 rounded-lg font-medium text-white transition ${!config.videoFolder || config.schedule.length === 0 || loading
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700'
            }`}
        >
          {loading ? 'Đang xử lý...' : 'Tiếp theo →'}
        </button>
      </div>
    </div>
  );
}
