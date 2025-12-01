import React, { useState, useEffect } from 'react';
import { PlanlyAccount } from '../types/electron';

interface Step1APIProps {
  config: {
    token: string;
    teamId: string;
    channels: any[];
    accounts: Array<{
      accountId: string;
      accountName: string;
      teamId: string;
      token: string;
    }>;
    selectedChannels: string[];
  };
  updateConfig: (updates: Partial<Step1APIProps['config']>) => void;
  onNext: () => void;
  onShowBulkUpload?: () => void;
}

export default function Step1_API({ config, updateConfig, onNext, onShowBulkUpload }: Step1APIProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [savedAccounts, setSavedAccounts] = useState<PlanlyAccount[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [formAccountId, setFormAccountId] = useState<string>('');
  const [accountName, setAccountName] = useState<string>('');
  const [sessionAccountName, setSessionAccountName] = useState<string>('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);

  useEffect(() => {
    loadSavedAccounts();
  }, []);

  useEffect(() => {
    setSelectedAccountIds(prev => prev.filter(id => savedAccounts.some(acc => acc.id === id)));
  }, [savedAccounts]);

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
    setSuccessMessage('');

    try {
      const params = {
        token: config.token,
        teamId: config.teamId,
        accountName: sessionAccountName || savedAccounts.find(acc => acc.id === formAccountId)?.name,
        accountId: formAccountId || undefined
      };

      const result = await window.electronAPI.connectPlanly(params);

      if (result.success) {
        const accountId = result.accountId || formAccountId || `session_${Date.now()}`;
        const nameFallback = result.accountName || sessionAccountName || savedAccounts.find(acc => acc.id === formAccountId)?.name || `Account ${config.accounts.length + 1}`;
        const accountChannels = (result.channels || result.data || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          platform: c.platform || c.social_network || 'Unknown',
          accountId,
          accountName: nameFallback
        }));

        const filteredChannels = (config.channels || []).filter(ch => ch.accountId !== accountId);
        const filteredAccounts = (config.accounts || []).filter(acc => acc.accountId !== accountId);
        const totalChannels = filteredChannels.length + accountChannels.length;

        updateConfig({
          channels: [...filteredChannels, ...accountChannels],
          accounts: [...filteredAccounts, {
            accountId,
            accountName: nameFallback,
            teamId: config.teamId,
            token: config.token
          }],
          token: '',
          teamId: ''
        });

        setSuccessMessage(`Đã kết nối "${nameFallback}" (${accountChannels.length} kênh). Tổng cộng ${totalChannels} kênh.`);
        setSessionAccountName('');
        setFormAccountId('');
        onNext();
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
    setSuccessMessage('');
    setError('');
    setSessionAccountName('');
    setFormAccountId('');
  };

  const handleTeamIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateConfig({ teamId: e.target.value });
    setSuccessMessage('');
    setError('');
    setSessionAccountName('');
    setFormAccountId('');
  };

  const handleApplyAccountCredentials = async (accountId: string) => {
    if (!accountId) {
      setFormAccountId('');
      setSessionAccountName('');
      updateConfig({ token: '', teamId: '' });
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
        setFormAccountId(accountId);
        setSessionAccountName(account.name);
        setError('');
        setSuccessMessage('');
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

  const handleDeleteAccount = async (accountId: string, name: string) => {
    if (!confirm(`Bạn có chắc muốn xóa tài khoản "${name}"?`)) {
      return;
    }

    try {
      const result = await window.electronAPI.deleteAccount(accountId);
      if (result.success) {
        await loadSavedAccounts();
        if (formAccountId === accountId) {
          setFormAccountId('');
          setSessionAccountName('');
          updateConfig({ token: '', teamId: '' });
        }
        setSelectedAccountIds(prev => prev.filter(id => id !== accountId));
        alert(`✅ Đã xóa tài khoản "${name}"`);
      } else {
        setError(result.error || 'Không thể xóa tài khoản');
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi khi xóa tài khoản');
    }
  };

  const toggleSavedAccountSelection = (accountId: string) => {
    setSelectedAccountIds(prev =>
      prev.includes(accountId)
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId]
    );
  };

  const handleConnectSavedAccounts = async () => {
    if (selectedAccountIds.length === 0) {
      setError('Vui lòng chọn ít nhất một tài khoản đã lưu để kết nối');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      let updatedChannels = [...(config.channels || [])];
      let updatedAccounts = [...(config.accounts || [])];
      const successful: Array<{ name: string; count: number }> = [];
      const failed: string[] = [];

      for (const accountId of selectedAccountIds) {
        try {
          const accountResult = await window.electronAPI.getAccount(accountId);
          if (!accountResult.success || !accountResult.data) {
            failed.push(accountId);
            continue;
          }

          const accountData = accountResult.data;
          const connectResult = await window.electronAPI.connectPlanly({
            token: accountData.token,
            teamId: accountData.teamId,
            accountName: accountData.name,
            accountId
          });

          if (!connectResult.success) {
            failed.push(accountId);
            continue;
          }

          const accountName = connectResult.accountName || accountData.name || `Account ${accountId.slice(-4)}`;
          const accountChannels = (connectResult.channels || connectResult.data || []).map((c: any) => ({
            id: c.id,
            name: c.name,
            platform: c.platform || c.social_network || 'Unknown',
            accountId,
            accountName
          }));

          updatedChannels = [
            ...updatedChannels.filter(ch => ch.accountId !== accountId),
            ...accountChannels
          ];

          updatedAccounts = [
            ...updatedAccounts.filter(acc => acc.accountId !== accountId),
            {
              accountId,
              accountName,
              teamId: accountData.teamId,
              token: accountData.token
            }
          ];

          successful.push({ name: accountName, count: accountChannels.length });
        } catch (err) {
          console.error('connect saved account failed', err);
          failed.push(accountId);
        }
      }

      if (successful.length > 0) {
        const validChannelIds = new Set(updatedChannels.map(ch => ch.id));
        const filteredSelectedChannels = (config.selectedChannels || []).filter(id => validChannelIds.has(id));

        updateConfig({
          channels: updatedChannels,
          accounts: updatedAccounts,
          selectedChannels: filteredSelectedChannels,
          token: '',
          teamId: ''
        });

        setSelectedAccountIds([]);
        setFormAccountId('');
        setSessionAccountName('');

        setSuccessMessage(`Đã kết nối ${successful.length} tài khoản: ${successful.map(s => `${s.name} (${s.count} kênh)`).join(', ')}`);
        onNext();
      }

      if (successful.length === 0 && failed.length > 0) {
        const failedNames = failed.map(id => savedAccounts.find(acc => acc.id === id)?.name || id);
        setError(`Không thể kết nối các tài khoản: ${failedNames.join(', ')}`);
      } else if (failed.length > 0) {
        const failedNames = failed.map(id => savedAccounts.find(acc => acc.id === id)?.name || id);
        setError(`Một số tài khoản không thể kết nối: ${failedNames.join(', ')}`);
      }
    } catch (err: any) {
      setError(err.message || 'Không thể kết nối các tài khoản đã chọn');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveConnectedAccount = async (accountId: string) => {
    try {
      await window.electronAPI.disconnectPlanly(accountId);
    } catch (err) {
      console.warn('disconnect-planly error:', err);
    }

    const remainingAccounts = (config.accounts || []).filter(acc => acc.accountId !== accountId);
    const remainingChannels = (config.channels || []).filter(ch => ch.accountId !== accountId);
    const validChannelIds = new Set(remainingChannels.map(ch => ch.id));
    const remainingSelected = (config.selectedChannels || []).filter(id => validChannelIds.has(id));

    updateConfig({
      accounts: remainingAccounts,
      channels: remainingChannels,
      selectedChannels: remainingSelected
    });

    setSelectedAccountIds(prev => prev.filter(id => id !== accountId));
  };

  const canProceed = (config.accounts || []).length > 0;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">
        Bước 1: Kết nối với Planly
      </h2>

      <p className="text-sm text-gray-600 mb-6">
        Kết nối nhiều tài khoản nếu cần, sau đó tiếp tục sang bước chọn kênh
      </p>

      {savedAccounts.length > 0 && (
        <div className="mb-6 p-4 bg-linear-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tài khoản đã lưu
          </label>
          <p className="text-xs text-gray-600 mb-3">
            Chọn một hoặc nhiều tài khoản bên dưới rồi nhấn <strong>Kết nối tài khoản đã chọn</strong>.
          </p>

          <div className="space-y-3">
            {savedAccounts.map((acc) => {
              const isSelected = selectedAccountIds.includes(acc.id);
              const isApplied = formAccountId === acc.id;
              return (
                <div
                  key={acc.id}
                  className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-3 transition ${
                    isSelected ? 'border-purple-400 bg-white shadow-sm' : 'border-purple-100 bg-white/60'
                  }`}
                >
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSavedAccountSelection(acc.id)}
                      disabled={loading}
                      className={`mt-1 h-4 w-4 rounded focus:ring-2 focus:ring-purple-500 ${
                        loading ? 'text-purple-300 cursor-not-allowed' : 'text-purple-600'
                      }`}
                    />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{acc.name}</p>
                      <p className="text-xs text-gray-500">Team {acc.teamId.substring(0, 8)}...</p>
                      {isApplied && (
                        <span className="inline-block mt-1 text-xs font-medium text-green-600">
                          Đang dùng cho form
                        </span>
                      )}
                    </div>
                  </label>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <button
                      onClick={() => handleApplyAccountCredentials(acc.id)}
                      disabled={loading}
                      className={`px-3 py-2 text-xs font-medium rounded transition ${
                        loading
                          ? 'bg-purple-100 text-purple-300 cursor-not-allowed'
                          : 'text-purple-700 bg-purple-100 hover:bg-purple-200'
                      }`}
                    >
                      Dùng cho form
                    </button>
                    <button
                      onClick={() => handleDeleteAccount(acc.id, acc.name)}
                      disabled={loading}
                      className={`px-3 py-2 text-xs font-medium rounded transition ${
                        loading
                          ? 'bg-red-100 text-red-300 cursor-not-allowed'
                          : 'text-red-700 bg-red-100 hover:bg-red-200'
                      }`}
                    >
                      ✕ Xóa
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={handleConnectSavedAccounts}
            disabled={selectedAccountIds.length === 0 || loading}
            className={`mt-4 w-full py-2 px-4 rounded-lg font-medium transition ${
              selectedAccountIds.length === 0 || loading
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            {loading ? 'Đang kết nối...' : `Kết nối tài khoản đã chọn (${selectedAccountIds.length})`}
          </button>
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

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tên hiển thị cho tài khoản này (tùy chọn)
          </label>
          <input
            type="text"
            value={sessionAccountName}
            onChange={(e) => setSessionAccountName(e.target.value)}
            placeholder="VD: Account TikTok #1"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
          />
        </div>

        <button
          onClick={handleConnect}
          disabled={!config.token || !config.teamId || loading}
          className={`w-full py-3 px-4 rounded-lg font-medium text-white transition flex items-center justify-center gap-2 ${
            !config.token || !config.teamId || loading
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
          {loading ? 'Đang kết nối...' : 'Kết nối tài khoản'}
        </button>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <svg className="w-5 h-5 text-green-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-green-800">{successMessage}</p>
          </div>
        )}
      </div>

      {config.accounts.length > 0 && (
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-sm font-semibold text-blue-800 mb-3">Tài khoản đã kết nối ({config.accounts.length})</h3>
          <div className="space-y-2">
            {config.accounts.map((acc) => {
              const channelCount = config.channels.filter(ch => ch.accountId === acc.accountId).length;
              return (
                <div key={acc.accountId} className="flex items-center justify-between bg-white border border-blue-100 rounded-lg p-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{acc.accountName}</p>
                    <p className="text-xs text-gray-500">{channelCount} kênh · Team {acc.teamId.substring(0, 8)}...</p>
                  </div>
                  <button
                    onClick={() => handleRemoveConnectedAccount(acc.accountId)}
                    className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                  >
                    Xóa
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!showSaveForm ? (
        <button
          onClick={() => setShowSaveForm(true)}
          disabled={!config.token || !config.teamId}
          className={`mt-4 w-full py-2 px-4 rounded-lg border-2 border-dashed transition ${
            !config.token || !config.teamId
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

      {config.accounts.length > 0 && onShowBulkUpload && (
        <button
          onClick={onShowBulkUpload}
          className="mt-4 w-full py-3 px-6 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-all shadow-lg flex items-center justify-center gap-2"
        >
          <span className="text-xl">⚡</span>
          Bulk Upload (Upload hàng loạt với Pause/Resume)
        </button>
      )}

      <button
        onClick={onNext}
        disabled={!canProceed}
        className={`mt-4 w-full py-3 px-6 rounded-lg font-semibold transition ${
          canProceed ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        }`}
      >
        Tiếp tục bước 2 →
      </button>
    </div>
  );
}