/**
 * 自定义指令的模板变量（纯函数，无 IO）
 *
 * 支持的变量：
 * - {{selection}}：选中内容（Markdown）
 * - {{context}}：写作背景（标题/标签 + 标题路径 + 当前章节，已按预算裁剪）
 * - {{document}}：按预算裁剪的完整文档（含选区位置标记）
 * - {{title}}：文档标题
 * - {{input}}：用户在弹窗中输入的描述
 *
 * 变量名大小写不敏感，允许 `{{ selection }}` 这样的空白；未知变量原样保留，
 * 避免误伤模板中本就需要的双花括号文本。
 *
 * @changelog
 * | 版本   | 变更说明                        | 关联                         |
 * | v1.0.0 | 初始实现：自定义指令模板变量渲染 | REQ: AI 体验短板-自定义指令 |
 * /@changelog
 *
 * @author hhhuilli
 */

/** 模板变量名 */
export const TEMPLATE_VARIABLES = ['selection', 'context', 'document', 'title', 'input'] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

/** 设置页展示用的变量说明 */
export const TEMPLATE_VARIABLE_HINTS: Record<TemplateVariable, string> = {
  selection: '选中内容',
  context: '标题、标签、章节路径与当前章节',
  document: '完整文档（过长时自动裁剪）',
  title: '文档标题',
  input: '弹窗中输入的描述',
};

const VARIABLE_RE = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

function isKnownVariable(name: string): name is TemplateVariable {
  return (TEMPLATE_VARIABLES as readonly string[]).includes(name);
}

/** 模板中实际使用到的已知变量 */
export function collectTemplateVariables(template: string): Set<TemplateVariable> {
  const used = new Set<TemplateVariable>();
  for (const match of template.matchAll(VARIABLE_RE)) {
    const name = match[1].toLowerCase();
    if (isKnownVariable(name)) used.add(name);
  }
  return used;
}

/** 渲染模板：已知变量替换为对应值（缺失时为空串），未知变量原样保留 */
export function renderTemplate(
  template: string,
  values: Partial<Record<TemplateVariable, string>>,
): string {
  return template.replace(VARIABLE_RE, (raw, name: string) => {
    const key = name.toLowerCase();
    return isKnownVariable(key) ? (values[key] ?? '') : raw;
  });
}
