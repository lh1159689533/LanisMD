/**
 * GFM Alert Types
 */

/** 支持的 Alert 类型 */
export type GfmAlertType = 'note' | 'tip' | 'important' | 'warning' | 'caution';

/** Alert 类型配置 */
export interface AlertTypeConfig {
  /** 类型标识（小写） */
  type: GfmAlertType;
  /** 显示标签 */
  label: string;
  /** Markdown 语法中的类型标识（大写） */
  syntax: string;
}

/** 所有支持的 Alert 类型配置 */
export const ALERT_TYPES: Record<GfmAlertType, AlertTypeConfig> = {
  note: { type: 'note', label: 'Note', syntax: 'NOTE' },
  tip: { type: 'tip', label: 'Tip', syntax: 'TIP' },
  important: { type: 'important', label: 'Important', syntax: 'IMPORTANT' },
  warning: { type: 'warning', label: 'Warning', syntax: 'WARNING' },
  caution: { type: 'caution', label: 'Caution', syntax: 'CAUTION' },
};

/** 从语法标识获取 Alert 类型 */
export function getAlertTypeFromSyntax(syntax: string): GfmAlertType | null {
  const upperSyntax = syntax.toUpperCase();
  for (const config of Object.values(ALERT_TYPES)) {
    if (config.syntax === upperSyntax) {
      return config.type;
    }
  }
  return null;
}

/** 从 Alert 类型获取配置 */
export function getAlertConfig(type: GfmAlertType): AlertTypeConfig {
  return ALERT_TYPES[type];
}
