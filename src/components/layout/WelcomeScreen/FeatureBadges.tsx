import type { ReactNode } from 'react';
import { RiNodeTree, RiPaletteLine } from 'react-icons/ri';
import { HiMiniSlash } from 'react-icons/hi2';
import { PiSigmaThin } from 'react-icons/pi';
import { AiGradientIcon } from '@/components/common/AiGradientIcon';

interface FeatureItem {
  icon: ReactNode;
  label: string;
  /** hover tooltip 描述 */
  desc: string;
}

const FEATURES: FeatureItem[] = [
  { icon: <AiGradientIcon size={14} />, label: 'AI 编辑', desc: '选中文字即可续写、润色、翻译' },
  { icon: <RiNodeTree size={14} />, label: 'Mermaid 图表', desc: '用代码描述流程图、时序图' },
  { icon: <PiSigmaThin size={14} />, label: '数学公式', desc: '基于 KaTeX 的 LaTeX 渲染' },
  { icon: <HiMiniSlash size={14} />, label: '斜杠菜单', desc: '输入 / 快速插入各类块' },
  { icon: <RiPaletteLine size={14} />, label: '主题', desc: '多套内置主题 + 自定义主题' },
];

/**
 * Dashboard 核心功能徽章展示（无点击行为，仅信息展示 + hover tooltip）
 */
export function FeatureBadges() {
  return (
    <div className="lanismd-welcome-features">
      <h3 className="lanismd-welcome-section-title">核心功能</h3>
      <div className="lanismd-welcome-features-list">
        {FEATURES.map((feature) => (
          <span
            key={feature.label}
            className="lanismd-welcome-feature"
            title={feature.desc}
          >
            {feature.icon}
            <span>{feature.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
