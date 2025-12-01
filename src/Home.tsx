import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import './index.css';
import Step1_API from './component/Step1_API';
import Step2_Channels from './component/Step2_Channels';
import Step3_Schedule from './component/Step3_Schedule';
import Step4_Preview from './component/Step4_Preview';
import BulkUpload from './component/BulkUpload';

interface Channel {
  id: string;
  name: string;
  platform: string;
  accountId: string;
  accountName: string;
}

interface ConnectedAccount {
  accountId: string;
  accountName: string;
  teamId: string;
  token: string;
}

interface VideoSchedule {
  channelId: string;
  channelName: string;
  accountId: string;
  // ISO datetime when the video should be published (e.g. 2025-10-26T09:00:00.000Z or without zone)
  date: string;
  videoPath: string;
  videoName: string;
}

interface Config {
  token: string;
  teamId: string;
  channels: Channel[];
  selectedChannels: string[];
  videoFolder: string;
  videosPerDay: number;
  schedule: VideoSchedule[];
  accounts: ConnectedAccount[];
  // Scheduling start
  startDate?: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  intervalMinutes?: number; // Time spacing between videos (default 30)
  videoTitle?: string; // Title for all videos
}

const App = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [config, setConfig] = useState<Config>({
    token: '',
    teamId: '',
    channels: [],
    selectedChannels: [],
    videoFolder: '',
    videosPerDay: 1,
    schedule: [],
    accounts: [],
    startDate: new Date().toISOString().split('T')[0],
    startTime: new Date().toTimeString().slice(0,5),
    intervalMinutes: 60,
    videoTitle: ''
  });

  const updateConfig = (updates: Partial<Config>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const primaryAccount = config.accounts[config.accounts.length - 1];

  const handleNext = () => {
    setCurrentStep(prev => prev + 1);
  };

  const handlePrev = () => {
    setCurrentStep(prev => prev - 1);
  };

  const handleReset = () => {
    setConfig({
      token: '',
      teamId: '',
      channels: [],
      selectedChannels: [],
      videoFolder: '',
      videosPerDay: 1,
      schedule: [],
      accounts: [],
      startDate: new Date().toISOString().split('T')[0],
      startTime: new Date().toTimeString().slice(0,5),
      intervalMinutes: 60,
      videoTitle: ''
    });
    setCurrentStep(1);
    setShowBulkUpload(false);
  };
  
  const handleShowBulkUpload = () => {
    setShowBulkUpload(true);
  };
  
  const handleBackFromBulkUpload = () => {
    setShowBulkUpload(false);
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              Planly Upload Tool
            </h1>
            <p className="text-gray-600">
              Công cụ tải video lên Planly một cách dễ dàng
            </p>
          </div>

          {/* Show Bulk Upload or Normal Steps */}
          {showBulkUpload ? (
            <BulkUpload
              token={primaryAccount?.token || config.token}
              teamId={primaryAccount?.teamId || config.teamId}
              channels={config.channels.filter(channel => channel.accountId === (primaryAccount?.accountId ?? ''))}
              onBack={handleBackFromBulkUpload}
            />
          ) : (
            <>
              {/* Progress Steps */}
              <div className="flex items-center justify-between mb-8">
                {[1, 2, 3, 4].map((step) => (
                  <div key={step} className="flex items-center">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition ${
                        step <= currentStep
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {step}
                    </div>
                    {step < 4 && (
                      <div
                        className={`w-20 h-1 mx-2 transition ${
                          step < currentStep ? 'bg-blue-600' : 'bg-gray-200'
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Step Content */}
              <div className="mb-8">
                {currentStep === 1 && (
                  <Step1_API
                    config={config}
                    updateConfig={updateConfig}
                    onNext={handleNext}
                    onShowBulkUpload={handleShowBulkUpload}
                  />
                )}
                {currentStep === 2 && (
                  <Step2_Channels
                    config={config}
                    updateConfig={updateConfig}
                    onNext={handleNext}
                    onPrev={handlePrev}
                  />
                )}
                {currentStep === 3 && (
                  <Step3_Schedule
                    config={config}
                    updateConfig={updateConfig}
                    onNext={handleNext}
                    onPrev={handlePrev}
                  />
                )}
                {currentStep === 4 && (
                  <Step4_Preview
                    config={config}
                    onPrev={handlePrev}
                    onReset={handleReset}
                  />
                )}
              </div>

              {/* Navigation Buttons - Removed as each component handles its own navigation */}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const root = createRoot(document.body);
root.render(<App />);