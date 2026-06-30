/**
 * 远程仓库配置面板
 */

import { useState, useCallback, useEffect } from 'react';
import {
  RiAddLine,
  RiDeleteBinLine,
  RiEditLine,
  RiCheckLine,
  RiCloseLine,
  RiLoader4Line,
  RiGithubFill,
} from 'react-icons/ri';
import { SiGitee } from 'react-icons/si';
import { useSyncStore } from '@/stores/sync-store';
import { useSettingsStore } from '@/stores/settings-store';
import { syncService } from '@/services/tauri/sync-service';
import { cn } from '@/utils/cn';
import type { SyncRepoConfig, Platform } from '@/types/sync';
import { WhitelistInput } from '@/components/sync/WhitelistInput';

// ---------------------------------------------------------------------------
// 空配置模板
// ---------------------------------------------------------------------------

function createEmptyConfig(): Omit<SyncRepoConfig, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: '',
    platform: 'github',
    token: '',
    owner: '',
    repo: '',
    branch: 'main',
    localPath: null,
    includePatterns: [],
  };
}

// ---------------------------------------------------------------------------
// 仓库编辑表单
// ---------------------------------------------------------------------------

interface RepoFormProps {
  /** 编辑模式（含 id）或新建模式（无 id） */
  initialData: Partial<SyncRepoConfig>;
  onSave: (config: SyncRepoConfig) => Promise<void>;
  onCancel: () => void;
}

