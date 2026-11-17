/**
 * 设置 > Git：Git 状态、默认克隆目录、自动同步、自动提交、HTTPS 访问令牌
 *
 * @changelog
 * | 版本   | 变更说明                          | 关联                         |
 * | v1.0.0 | 初始实现：替代旧「远程同步」设置页 | REQ: Git 改造 TECH: 系统 git |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useCallback, useEffect, useState } from 'react';
import {
  RiAddLine,
  RiDeleteBinLine,
  RiEditLine,
  RiFolderOpenLine,
  RiKey2Line,
  RiLoader4Line,
} from 'react-icons/ri';
import { open as tauriOpen } from '@tauri-apps/plugin-dialog';
import { GitInstallHint } from '@/components/git/GitInstallHint';
import { IDLE_OPTIONS, SYNC_INTERVAL_OPTIONS } from '@/components/git/GitStatusItems';
import { gitErrorMessage, gitService } from '@/services/tauri/git-service';
import { useGitStore } from '@/stores/git-store';
import { useSettingsStore } from '@/stores/settings-store';
import { cn } from '@/utils/cn';
import type { GitCredentialView } from '@/types/git';
import { SettingsSelect } from './SettingsControls';

import '@/styles/git/git-settings.css';

interface CredentialFormProps {
  initial: GitCredentialView | null;
  onSaved: () => void;
  onCancel: () => void;
}

function CredentialForm({ initial, onSaved, onCancel }: CredentialFormProps) {
  const [host, setHost] = useState(initial?.host ?? '');
  const [username, setUsername] = useState(initial?.username ?? '');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSave = host.trim() && (initial || token);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await gitService.saveCredential({
        id: initial?.id ?? null,
        host,
        username,
        token: token || null,
      });
      onSaved();
    } catch (e) {
      setError(gitErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="git-cred-form">
      <div className="git-form-row">
        <label className="git-form-label">域名</label>
        <input
          className="git-form-input"
          placeholder="如 github.com、git.example.com:8443"
          value={host}
          onChange={(e) => setHost(e.target.value)}
        />
      </div>
      <div className="git-form-row">
        <label className="git-form-label">用户名</label>
        <input
          className="git-form-input"
          placeholder="可选，GitLab 等平台可填 oauth2"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      <div className="git-form-row">
        <label className="git-form-label">访问令牌</label>
        <input
          type="password"
          className="git-form-input"
          placeholder={initial?.hasToken ? '已保存，留空表示不修改' : 'Personal Access Token'}
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </div>
      {error && <span className="git-form-test-error">{error}</span>}
      <div className="git-form-actions">
        <span />
        <div className="git-form-actions-right">
          <button className="git-form-btn git-form-btn-cancel" onClick={onCancel}>
            取消
          </button>
          <button
            className="git-form-btn git-form-btn-save"
            disabled={!canSave || saving}
            onClick={() => void save()}
          >
            {saving && <RiLoader4Line size={14} className="lanismd-git-spin" />}
            <span>保存</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function GitSettings() {
  const gitConfig = useSettingsStore((s) => s.config.git);
  const setNestedConfig = useSettingsStore((s) => s.setNestedConfig);
  const availability = useGitStore((s) => s.availability);
  const checkAvailability = useGitStore((s) => s.checkAvailability);
  const [credentials, setCredentials] = useState<GitCredentialView[]>([]);
  const [editing, setEditing] = useState<GitCredentialView | 'new' | null>(null);

  const loadCredentials = useCallback(async () => {
    try {
      setCredentials(await gitService.getCredentials());
    } catch (e) {
      console.error('[git] 读取凭据失败:', e);
    }
  }, []);

  useEffect(() => {
    void checkAvailability().catch(() => null);
    void loadCredentials();
  }, [checkAvailability, loadCredentials]);

  const pickCloneDir = async () => {
    const selected = await tauriOpen({
      directory: true,
      multiple: false,
      title: '选择默认克隆目录',
    });
    if (typeof selected === 'string') setNestedConfig('git.cloneDir', selected);
  };

  const remove = async (id: string) => {
    await gitService.deleteCredential(id);
    await loadCredentials();
  };

  return (
    <div className="settings-section git-settings">
      {/* Git 状态 */}
      <div className="settings-item">
        <label className="settings-item-label">Git</label>
        <span className="git-settings-status">
          {availability == null
            ? '检测中...'
            : availability.installed
              ? `${availability.version ?? '已安装'}`
              : '未安装'}
        </span>
      </div>
      {availability?.installed === false && <GitInstallHint />}
      <div className="settings-item-hint">
        <p>
          打开的文件夹位于 Git
          仓库中时，侧边栏会显示「更改」「历史」视图，底部状态栏提供分支、提交与同步操作。
        </p>
      </div>

      {/* 默认克隆目录 */}
      <div className="settings-item">
        <label className="settings-item-label">默认克隆目录</label>
        <div className="git-settings-path">
          <input
            className="git-form-input"
            placeholder="~/LanisMD"
            value={gitConfig.cloneDir}
            onChange={(e) => setNestedConfig('git.cloneDir', e.target.value)}
          />
          <button
            className="git-settings-icon-btn"
            title="选择目录"
            onClick={() => void pickCloneDir()}
          >
            <RiFolderOpenLine size={14} />
          </button>
        </div>
      </div>

      {/* 自动同步 */}
      <div className="settings-section-title">同步</div>
      <div className="settings-item">
        <label className="settings-item-label">自动同步</label>
        <button
          onClick={() => setNestedConfig('git.autoSync.enabled', !gitConfig.autoSync.enabled)}
          className={cn('settings-toggle', gitConfig.autoSync.enabled && 'checked')}
        >
          <span className="settings-toggle-thumb" />
        </button>
      </div>
      {gitConfig.autoSync.enabled && (
        <div className="settings-item">
          <label className="settings-item-label">同步间隔</label>
          <SettingsSelect
            value={String(gitConfig.autoSync.intervalMinutes)}
            options={SYNC_INTERVAL_OPTIONS.map((m) => ({ value: String(m), label: `${m} 分钟` }))}
            onChange={(v) => setNestedConfig('git.autoSync.intervalMinutes', Number(v))}
          />
        </div>
      )}
      <div className="settings-item-hint">
        <p>
          开启后，打开仓库时及之后每隔设定时间自动将远程更新拉取到本地；有冲突时会提示并切换到「更改」视图。
        </p>
      </div>

      {/* 自动提交 */}
      <div className="settings-section-title">提交</div>
      <div className="settings-item">
        <label className="settings-item-label">自动提交</label>
        <button
          onClick={() => setNestedConfig('git.autoCommit.enabled', !gitConfig.autoCommit.enabled)}
          className={cn('settings-toggle', gitConfig.autoCommit.enabled && 'checked')}
        >
          <span className="settings-toggle-thumb" />
        </button>
      </div>
      {gitConfig.autoCommit.enabled && (
        <div className="settings-item">
          <label className="settings-item-label">停止编辑后</label>
          <SettingsSelect
            value={String(gitConfig.autoCommit.idleMinutes)}
            options={IDLE_OPTIONS.map((m) => ({ value: String(m), label: `${m} 分钟` }))}
            onChange={(v) => setNestedConfig('git.autoCommit.idleMinutes', Number(v))}
          />
        </div>
      )}
      <div className="settings-item-hint">
        <p>
          开启后，停止编辑达到设定时长时自动 Commit &amp; Push 全部更改；存在冲突时不会自动提交。
          已开启 AI 助手时由 AI 生成提交说明（会将变更内容最多 8KB 发送给当前 AI
          服务商），否则使用模板说明。
        </p>
      </div>

      {/* HTTPS 访问令牌 */}
      <div className="git-settings-header">
        <div className="settings-section-title">HTTPS 访问令牌</div>
        {!editing && (
          <button className="git-settings-add-btn" onClick={() => setEditing('new')}>
            <RiAddLine size={14} />
            <span>添加令牌</span>
          </button>
        )}
      </div>
      <div className="settings-item-hint">
        <p>
          SSH 地址使用本机 SSH 密钥；HTTPS
          地址优先使用这里为对应域名配置的令牌，未配置时使用系统凭据管理器。旧版「远程同步」中配置的
          Token 已自动迁移到这里。
        </p>
      </div>

      {editing && (
        <CredentialForm
          initial={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void loadCredentials();
          }}
        />
      )}

      {!editing && (
        <div className="git-cred-list">
          {credentials.length === 0 ? (
            <div className="git-cred-empty">
              <p>尚未配置访问令牌</p>
              <p className="git-cred-empty-hint">使用 SSH 地址或系统凭据时无需配置</p>
            </div>
          ) : (
            credentials.map((cred) => (
              <div key={cred.id} className="git-cred-item">
                <div className="git-cred-item-icon">
                  <RiKey2Line size={16} />
                </div>
                <div className="git-cred-item-info">
                  <div className="git-cred-item-name">{cred.host}</div>
                  <div className="git-cred-item-detail">
                    {cred.username || '未设置用户名'} · {cred.hasToken ? '令牌已保存' : '无令牌'}
                  </div>
                </div>
                <div className="git-cred-item-actions">
                  <button
                    className="git-cred-item-btn"
                    title="编辑"
                    onClick={() => setEditing(cred)}
                  >
                    <RiEditLine size={14} />
                  </button>
                  <button
                    className="git-cred-item-btn git-cred-item-btn-danger"
                    title="删除"
                    onClick={() => void remove(cred.id)}
                  >
                    <RiDeleteBinLine size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
