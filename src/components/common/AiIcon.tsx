/**
 * AI 图标组件
 *
 * 渲染全局统一的 AI 品牌图标（与 AI 助手指令弹窗一致，见 constants/ai-icon.ts），
 * 用于状态栏、AI 对话面板、欢迎页、提交说明生成等 React 场景。
 *
 * @changelog
 * | 版本   | 变更说明                                         | 关联             |
 * | v1.0.0 | 替代渐变文字 AiGradientIcon，统一为指令弹窗图标 | REQ: AI 图标统一 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { AI_ICON_SVG } from '@/constants/ai-icon';
import { cn } from '@/utils/cn';

interface AiIconProps {
  /** 图标尺寸（宽高一致，px），默认 14 */
  size?: number;
  /** 额外 className */
  className?: string;
}

export function AiIcon({ size = 14, className }: AiIconProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size, fontSize: size, lineHeight: 0 }}
      // 静态内置 SVG，无外部输入
      dangerouslySetInnerHTML={{ __html: AI_ICON_SVG }}
    />
  );
}