function RepoForm({ initialData, onSave, onCancel }: RepoFormProps) {
  const [form, setForm] = useState(() => ({
    ...createEmptyConfig(),
    ...initialData,
  }));
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // 用户额外追加的白名单（不含硬编码默认值）
  const [extraIncludeText, setExtraIncludeText] = useState(() => form.includePatterns.join(', '));

  // 当字符串变化时，同步解析到 form 的数组字段
  useEffect(() => {
    const parsed = extraIncludeText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    setForm((prev) => {
      if (JSON.stringify(prev.includePatterns) === JSON.stringify(parsed)) return prev;
      return { ...prev, includePatterns: parsed };
    });
  }, [extraIncludeText]);

  const updateField = useCallback(
    <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setTestResult(null);
    },
    [],
  );

  /** 测试连接 */
  const handleTestConnection = useCallback(async () => {
    if (!form.token || !form.owner || !form.repo) return;
    setTesting(true);
    setTestResult(null);
    try {
      const config: SyncRepoConfig = {
        id: initialData.id || crypto.randomUUID(),
        createdAt: initialData.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...form,
      } as SyncRepoConfig;
      const result = await syncService.testConnection(config);
      setTestResult({ success: result.success, error: result.error ?? undefined });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestResult({ success: false, error: msg });
    } finally {
      setTesting(false);
    }
  }, [form, initialData]);

  /** 保存 */
  const handleSave = useCallback(async () => {
    if (!form.name || !form.token || !form.owner || !form.repo) return;
    setSaving(true);
    try {
      const config: SyncRepoConfig = {
        id: initialData.id || crypto.randomUUID(),
        createdAt: initialData.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...form,
      } as SyncRepoConfig;
      await onSave(config);
    } finally {
      setSaving(false);
    }
  }, [form, initialData, onSave]);

  return (
    <div className="sync-repo-form">
      {/* 名称 */}
      <div className="sync-form-row">
        <label className="sync-form-label">名称</label>
        <input
          type="text"
          className="sync-form-input"
          placeholder="如: 我的文档仓库"
          value={form.name}
          onChange={(e) => updateField('name', e.target.value)}
        />
      </div>

      {/* 平台 */}
      <div className="sync-form-row">
        <label className="sync-form-label">平台</label>
        <div className="sync-form-segmented">
          <button
            className={cn('sync-form-seg-item', form.platform === 'github' && 'active')}
            onClick={() => updateField('platform', 'github' as Platform)}
          >
            GitHub
          </button>
          <button
            className={cn('sync-form-seg-item', form.platform === 'gitee' && 'active')}
            onClick={() => updateField('platform', 'gitee' as Platform)}
          >
            Gitee
          </button>
        </div>
      </div>

      {/* Token */}
      <div className="sync-form-row">
        <label className="sync-form-label">用户授权码</label>
        <input
          type="password"
          className="sync-form-input"
          placeholder="Personal Access Token"
          value={form.token}
          onChange={(e) => updateField('token', e.target.value)}
        />
      </div>

      {/* Owner / Repo */}
      <div className="sync-form-row sync-form-row-double">
        <div className="sync-form-field">
          <label className="sync-form-label">拥有者</label>
          <input
            type="text"
            className="sync-form-input"
            placeholder="owner"
            value={form.owner}
            onChange={(e) => updateField('owner', e.target.value)}
          />
        </div>
        <span className="sync-form-separator">/</span>
        <div className="sync-form-field">
          <label className="sync-form-label">仓库名</label>
          <input
            type="text"
            className="sync-form-input"
            placeholder="repo"
            value={form.repo}
            onChange={(e) => updateField('repo', e.target.value)}
          />
        </div>
      </div>

      {/* 分支 */}
      <div className="sync-form-row">
        <label className="sync-form-label">默认分支</label>
        <input
          type="text"
          className="sync-form-input"
          placeholder="main"
          value={form.branch}
          onChange={(e) => updateField('branch', e.target.value)}
        />
      </div>

      {/* 白名单 */}
      <WhitelistInput
        className="sync-form-row"
        value={extraIncludeText}
        onChange={setExtraIncludeText}
      />

      {/* 操作按钮 */}
      <div className="sync-form-actions">
        <div className="sync-form-test-wrap">
          <button
            className={cn(
              'sync-form-btn sync-form-btn-test',
              testResult?.success === true && 'sync-form-btn-test--success',
              testResult?.success === false && 'sync-form-btn-test--fail',
            )}
            onClick={handleTestConnection}
            disabled={testing || !form.token || !form.owner || !form.repo}
          >
            {testing ? (
              <RiLoader4Line size={14} className="sync-spin" />
            ) : testResult?.success === true ? (
              <RiCheckLine size={14} />
            ) : testResult?.success === false ? (
              <RiCloseLine size={14} />
            ) : null}
            <span>
              {testing ? '测试中...' : testResult?.success === true ? '连接成功' : '测试连接'}
            </span>
          </button>
          {testResult?.success === false && testResult.error && (
            <span className="sync-form-test-error">{testResult.error}</span>
          )}
        </div>
        <div className="sync-form-actions-right">
          <button className="sync-form-btn sync-form-btn-cancel" onClick={onCancel}>
            取消
          </button>
          <button
            className="sync-form-btn sync-form-btn-save"
            onClick={handleSave}
            disabled={saving || !form.name || !form.token || !form.owner || !form.repo}
          >
            {saving && <RiLoader4Line size={14} className="sync-spin" />}
            <span>保存</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 仓库列表项
// ---------------------------------------------------------------------------

function RepoListItem({
  repo,
  onEdit,
  onDelete,
}: {
  repo: SyncRepoConfig;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="sync-repo-item">
      <div className="sync-repo-item-icon">
        {repo.platform === 'github' ? <RiGithubFill size={18} /> : <SiGitee size={18} />}
      </div>
      <div className="sync-repo-item-info">
        <div className="sync-repo-item-name">{repo.name}</div>
        <div className="sync-repo-item-detail">
          {repo.platform === 'github' ? 'GitHub' : 'Gitee'}: {repo.owner}/{repo.repo} ({repo.branch}
          )
        </div>
      </div>
      <div className="sync-repo-item-actions">
        <button className="sync-repo-item-btn" onClick={onEdit} title="编辑">
          <RiEditLine size={14} />
        </button>
        <button
          className="sync-repo-item-btn sync-repo-item-btn-danger"
          onClick={onDelete}
          title="删除"
        >
          <RiDeleteBinLine size={14} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 主组件: SyncSettings
// ---------------------------------------------------------------------------

export function SyncSettings() {
  const { repos, reposLoaded, loadRepos, saveRepo, deleteRepo } = useSyncStore();
  const syncEnabled = useSettingsStore((s) => s.config.sync.enabled);
  const setNestedConfig = useSettingsStore((s) => s.setNestedConfig);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // 首次进入时加载仓库列表
  useEffect(() => {
    if (!reposLoaded) {
      loadRepos();
    }
  }, [reposLoaded, loadRepos]);

  /** 保存（新增或编辑） */
  const handleSave = useCallback(
    async (config: SyncRepoConfig) => {
      await saveRepo(config);
      setEditingId(null);
      setIsAdding(false);
    },
    [saveRepo],
  );

  /** 删除仓库 */
  const handleDelete = useCallback(
    async (id: string) => {
      await deleteRepo(id);
    },
    [deleteRepo],
  );

  /** 取消编辑 */
  const handleCancel = useCallback(() => {
    setEditingId(null);
    setIsAdding(false);
  }, []);

  // 当前正在编辑的仓库数据
  const editingRepo = editingId ? repos.find((r) => r.id === editingId) : null;

  return (
    <div className="settings-section sync-settings">
      {/* 启用远程同步开关 */}
      <div className="settings-item">
        <label className="settings-item-label">启用远程同步</label>
        <button
          onClick={() => setNestedConfig('sync.enabled', !syncEnabled)}
          className={cn('settings-toggle', syncEnabled && 'checked')}
        >
          <span className="settings-toggle-thumb" />
        </button>
      </div>
      <div className="settings-item-hint">
        <p>
          开启后，可通过左侧文件树操作栏的拉取和推送，实现本地和远程仓库的文档同步。目前支持 GitHub
          和 Gitee 仓库。
        </p>
      </div>

      {/* 开关开启时才显示仓库配置区域 */}
      {syncEnabled && (
        <>
          {/* 标题区域 */}
          <div className="sync-settings-header">
            <div className="settings-section-title">远程仓库</div>
            {syncEnabled && !isAdding && !editingId && (
              <button className="sync-settings-add-btn" onClick={() => setIsAdding(true)}>
                <RiAddLine size={14} />
                <span>添加仓库</span>
              </button>
            )}
          </div>
          {/* 新建表单 */}
          {isAdding && <RepoForm initialData={{}} onSave={handleSave} onCancel={handleCancel} />}

          {/* 编辑表单 */}
          {editingRepo && (
            <RepoForm initialData={editingRepo} onSave={handleSave} onCancel={handleCancel} />
          )}

          {/* 仓库列表 */}
          {!isAdding && !editingId && (
            <div className="sync-repo-list">
              {repos.length === 0 ? (
                <div className="sync-repo-empty">
                  <p>尚未配置远程仓库</p>
                  <p className="sync-repo-empty-hint">点击"添加仓库"配置 GitHub 或 Gitee 仓库</p>
                </div>
              ) : (
                repos.map((repo) => (
                  <RepoListItem
                    key={repo.id}
                    repo={repo}
                    onEdit={() => setEditingId(repo.id)}
                    onDelete={() => handleDelete(repo.id)}
                  />
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
