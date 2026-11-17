/**
 * 未检测到 Git 时的安装引导
 *
 * @author hhhuilli
 */

import { useState } from 'react';
import { RiAlertLine } from 'react-icons/ri';
import { openUrl } from '@tauri-apps/plugin-opener';
import { gitService } from '@/services/tauri/git-service';
import { useGitStore } from '@/stores/git-store';

import '@/styles/git/git-dialog.css';

const GIT_DOWNLOAD_URL = 'https://git-scm.com/downloads';

export function GitInstallHint() {
  const checkAvailability = useGitStore((s) => s.checkAvailability);
  const [checking, setChecking] = useState(false);

  const install = async () => {
    const started = await gitService.installTools().catch(() => false);
    if (!started) await openUrl(GIT_DOWNLOAD_URL);
  };

  const recheck = async () => {
    setChecking(true);
    const result = await checkAvailability().catch(() => null);
    // 安装完成后重新识别当前文件夹是否为仓库
    if (result?.installed) await useGitStore.getState().refresh();
    setChecking(false);
  };

  return (
    <div className="git-dialog-warning">
      <RiAlertLine size={14} />
      <span>未检测到 Git。Git 相关功能依赖系统安装的 Git，请安装后点击「重新检测」。</span>
      <span className="git-dialog-warning-actions">
        <button type="button" onClick={() => void install()}>
          安装 Git
        </button>
        <button type="button" disabled={checking} onClick={() => void recheck()}>
          {checking ? '检测中...' : '重新检测'}
        </button>
      </span>
    </div>
  );
}
