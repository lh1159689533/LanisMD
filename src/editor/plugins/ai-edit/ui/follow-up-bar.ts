/**
 * 追问输入条：输入框 + 快捷追问按钮（纯 DOM，翻译 / 解释弹窗共用）
 *
 * @changelog
 * | 版本   | 变更说明                | 关联                  |
 * | v1.0.0 | 初始实现：追问输入组件 | REQ: AI 体验短板-追问 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { QuickFollowUp } from '@/services/ai/follow-ups';

/** 创建一组快捷追问按钮；点击时回调对应指令 */
export function createQuickChips(
  items: QuickFollowUp[],
  onPick: (instruction: string, label: string) => void,
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'lanismd-ai-chips';
  for (const item of items) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'lanismd-ai-chip';
    chip.textContent = item.label;
    chip.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (chip.disabled) return;
      onPick(item.instruction, item.label);
    });
    row.appendChild(chip);
  }
  return row;
}

export interface FollowUpBar {
  el: HTMLDivElement;
  /** 生成中禁用，完成后启用 */
  setEnabled: (enabled: boolean) => void;
  focus: () => void;
}

/**
 * 创建追问输入条。
 *
 * @param onSubmit - 提交追问；`display` 为展示在对话记录中的文字（快捷按钮显示按钮名）
 */
export function createFollowUpBar(options: {
  placeholder: string;
  quickFollowUps?: QuickFollowUp[];
  onSubmit: (instruction: string, display: string) => void;
}): FollowUpBar {
  const el = document.createElement('div');
  el.className = 'lanismd-ai-followup';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'lanismd-ai-followup-input';
  input.placeholder = options.placeholder;

  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'lanismd-ai-followup-send';
  sendBtn.textContent = '发送';

  const inputRow = document.createElement('div');
  inputRow.className = 'lanismd-ai-followup-row';
  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);

  let enabled = false;
  const chips = options.quickFollowUps?.length
    ? createQuickChips(options.quickFollowUps, (instruction, label) => {
        if (enabled) options.onSubmit(instruction, label);
      })
    : null;

  if (chips) el.appendChild(chips);
  el.appendChild(inputRow);

  const submit = () => {
    const value = input.value.trim();
    if (!enabled || !value) return;
    input.value = '';
    options.onSubmit(value, value);
  };

  // 输入框内的按键不应冒泡到编辑器或弹窗的全局快捷键（Esc 除外，交给弹窗关闭）
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return;
    e.stopPropagation();
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });
  sendBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    submit();
  });

  const setEnabled = (value: boolean) => {
    enabled = value;
    input.disabled = !value;
    sendBtn.disabled = !value;
    chips?.querySelectorAll('button').forEach((b) => (b.disabled = !value));
  };
  setEnabled(false);

  return { el, setEnabled, focus: () => input.focus() };
}
