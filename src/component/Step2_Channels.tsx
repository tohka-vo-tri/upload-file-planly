import React, { useState } from 'react';

interface Channel {
  id: string;
  name: string;
  platform: string;
}

interface Step2ChannelsProps {
  config: {
    channels: Channel[];
    selectedChannels: string[];
  };
  updateConfig: (updates: any) => void;
  onNext: () => void;
  onPrev: () => void;
}

export default function Step2_Channels({ config, updateConfig, onNext, onPrev }: Step2ChannelsProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredChannels = config.channels.filter(channel =>
    channel.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleToggleChannel = (channelId: string) => {
    const isSelected = config.selectedChannels.includes(channelId);
    const newSelected = isSelected
      ? config.selectedChannels.filter(id => id !== channelId)
      : [...config.selectedChannels, channelId];
    
    updateConfig({ selectedChannels: newSelected });
  };

  const handleSelectAll = () => {
    if (config.selectedChannels.length === config.channels.length) {
      updateConfig({ selectedChannels: [] });
    } else {
      updateConfig({ selectedChannels: config.channels.map(c => c.id) });
    }
  };

  const handleNext = () => {
    if (config.selectedChannels.length === 0) {
      alert('Vui lòng chọn ít nhất một kênh!');
      return;
    }
    onNext();
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">
        Bước 2: Chọn kênh
      </h2>
      
      <p className="text-sm text-gray-600 mb-6">
        Chọn các kênh bạn muốn upload video ({config.selectedChannels.length} đã chọn)
      </p>

      {/* Search & Select All */}
      <div className="mb-4 space-y-3">
        <input
          type="text"
          placeholder="Tìm kiếm kênh..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
        />

        <button
          onClick={handleSelectAll}
          className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
        >
          {config.selectedChannels.length === config.channels.length ? '❌ Bỏ chọn tất cả' : '✅ Chọn tất cả'}
        </button>
      </div>

      {/* Channels List */}
      <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
        {filteredChannels.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>Không tìm thấy kênh nào</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredChannels.map((channel) => {
              const isSelected = config.selectedChannels.includes(channel.id);
              return (
                <label
                  key={channel.id}
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggleChannel(channel.id)}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">{channel.name}</p>
                    <p className="text-xs text-gray-500">{channel.platform}</p>
                  </div>
                  {isSelected && (
                    <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary */}
      {config.selectedChannels.length > 0 && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800">
            ✅ Đã chọn <strong>{config.selectedChannels.length}</strong> kênh
          </p>
        </div>
      )}

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
          disabled={config.selectedChannels.length === 0}
          className={`flex-1 px-6 py-2 rounded-lg font-medium text-white transition ${
            config.selectedChannels.length === 0
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          Tiếp theo →
        </button>
      </div>
    </div>
  );
}
