/**
 * AI 错误码 -> 用户可读提示
 *
 * 错误码由 Rust 端 `AiError::code()` 产生，与此处一一对应。
 *
 * @changelog
 * | 版本   | 变更说明                           | 关联               |
 * | v1.0.0 | 从 generator.ts 抽出，供各调用方复用 | REQ: AI 架构改造#1 |
 * /@changelog
 *
 * @author hhhuilli
 */

const ERROR_MESSAGES: Record<string, string> = {
  no_key: '未配置 API Key，请前往 设置 -> AI 助手 填入 Key。',
  auth_failed: 'API Key 无效或已过期，请检查后重试。',
  rate_limit: '请求过于频繁，已自动重试仍失败，请稍候再试。',
  network: '网络连接失败，请检查网络后重试。',
  timeout: 'AI 服务长时间无响应，请稍后重试或更换模型。',
  canceled: '操作已取消',
};

/** 将错误码转换为友好提示；未知错误码附带原始信息 */
export function getAiErrorMessage(code: string, message: string): string {
  return ERROR_MESSAGES[code] ?? `AI 生成失败：${message}`;
}
