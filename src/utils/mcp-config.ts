/**
 * 生成各 MCP 客户端的 LanisMD 配置片段
 *
 * @changelog
 * | 版本   | 变更说明                             | 关联                     |
 * | v1.0.0 | 初始实现：通用 JSON / VS Code / CLI 格式 | REQ: 设置页复制 MCP 配置 |
 * /@changelog
 *
 * @author hhhuilli
 */

/** 配置中使用的服务名 */
export const MCP_SERVER_NAME = 'lanismd';

export type McpConfigFormat = 'json' | 'vscode' | 'claude-code' | 'codex';

export interface McpConfigFormatMeta {
  value: McpConfigFormat;
  label: string;
  /** 配置粘贴位置说明 */
  hint: string;
}

export const MCP_CONFIG_FORMATS: McpConfigFormatMeta[] = [
  {
    value: 'json',
    label: '通用 JSON',
    hint: '适用于 Claude Desktop、Cursor、Windsurf、WorkBuddy、CodeBuddy 等使用 mcpServers 的客户端；已有其他服务时，只需把 lanismd 一项合并进 mcpServers。',
  },
  {
    value: 'vscode',
    label: 'VS Code',
    hint: '粘贴到项目的 .vscode/mcp.json，或通过命令面板「MCP: Open User Configuration」加入用户配置。',
  },
  {
    value: 'claude-code',
    label: 'Claude Code',
    hint: '在终端执行该命令，加 --scope user 可在所有项目中使用。',
  },
  {
    value: 'codex',
    label: 'Codex',
    hint: '追加到 ~/.codex/config.toml。',
  },
];

interface BuildOptions {
  /** LanisMD 可执行文件绝对路径 */
  executable: string;
  /** 只读模式：不暴露写入类工具 */
  readOnly: boolean;
  /** 是否为 Windows（决定命令行引号写法） */
  isWindows: boolean;
}

function serverArgs(readOnly: boolean): string[] {
  return readOnly ? ['mcp', '--read-only'] : ['mcp'];
}

/** 命令行参数加引号：POSIX 用单引号，Windows 用双引号 */
function shellQuote(value: string, isWindows: boolean): string {
  if (/^[\w./:@-]+$/.test(value)) return value;
  if (isWindows) return `"${value.replace(/"/g, '\\"')}"`;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** 生成指定格式的配置文本 */
export function buildMcpConfig(format: McpConfigFormat, options: BuildOptions): string {
  const { executable, readOnly, isWindows } = options;
  const args = serverArgs(readOnly);

  switch (format) {
    case 'vscode':
      return JSON.stringify(
        { servers: { [MCP_SERVER_NAME]: { type: 'stdio', command: executable, args } } },
        null,
        2,
      );
    case 'claude-code':
      return [
        'claude mcp add',
        MCP_SERVER_NAME,
        '--',
        shellQuote(executable, isWindows),
        ...args,
      ].join(' ');
    case 'codex':
      // TOML 基本字符串的转义规则与 JSON 兼容
      return [
        `[mcp_servers.${MCP_SERVER_NAME}]`,
        `command = ${JSON.stringify(executable)}`,
        `args = ${JSON.stringify(args).replace(/,/g, ', ')}`,
      ].join('\n');
    case 'json':
    default:
      return JSON.stringify(
        { mcpServers: { [MCP_SERVER_NAME]: { command: executable, args } } },
        null,
        2,
      );
  }
}
