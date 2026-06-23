/**
 * 同步白名单输入组件
 * 统一封装「白名单（glob，英文逗号分隔）」label + 提示 + input
 * 在 SyncPushDialog、SyncPullDialog、SyncSettings(RepoForm) 三处复用
 */

import { BUILTIN_INCLUDE_PATTERNS_STR } from '@/types/sync';

import '../../styles/sync/whitelist-input.css';
import { RiInformationLine } from 'react-icons/ri';

interface WhitelistInputProps {
  /** 当前白名单文本（英文逗号分隔的 glob） */
  value: string;
  /** 值变更回调 */
  onChange: (value: string) => void;
  /** 输入框 placeholder，不传则使用默认值 */
  placeholder?: string;
  /** 外层额外的 className（可选） */
  className?: string;
}

export function WhitelistInput({
  value,
  onChange,
  placeholder = '追加其他文件类型，如 **/*.png, **/*.jpg',
  className,
}: WhitelistInputProps) {
  return (
    <div className={`sync-whitelist-wrapper ${className ?? ''}`}>
      <label className="sync-whitelist-label">
        <span className="sync-whitelist-label-text">
          白名单
          <span className="sync-whitelist-hint">
            （glob，英文逗号分隔，默认同步文件类型：{BUILTIN_INCLUDE_PATTERNS_STR}）
          </span>
        </span>
      </label>
      <input
        type="text"
        className="sync-whitelist-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
