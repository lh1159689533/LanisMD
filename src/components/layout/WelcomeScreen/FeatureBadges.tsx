import type { ReactNode } from 'react';
import { RiNodeTree, RiPaletteLine, RiGitBranchLine, RiAttachmentLine } from 'react-icons/ri';
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
  {
    icon: <AiGradientIcon size={14} />,
    label: 'AI 编辑',
    desc: '通过自然语言生成图表、数学公式，选中文字即可续写、润色与翻译',
  },
  { icon: <RiNodeTree size={14} />, label: 'Mermaid 图表', desc: '用代码描述流程图、时序图' },
  { icon: <PiSigmaThin size={14} />, label: '数学公式', desc: '基于 KaTeX 的 LaTeX 渲染' },
  { icon: <HiMiniSlash size={14} />, label: '斜杠菜单', desc: '输入 / 快速插入各类块' },
  { icon: <RiPaletteLine size={14} />, label: '主题', desc: '多套内置主题 + 自定义主题' },
  {
    icon: <RiGitBranchLine size={14} />,
    label: '远程同步',
    desc: '实现本地和远程仓库（GitHub/Gitee）的文档同步',
  },
  {
    icon: <RiAttachmentLine size={14} />,
    label: '附件',
    desc: '在文档中嵌入本地文件，支持 PDF、Office、图片、音视频、压缩包等 100+ 文件格式的预览',
  },
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
          <span key={feature.label} className="lanismd-welcome-feature" title={feature.desc}>
            {feature.icon}
            <span>{feature.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
