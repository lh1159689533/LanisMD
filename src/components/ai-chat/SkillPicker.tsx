/**
 * 对话技能选择
 *
 * - SkillButton：输入区底栏的「技能」按钮，下拉多选启用 / 停用技能
 * - SkillSlashMenu：在输入框键入「/」时弹出的技能快速选择列表（键盘上下选择、Enter 启用）
 * - SkillChip：输入框上方显示已启用的技能，可直接移除
 *
 * @changelog
 * | 版本   | 变更说明                        | 关联         |
 * | v1.0.0 | 初始实现：技能下拉、斜杠选择与标签 | REQ: AI 技能 |
 * | v1.0.1 | 修复技能下拉在窄面板中溢出窗口   | REQ: AI 技能 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RiAddLine, RiCheckLine, RiCloseLine, RiFlashlightLine } from 'react-icons/ri';

import { useSettingsStore } from '@/stores/settings-store';
import { useUIStore } from '@/stores/ui-store';
import type { AiSkill } from '@/types/ai';
import { cn } from '@/utils/cn';

const NO_SKILLS: AiSkill[] = [];

/** 订阅设置中的技能列表 */
export function useSkills(): AiSkill[] {
  return useSettingsStore((s) => s.config.ai?.skills ?? NO_SKILLS);
}

/** 打开设置并定位到技能管理区域 */
export function openSkillSettings(): void {
  useUIStore.getState().openSettings('ai');
  // 设置弹窗挂载后再滚动到技能分区
  setTimeout(() => {
    document.getElementById('lanismd-settings-ai-skills')?.scrollIntoView({ block: 'start' });
  }, 80);
}

/** 按名称与说明过滤技能（大小写不敏感） */
export function filterSkills(skills: AiSkill[], query: string): AiSkill[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter(
    (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
  );
}

/** 弹出菜单与面板边缘保留的最小间距 */
const MENU_EDGE_GAP = 8;

/**
 * 将绝对定位的下拉菜单水平收回到对话面板（无面板时为窗口）可视范围内。
 * 先复位再测量，保证面板宽度变化后重新打开时位置正确。
 */
function clampMenuIntoPanel(menu: HTMLElement): void {
  menu.style.left = '';
  menu.style.maxWidth = '';
  const panel = menu.closest('.lanismd-ai-chat-inner');
  const bound = panel
    ? panel.getBoundingClientRect()
    : { left: 0, right: window.innerWidth, width: window.innerWidth };
  const minLeft = bound.left + MENU_EDGE_GAP;
  const maxRight = bound.right - MENU_EDGE_GAP;
  menu.style.maxWidth = `${Math.max(0, maxRight - minLeft)}px`;

  const rect = menu.getBoundingClientRect();
  let shift = 0;
  if (rect.right > maxRight) shift = maxRight - rect.right;
  if (rect.left + shift < minLeft) shift = minLeft - rect.left;
  if (shift !== 0) menu.style.left = `${shift}px`;
}

function SkillOption({
  skill,
  selected,
  highlighted,
  onPick,
}: {
  skill: AiSkill;
  selected: boolean;
  highlighted?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        'lanismd-ai-chat-skill-option',
        selected && 'is-selected',
        highlighted && 'is-highlighted',
      )}
      // mousedown 时阻止失焦，保证斜杠菜单中点击后输入框仍保持焦点
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPick}
      title={skill.description || skill.name}
    >
      <span className="lanismd-ai-chat-skill-option-main">
        <span className="lanismd-ai-chat-skill-option-name">{skill.name}</span>
        {skill.description && (
          <span className="lanismd-ai-chat-skill-option-desc">{skill.description}</span>
        )}
      </span>
      {selected && <RiCheckLine size={14} />}
    </button>
  );
}

function ManageSkillsButton({ empty }: { empty: boolean }) {
  return (
    <button
      type="button"
      className="lanismd-ai-chat-skill-option is-manage"
      onMouseDown={(e) => e.preventDefault()}
      onClick={openSkillSettings}
    >
      <span className="lanismd-ai-chat-skill-option-name">
        <RiAddLine size={13} />
        {empty ? '新建技能' : '管理技能'}
      </span>
    </button>
  );
}

/** 输入区底栏的技能按钮（多选） */
export function SkillButton({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const skills = useSkills();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const count = selectedIds.filter((id) => skills.some((s) => s.id === id)).length;

  // 菜单默认左对齐按钮，面板较窄时会溢出到窗口外，打开后按面板边界水平收回
  useLayoutEffect(() => {
    if (open && menuRef.current) clampMenuIntoPanel(menuRef.current);
  }, [open, skills.length]);

  useEffect(() => {
    if (!open) return;
    const handleDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id]);
  };

  return (
    <div ref={rootRef} className="lanismd-ai-chat-skill">
      <button
        type="button"
        className={cn('lanismd-ai-chat-skill-trigger', count > 0 && 'is-active')}
        onClick={() => setOpen((v) => !v)}
        title="选择技能（也可在输入框键入 / 快速选择）"
      >
        <RiFlashlightLine size={13} />
        <span>{count > 0 ? `技能 ${count}` : '技能'}</span>
      </button>

      {open && (
        <div ref={menuRef} className="lanismd-ai-chat-skill-menu">
          {skills.length === 0 ? (
            <div className="lanismd-ai-chat-skill-empty">
              还没有技能。技能可以为对话注入专业指令，例如审稿规范、写作风格、输出格式等。
            </div>
          ) : (
            skills.map((skill) => (
              <SkillOption
                key={skill.id}
                skill={skill}
                selected={selectedIds.includes(skill.id)}
                onPick={() => toggle(skill.id)}
              />
            ))
          )}
          <div className="lanismd-ai-chat-model-divider" />
          <ManageSkillsButton empty={skills.length === 0} />
        </div>
      )}
    </div>
  );
}

/** 键入「/」时的技能快速选择列表 */
export function SkillSlashMenu({
  items,
  selectedIds,
  activeIndex,
  onPick,
}: {
  items: AiSkill[];
  selectedIds: string[];
  activeIndex: number;
  onPick: (skill: AiSkill) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('.is-highlighted')
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <div ref={listRef} className="lanismd-ai-chat-skill-menu is-slash">
      <div className="lanismd-ai-chat-skill-menu-title">选择技能 · ↑↓ 切换，Enter 启用</div>
      {items.length === 0 ? (
        <div className="lanismd-ai-chat-skill-empty">没有匹配的技能</div>
      ) : (
        items.map((skill, i) => (
          <SkillOption
            key={skill.id}
            skill={skill}
            selected={selectedIds.includes(skill.id)}
            highlighted={i === activeIndex}
            onPick={() => onPick(skill)}
          />
        ))
      )}
      <div className="lanismd-ai-chat-model-divider" />
      <ManageSkillsButton empty={false} />
    </div>
  );
}

/** 已启用技能标签 */
export function SkillChip({
  name,
  description,
  onRemove,
}: {
  name: string;
  description?: string;
  /** 不传时不显示移除按钮（已发送的消息中使用） */
  onRemove?: () => void;
}) {
  return (
    <span className="lanismd-ai-chat-chip is-skill" title={description || name}>
      <RiFlashlightLine size={12} />
      <span className="lanismd-ai-chat-chip-label">{name}</span>
      {onRemove && (
        <button
          type="button"
          className="lanismd-ai-chat-chip-remove"
          onClick={onRemove}
          title="停用"
        >
          <RiCloseLine size={12} />
        </button>
      )}
    </span>
  );
}
