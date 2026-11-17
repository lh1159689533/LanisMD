/**
 * 多轮追问的快捷指令
 *
 * 点击后作为新一轮 user 消息发送，模型会基于上一轮结果继续调整。
 *
 * @changelog
 * | 版本   | 变更说明                  | 关联                  |
 * | v1.0.0 | 初始实现：快捷追问指令集 | REQ: AI 体验短板-追问 |
 * /@changelog
 *
 * @author hhhuilli
 */

export interface QuickFollowUp {
  label: string;
  instruction: string;
}

/** 改写类结果（自定义指令、翻译等）通用 */
export const REWRITE_FOLLOW_UPS: QuickFollowUp[] = [
  {
    label: '更短',
    instruction: '在保持原意的前提下，把上面的结果改得更简短。只输出修改后的结果。',
  },
  { label: '更正式', instruction: '把上面的结果改得更正式、书面一些。只输出修改后的结果。' },
  {
    label: '换种说法',
    instruction: '换一种说法重写上面的结果，保持原意不变。只输出修改后的结果。',
  },
];

/** 解释类结果 */
export const EXPLAIN_FOLLOW_UPS: QuickFollowUp[] = [
  { label: '更简短', instruction: '请用更简短的话重新解释，控制在三句话以内。' },
  { label: '更通俗', instruction: '请用更通俗的说法重新解释，假设读者没有相关背景。' },
  { label: '举个例子', instruction: '请结合一个具体的例子再解释一遍。' },
];
