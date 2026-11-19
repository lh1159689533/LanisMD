/**
 * 关于对话框：展示应用版本并提供手动检查更新入口
 *
 * @changelog
 * | 版本   | 变更说明                     | 关联                                |
 * | v1.0.0 | 初始实现：版本信息与更新入口 | REQ: 系统集成-原生菜单 TECH: 对话框 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useEffect, useState } from 'react';
import { getAppVersion } from '@/services/tauri/system-service';
import { useSystemStore } from '@/stores/system-store';
import { Dialog } from './Dialog';
import '@/styles/common/system-dialog.css';

export function AboutDialog() {
  const open = useSystemStore((s) => s.aboutDialogOpen);
  const closeAbout = useSystemStore((s) => s.closeAbout);
  const checkForUpdate = useSystemStore((s) => s.checkForUpdate);
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (!open) return;
    void getAppVersion()
      .then(setVersion)
      .catch((err) => {
        console.error('[AboutDialog] 读取版本号失败:', err);
        setVersion('');
      });
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={closeAbout}
      title="关于 LanisMD"
      size="sm"
      footer={
        <div className="lanismd-system-actions">
          <button type="button" className="lanismd-system-btn" onClick={closeAbout}>
            关闭
          </button>
          <button
            type="button"
            className="lanismd-system-btn lanismd-system-btn-primary"
            onClick={() => {
              closeAbout();
              void checkForUpdate(false);
            }}
          >
            检查更新
          </button>
        </div>
      }
    >
      <div className="lanismd-system-body">
        <div className="lanismd-system-about-name">LanisMD</div>
        <div className="lanismd-system-version">
          版本 <strong>{version || '未知'}</strong>
        </div>
        <p className="lanismd-system-description">
          一款本地优先的 Markdown 编辑器，支持所见即所得编辑、Git 版本管理与 AI 辅助写作。
        </p>
      </div>
    </Dialog>
  );
}
