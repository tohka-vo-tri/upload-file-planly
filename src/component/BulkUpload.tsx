import React, { useState, useEffect, useCallback } from 'react';
import { Play, Pause, X, RotateCcw, AlertCircle, CheckCircle, Trash2 } from 'lucide-react';

interface BulkUploadProps {
  token: string;
  teamId: string;
  channels: Array<{ id: string; name: string; platform: string }>;
  onBack: () => void;
}

interface UploadProgress {
  phase: 'upload' | 'schedule' | 'idle';
  current: number;
  total: number;
  fileName?: string;
  uploadedCount?: number;
  failedCount?: number;
}

interface UploadStatus {
  isRunning: boolean;
  isPaused: boolean;
  currentPhase: string;
  uploadedCount: number;
  failedCount: number;
  hasSavedProgress: boolean;
}

export default function BulkUpload({ token, teamId, channels, onBack }: BulkUploadProps) {
  const [folderPath, setFolderPath] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [videosPerDay, setVideosPerDay] = useState(3);
  const [timeSlots, setTimeSlots] = useState(['09:00', '12:00', '18:00']);
  const [title, setTitle] = useState('');
  
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({
    isRunning: false,
    isPaused: false,
    currentPhase: 'idle',
    uploadedCount: 0,
    failedCount: 0,
    hasSavedProgress: false
  });
  
  const [progress, setProgress] = useState<UploadProgress>({
    phase: 'idle',
    current: 0,
    total: 0
  });
  
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');
  
  // Check for saved progress on mount
  useEffect(() => {
    checkStatus();
  }, []);
  
  // Listen to progress events
  useEffect(() => {
    const cleanup = window.electronAPI.onBulkUploadProgress((data) => {
      setProgress(data);
    });
    
    return cleanup;
  }, []);
  
  const checkStatus = async () => {
    const status = await window.electronAPI.getBulkUploadStatus();
    setUploadStatus(status);
  };
  
  const showMessage = (msg: string, type: 'success' | 'error' | 'info') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 5000);
  };
  
  const handleSelectFolder = async () => {
    const result = await window.electronAPI.selectVideoFolder();
    if (result.success && result.path) {
      setFolderPath(result.path);
      showMessage(`Đã chọn ${result.files?.length || 0} video`, 'success');
    }
  };
  
  const handleChannelToggle = (channelId: string) => {
    setSelectedChannels(prev => 
      prev.includes(channelId)
        ? prev.filter(id => id !== channelId)
        : [...prev, channelId]
    );
  };
  
  const handleTimeSlotsChange = (newCount: number) => {
    setVideosPerDay(newCount);
    const newSlots = Array(newCount).fill('').map((_, i) => {
      return timeSlots[i] || `${9 + i * 3}:00`;
    });
    setTimeSlots(newSlots);
  };
  
  const handleTimeSlotChange = (index: number, value: string) => {
    const newSlots = [...timeSlots];
    newSlots[index] = value;
    setTimeSlots(newSlots);
  };
  
  const handleStart = async (resumeFromSaved: boolean = false) => {
    if (!resumeFromSaved) {
      // Validate inputs for new upload
      if (!folderPath) {
        showMessage('Vui lòng chọn thư mục video', 'error');
        return;
      }
      if (selectedChannels.length === 0) {
        showMessage('Vui lòng chọn ít nhất 1 channel', 'error');
        return;
      }
      if (!startDate) {
        showMessage('Vui lòng chọn ngày bắt đầu', 'error');
        return;
      }
    }
    
    setUploadStatus(prev => ({ ...prev, isRunning: true, isPaused: false }));
    
    const result = await window.electronAPI.bulkUploadSchedule({
      folderPath,
      channelIds: selectedChannels,
      startDate,
      videosPerDay,
      timeSlots,
      title,
      resumeFromSaved
    });
    
    if (result.success) {
      showMessage(
        `✅ Hoàn thành! Uploaded: ${result.stats?.uploadedCount}, Failed: ${result.stats?.failedCount}`,
        'success'
      );
      setProgress({ phase: 'idle', current: 0, total: 0 });
    } else if (result.cancelled) {
      showMessage(result.message || 'Upload đã bị hủy', 'info');
    } else {
      showMessage(`❌ Lỗi: ${result.error}`, 'error');
    }
    
    await checkStatus();
  };
  
  const handlePause = async () => {
    const result = await window.electronAPI.pauseBulkUpload();
    if (result.success) {
      showMessage('⏸️ Upload đã tạm dừng', 'info');
      await checkStatus();
    }
  };
  
  const handleResume = async () => {
    const result = await window.electronAPI.resumeBulkUpload();
    if (result.success) {
      showMessage('▶️ Upload đã tiếp tục', 'success');
      await checkStatus();
    }
  };
  
  const handleCancel = async () => {
    if (!confirm('Bạn có chắc muốn hủy upload? Progress sẽ được lưu lại.')) {
      return;
    }
    
    const result = await window.electronAPI.cancelBulkUpload();
    if (result.success) {
      showMessage(result.message || 'Upload đã bị hủy', 'info');
      await checkStatus();
    }
  };
  
  const handleClearProgress = async () => {
    if (!confirm('Xóa progress đã lưu? Bạn sẽ phải bắt đầu lại từ đầu.')) {
      return;
    }
    
    const result = await window.electronAPI.clearBulkUploadProgress();
    if (result.success) {
      showMessage('🗑️ Progress đã được xóa', 'success');
      await checkStatus();
      setProgress({ phase: 'idle', current: 0, total: 0 });
    }
  };
  
  const progressPercent = progress.total > 0 
    ? Math.round((progress.current / progress.total) * 100) 
    : 0;
  
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Bulk Upload với Pause/Resume</h2>
          <button
            onClick={onBack}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            ← Quay lại
          </button>
        </div>
        
        {/* Message Display */}
        {message && (
          <div className={`mb-4 p-4 rounded-lg flex items-center gap-2 ${
            messageType === 'success' ? 'bg-green-100 text-green-800' :
            messageType === 'error' ? 'bg-red-100 text-red-800' :
            'bg-blue-100 text-blue-800'
          }`}>
            {messageType === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
            <span>{message}</span>
          </div>
        )}
        
        {/* Saved Progress Banner */}
        {uploadStatus.hasSavedProgress && !uploadStatus.isRunning && (
          <div className="mb-4 p-4 bg-yellow-100 border border-yellow-300 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="text-yellow-600" size={20} />
                <div>
                  <p className="font-semibold text-yellow-800">
                    Phát hiện upload chưa hoàn thành
                  </p>
                  <p className="text-sm text-yellow-700">
                    Đã upload: {uploadStatus.uploadedCount} video | Lỗi: {uploadStatus.failedCount}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleStart(true)}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2"
                >
                  <RotateCcw size={16} />
                  Tiếp tục
                </button>
                <button
                  onClick={handleClearProgress}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-2"
                >
                  <Trash2 size={16} />
                  Xóa & Bắt đầu lại
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Configuration Form */}
        {!uploadStatus.isRunning && (
          <div className="space-y-4 mb-6">
            {/* Folder Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Thư mục chứa video
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={folderPath}
                  readOnly
                  placeholder="Chọn thư mục..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                />
                <button
                  onClick={handleSelectFolder}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  Chọn folder
                </button>
              </div>
            </div>
            
            {/* Channel Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Chọn Channels ({selectedChannels.length} đã chọn)
              </label>
              <div className="border border-gray-300 rounded-lg p-4 max-h-48 overflow-y-auto">
                {channels.map(channel => (
                  <label key={channel.id} className="flex items-center gap-2 mb-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={selectedChannels.includes(channel.id)}
                      onChange={() => handleChannelToggle(channel.id)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">
                      {channel.name} <span className="text-gray-500">({channel.platform})</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            
            {/* Start Date */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Ngày bắt đầu
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            
            {/* Videos Per Day & Time Slots */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Số video mỗi ngày: {videosPerDay}
              </label>
              <input
                type="range"
                min="1"
                max="10"
                value={videosPerDay}
                onChange={(e) => handleTimeSlotsChange(parseInt(e.target.value))}
                className="w-full"
              />
              <div className="mt-2 grid grid-cols-5 gap-2">
                {timeSlots.map((slot, index) => (
                  <input
                    key={index}
                    type="time"
                    value={slot}
                    onChange={(e) => handleTimeSlotChange(index, e.target.value)}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                ))}
              </div>
            </div>
            
            {/* Title */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Tiêu đề (để trống = dùng tên file)
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nhập tiêu đề chung cho tất cả video..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        )}
        
        {/* Progress Display */}
        {uploadStatus.isRunning && (
          <div className="mb-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">
                {progress.phase === 'upload' ? '📤 Đang upload video...' : '📅 Đang tạo lịch...'}
              </span>
              <span className="text-sm text-gray-600">
                {progress.current} / {progress.total}
              </span>
            </div>
            
            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
              <div 
                className="bg-blue-500 h-full transition-all duration-300 flex items-center justify-center text-xs text-white font-semibold"
                style={{ width: `${progressPercent}%` }}
              >
                {progressPercent > 5 && `${progressPercent}%`}
              </div>
            </div>
            
            {progress.fileName && (
              <p className="text-sm text-gray-600">
                📹 {progress.fileName}
              </p>
            )}
            
            {progress.uploadedCount !== undefined && (
              <div className="flex gap-4 text-sm">
                <span className="text-green-600">✓ Uploaded: {progress.uploadedCount}</span>
                <span className="text-red-600">✗ Failed: {progress.failedCount || 0}</span>
              </div>
            )}
          </div>
        )}
        
        {/* Control Buttons */}
        <div className="flex gap-3">
          {!uploadStatus.isRunning ? (
            <button
              onClick={() => handleStart(false)}
              disabled={!folderPath || selectedChannels.length === 0 || !startDate}
              className="flex-1 px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Play size={20} />
              Bắt đầu Upload
            </button>
          ) : uploadStatus.isPaused ? (
            <>
              <button
                onClick={handleResume}
                className="flex-1 px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center justify-center gap-2"
              >
                <Play size={20} />
                Tiếp tục
              </button>
              <button
                onClick={handleCancel}
                className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center justify-center gap-2"
              >
                <X size={20} />
                Hủy
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handlePause}
                className="flex-1 px-6 py-3 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 flex items-center justify-center gap-2"
              >
                <Pause size={20} />
                Tạm dừng
              </button>
              <button
                onClick={handleCancel}
                className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center justify-center gap-2"
              >
                <X size={20} />
                Hủy
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
