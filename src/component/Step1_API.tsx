import React, { useState, useEffect } from 'react';
import { PlanlyAccount } from '../types/electron';

interface Step1APIProps {
  config: {
    token: string;
    teamId: string;
    channels: any[];
  };
  updateConfig: (updates: Partial<Step1APIProps['config']>) => void;
  onNext: () => void;
}

export default function Step1_API({ config, updateConfig, onNext }: Step1APIProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  // Account management states
  const [savedAccounts, setSavedAccounts] = useState<PlanlyAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [accountName, setAccountName] = useState<string>('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);

  // Load saved accounts on mount
  useEffect(() => {
    loadSavedAccounts();
  }, []);

  const loadSavedAccounts = async () => {
    try {
      const result = await window.electronAPI.loadAccounts();
      if (result.success && result.data) {
        setSavedAccounts(result.data);
      }
    } catch (err) {
      console.error('Error loading accounts:', err);
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const result = await window.electronAPI.connectPlanly(
        config.token,
        config.teamId
      );

      if (result.success) {
        updateConfig({ channels: result.data });
        setSuccess(true);
        
        // Auto proceed after 1 second
        setTimeout(() => {
          onNext();
        }, 1000);
      } else {
        setError(result.error || 'Kết nối thất bại');
      }
    } catch (err: any) {
      setError(err.message || 'Đã xảy ra lỗi');
    } finally {
      setLoading(false);
    }
  };

  const handleTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateConfig({ token: e.target.value });
    setSuccess(false);
    setError('');
  };

  const handleTeamIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateConfig({ teamId: e.target.value });
    setSuccess(false);
    setError('');
    setSelectedAccountId(''); // Clear selected account
  };

  const handleSelectAccount = async (accountId: string) => {
    if (!accountId) {
      setSelectedAccountId('');
      return;
    }

    try {
      const result = await window.electronAPI.getAccount(accountId);
      if (result.success && result.data) {
        const account = result.data;
        updateConfig({
          token: account.token,
          teamId: account.teamId
        });
        setSelectedAccountId(accountId);
        setAccountName(account.name);
        setError('');
        setSuccess(false);
      }
    } catch (err: any) {
      setError(err.message || 'Không thể tải tài khoản');
    }
  };

  const handleSaveAccount = async () => {
    if (!accountName.trim()) {
      setError('Vui lòng nhập tên cho tài khoản');
      return;
    }

    if (!config.token || !config.teamId) {
      setError('Vui lòng nhập Token và Team ID trước');
      return;
    }

    setSavingAccount(true);
    try {
      const result = await window.electronAPI.saveAccount({
        name: accountName,
        token: config.token,
        teamId: config.teamId
      });

      if (result.success) {
        await loadSavedAccounts();
        setShowSaveForm(false);
        setAccountName('');
        alert(`✅ Đã lưu tài khoản "${accountName}" thành công!`);
      } else {
        setError(result.error || 'Không thể lưu tài khoản');
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi khi lưu tài khoản');
    } finally {
      setSavingAccount(false);
    }
  };

  const handleDeleteAccount = async (accountId: string, accountName: string) => {
    if (!confirm(`Bạn có chắc muốn xóa tài khoản "${accountName}"?`)) {
      return;
    }

    try {
      const result = await window.electronAPI.deleteAccount(accountId);
      if (result.success) {
        await loadSavedAccounts();
        if (selectedAccountId === accountId) {
          setSelectedAccountId('');
          updateConfig({ token: '', teamId: '' });
        }
        alert(`✅ Đã xóa tài khoản "${accountName}"`);
      } else {
        setError(result.error || 'Không thể xóa tài khoản');
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi khi xóa tài khoản');
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">
        Bước 1: Kết nối với Planly
      </h2>
      
      <p className="text-sm text-gray-600 mb-6">
        Chọn tài khoản đã lưu hoặc nhập thông tin API mới
      </p>

      {/* Saved Accounts Dropdown */}
      {savedAccounts.length > 0 && (
        <div className="mb-6 p-4 bg-linear-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">
           Tài khoản đã lưu
          </label>
          <div className="flex gap-2">
            <select
              value={selectedAccountId}
              onChange={(e) => handleSelectAccount(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition bg-white"
            >
              <option value="">-- Chọn tài khoản --</option>
              {savedAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.teamId.substring(0, 8)}...)
                </option>
              ))}
            </select>
            {selectedAccountId && (
              <button
                onClick={() => {
                  const account = savedAccounts.find(a => a.id === selectedAccountId);
                  if (account) handleDeleteAccount(account.id, account.name);
                }}
                className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition"
                title="Xóa tài khoản"
              >
                ✕ Xóa
              </button>
            )}
          </div>
        </div>
      )}

      <div className="p-6 bg-gray-50 rounded-lg">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Team ID
          </label>
          <input
            type="text"
            value={config.teamId}
            onChange={handleTeamIdChange}
            placeholder="034c3044-7caf-4f0b-a374-890cc5784269"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
          />
          <p className="mt-1 text-xs text-gray-500">
            Lấy từ URL hoặc Settings trong Planly
          </p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            API Token
          </label>
          <input
            type="password"
            value={config.token}
            onChange={handleTokenChange}
            placeholder="AWP7K0o+ZKjKAqkorv+Hn2PEoSgf7kV1s5NsF68K17I"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
          />
          <p className="mt-1 text-xs text-gray-500">
            Bearer token từ Developer Console
          </p>
        </div>

        <button
          onClick={handleConnect}
          disabled={!config.token || !config.teamId || loading || success}
          className={`w-full py-3 px-4 rounded-lg font-medium text-white transition flex items-center justify-center gap-2 ${
            !config.token || !config.teamId || loading || success
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
          }`}
        >
          {loading && (
            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {loading ? 'Đang kết nối...' : success ? 'Đã kết nối!' : 'Kết nối'}
        </button>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <svg className="w-5 h-5 text-green-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-green-800">
              Kết nối thành công! Tìm thấy {config.channels.length} kênh.
            </p>
          </div>
        )}
      </div>

      {/* Save Account Section */}
      {!showSaveForm ? (
        <button
          onClick={() => setShowSaveForm(true)}
          disabled={!config.token || !config.teamId || success}
          className={`mt-4 w-full py-2 px-4 rounded-lg border-2 border-dashed transition ${
            !config.token || !config.teamId || success
              ? 'border-gray-300 text-gray-400 cursor-not-allowed'
              : 'border-blue-400 text-blue-600 hover:bg-blue-50'
          }`}
        >
           Lưu tài khoản này
        </button>
      ) : (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tên tài khoản
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="VD: Tài khoản chính, Tài khoản phụ..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
            />
            <button
              onClick={handleSaveAccount}
              disabled={savingAccount || !accountName.trim()}
              className={`px-6 py-2 rounded-lg font-medium text-white transition ${
                savingAccount || !accountName.trim()
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {savingAccount ? '...' : '💾 Lưu'}
            </button>
            <button
              onClick={() => {
                setShowSaveForm(false);
                setAccountName('');
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs text-gray-700">
          <strong>Cách lấy Token và Team ID:</strong><br/>
          1. Đăng nhập vào app.planly.com<br/>
          2. Nhấn F12 → Console<br/>
          3. Gõ: <code className="px-1 py-0.5 bg-gray-200 rounded text-xs">localStorage.getItem('token')</code><br/>
          4. Gõ: <code className="px-1 py-0.5 bg-gray-200 rounded text-xs">localStorage.getItem('team_id')</code>
        </p>
      </div>
    </div>
  );
}