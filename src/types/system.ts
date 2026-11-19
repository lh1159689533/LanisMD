/**
 * 系统集成：自动更新相关的领域类型
 *
 * @changelog
 * | 版本   | 变更说明                     | 关联                                |
 * | v1.0.0 | 初始实现：更新信息与流程状态 | REQ: 系统集成-自动更新 TECH: 插件封装 |
 * /@changelog
 *
 * @author hhhuilli
 */

/** 更新服务器上公布的版本信息 */
export interface UpdateInfo {
  /** 新版本号 */
  version: string;
  /** 当前运行版本 */
  currentVersion: string;
  /** 发布说明 */
  body?: string;
  /** 发布时间（RFC 3339） */
  date?: string;
}

/** 更新流程状态 */
export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';
