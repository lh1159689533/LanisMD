/**
 * AI 对话技能：读取、解析 SKILL.md、渲染为 system prompt
 *
 * 技能保存在设置（config.ai.skills）中，对话只记录启用的技能 id，
 * 发送时按 id 解析当前定义——编辑技能后对已有对话立即生效，删除后自动忽略。
 *
 * SKILL.md 兼容常见格式：
 * ```
 * ---
 * name: 技术文档审阅
 * description: 按团队规范审阅技术文档
 * ---
 * 正文为技能指令……
 * ```
 * 无 front-matter 时取首个一级标题作为名称，其余内容作为指令。
 *
 * @changelog
 * | 版本   | 变更说明                                | 关联           |
 * | v1.0.0 | 初始实现：技能解析、SKILL.md 导入与渲染 | REQ: AI 技能   |
 * | v1.1.0 | 强化技能约束措辞；新增末条消息技能提醒  | REQ: AI 技能   |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useSettingsStore } from '@/stores/settings-store';
import type { AiSkill } from '@/types/ai';

/** 单个技能指令的最大长度（字符），防止误导入超大文件撑爆上下文 */
export const MAX_SKILL_INSTRUCTIONS = 20_000;

const NO_SKILLS: AiSkill[] = [];

/** 读取设置中的全部技能 */
export function getSkills(): AiSkill[] {
  return useSettingsStore.getState().config.ai?.skills ?? NO_SKILLS;
}

/** 按 id 解析技能（保持 ids 的顺序，忽略已删除的） */
export function resolveSkills(
  ids: string[] | undefined,
  skills: AiSkill[] = getSkills(),
): AiSkill[] {
  if (!ids || ids.length === 0) return [];
  return ids.map((id) => skills.find((s) => s.id === id)).filter((s): s is AiSkill => Boolean(s));
}

/** 默认启用的技能 id：输入区未手动调整技能时，每条消息自动带上 */
export function defaultSkillIds(): string[] {
  return getSkills()
    .filter((s) => s.defaultEnabled)
    .map((s) => s.id);
}

/** 生成技能 id */
export function createSkillId(): string {
  return `skill-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * 把启用的技能渲染为 system prompt 片段；无技能时返回空串。
 *
 * 措辞刻意强调「必须执行、优先级最高、输出格式以技能为准」：
 * 仅写「请遵循」时，部分模型（如 DeepSeek）会把技能当作参考资料，仍按通用助手的习惯作答。
 */
export function renderSkillsPrompt(skills: AiSkill[]): string {
  if (skills.length === 0) return '';
  const blocks = skills.map((s) => {
    const head = s.description.trim() ? `用途：${s.description.trim()}\n\n` : '';
    return `<skill name="${s.name}">\n${head}${s.instructions.trim()}\n</skill>`;
  });
  const names = skills.map((s) => `「${s.name}」`).join('、');
  return [
    `# 已启用技能：${names}`,
    '用户为本次对话启用了以下技能。技能是你必须执行的工作规范，而不是参考资料：',
    '- 每次回答都必须按技能规定的流程、规则与输出格式完成；',
    '- 技能与上文的通用说明（包括快捷操作的输出要求）冲突时，以技能为准；',
    '- 不要在回答中复述技能内容。',
    '',
    blocks.join('\n\n'),
  ].join('\n');
}

/** 附加在最新一条用户消息末尾的技能提醒（长对话中模型容易遗忘 system 中的技能） */
export function renderSkillsReminder(skills: AiSkill[]): string {
  if (skills.length === 0) return '';
  const names = skills.map((s) => `「${s.name}」`).join('、');
  return `（请严格按已启用的技能${names}处理本条请求。）`;
}

// ---------------------------------------------------------------------------
// SKILL.md 解析
// ---------------------------------------------------------------------------

const FRONT_MATTER_RE = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[^\S\n]*(?:\r?\n|$)/;

/** 去掉 YAML 标量两侧的引号 */
function unquote(value: string): string {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

/**
 * 极简 front-matter 解析：只取顶层 `key: value`，支持 `|` / `>` 多行块。
 * 不引入 YAML 库——技能只需要 name / description 两个字段。
 */
function parseFrontMatter(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const match = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(lines[i]);
    if (!match) continue;
    const [, key, rest] = match;
    if (/^[|>][+-]?$/.test(rest.trim())) {
      const folded = rest.trim().startsWith('>');
      const block: string[] = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === '')) {
        block.push(lines[++i].trim());
      }
      // 折叠块按 YAML 规则以空格连接；中文之间不应出现空格，单独去掉
      const joined = folded
        ? block.join(' ').replace(/([\u4e00-\u9fff，。；：！？]) (?=[\u4e00-\u9fff])/g, '$1')
        : block.join('\n');
      result[key.toLowerCase()] = joined.trim();
    } else {
      result[key.toLowerCase()] = unquote(rest);
    }
  }
  return result;
}

/** 解析结果 */
export type ParsedSkill = Omit<AiSkill, 'id'>;

/**
 * 解析 SKILL.md 文本。
 *
 * @param fileName - 用于兜底名称：`xxx/SKILL.md` 取目录名不可得时用去掉扩展名的文件名
 * @returns 指令为空时返回 null
 */
export function parseSkillMarkdown(text: string, fileName: string): ParsedSkill | null {
  let body = text;
  let meta: Record<string, string> = {};
  const fm = FRONT_MATTER_RE.exec(text);
  if (fm) {
    meta = parseFrontMatter(fm[1]);
    body = text.slice(fm[0].length);
  }

  let name = meta.name?.trim() ?? '';
  if (!name) {
    const heading = /^#\s+(.+)$/m.exec(body);
    if (heading) {
      name = heading[1].trim();
      body = body.replace(heading[0], '');
    }
  }
  if (!name) name = fileName.replace(/\.(md|markdown)$/i, '') || '未命名技能';

  const instructions = body.trim();
  if (!instructions) return null;
  return {
    name,
    description: meta.description?.trim() ?? '',
    instructions: instructions.slice(0, MAX_SKILL_INSTRUCTIONS),
  };
}
