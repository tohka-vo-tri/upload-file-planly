// Account storage helper for Planly accounts
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface PlanlyAccount {
  id: string;
  name: string;
  teamId: string;
  token: string;
  createdAt: string;
  lastUsed?: string;
}

interface AccountsData {
  accounts: PlanlyAccount[];
}

// Get accounts file path in user data directory
function getAccountsFilePath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'planly-accounts.json');
}

/**
 * Load all saved accounts
 */
export function loadAccounts(): PlanlyAccount[] {
  try {
    const filePath = getAccountsFilePath();
    
    if (!fs.existsSync(filePath)) {
      return [];
    }
    
    const data = fs.readFileSync(filePath, 'utf-8');
    const parsed: AccountsData = JSON.parse(data);
    
    return parsed.accounts || [];
  } catch (error) {
    console.error('[AccountStorage] Error loading accounts:', error);
    return [];
  }
}

/**
 * Save a new account or update existing one
 */
export function saveAccount(account: Omit<PlanlyAccount, 'id' | 'createdAt'>): PlanlyAccount {
  try {
    const accounts = loadAccounts();
    const filePath = getAccountsFilePath();
    
    // Check if account with same name exists
    const existingIndex = accounts.findIndex(a => a.name === account.name);
    
    let savedAccount: PlanlyAccount;
    
    if (existingIndex >= 0) {
      // Update existing account
      savedAccount = {
        ...accounts[existingIndex],
        ...account,
        lastUsed: new Date().toISOString()
      };
      accounts[existingIndex] = savedAccount;
    } else {
      // Create new account
      savedAccount = {
        id: `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...account,
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      };
      accounts.push(savedAccount);
    }
    
    // Save to file
    const data: AccountsData = { accounts };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    
    console.log('[AccountStorage] Account saved:', savedAccount.name);
    return savedAccount;
  } catch (error) {
    console.error('[AccountStorage] Error saving account:', error);
    throw error;
  }
}

/**
 * Delete an account by ID
 */
export function deleteAccount(accountId: string): boolean {
  try {
    const accounts = loadAccounts();
    const filePath = getAccountsFilePath();
    
    const filteredAccounts = accounts.filter(a => a.id !== accountId);
    
    if (filteredAccounts.length === accounts.length) {
      return false; // Account not found
    }
    
    const data: AccountsData = { accounts: filteredAccounts };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    
    console.log('[AccountStorage] Account deleted:', accountId);
    return true;
  } catch (error) {
    console.error('[AccountStorage] Error deleting account:', error);
    return false;
  }
}

/**
 * Get a specific account by ID
 */
export function getAccount(accountId: string): PlanlyAccount | null {
  try {
    const accounts = loadAccounts();
    return accounts.find(a => a.id === accountId) || null;
  } catch (error) {
    console.error('[AccountStorage] Error getting account:', error);
    return null;
  }
}

/**
 * Update last used time for an account
 */
export function updateLastUsed(accountId: string): void {
  try {
    const accounts = loadAccounts();
    const account = accounts.find(a => a.id === accountId);
    
    if (account) {
      account.lastUsed = new Date().toISOString();
      const filePath = getAccountsFilePath();
      const data: AccountsData = { accounts };
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    }
  } catch (error) {
    console.error('[AccountStorage] Error updating last used:', error);
  }
}

export default {
  loadAccounts,
  saveAccount,
  deleteAccount,
  getAccount,
  updateLastUsed
};
