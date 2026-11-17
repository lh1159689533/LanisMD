/**
 * Git 相关纯函数工具
 *
 * @changelog
 * | 版本   | 变更说明               | 关联                         |
 * | v1.0.0 | 初始实现：地址解析与按天分组 | REQ: Git 改造 TECH: 系统 git |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { ChangeStatus, CommitInfo } from '@/types/git';

/** 粗略判断是否为 Git 仓库地址（HTTPS / SSH / scp 风格 / 本地 file://） */
export function isLikelyGitUrl(url: string): boolean {
  const u = url.trim();
  return /^(https?|ssh|git|file):\/\/\S+$/i.test(u) || /^[\w.-]+@[\w.-]+:\S+$/.test(u);
}

/** 归一化远程地址为 host/path，用于判断两个地址是否指向同一仓库 */
export function normalizeRemote(url: string): string {
  let u = url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
  const scp = /^[\w.-]+@([\w.-]+):(.+)$/.exec(u);
  if (scp) return `${scp[1]}/${scp[2]}`.toLowerCase();
  u = u.replace(/^[a-z+]+:\/\//i, '');
  u = u.replace(/^[^@/]+@/, '');
  // 去掉端口，SSH 与 HTTPS 端口不同但指向同一仓库
  u = u.replace(/^([^/:]+):\d+\//, '$1/');
  return u.toLowerCase();
}

/** 从仓库地址推断目录名 */
export function repoNameFromUrl(url: string): string {
  const trimmed = url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
  const name = trimmed.split(/[/:]/).pop() ?? '';
  return name.replace(/[^\w.\u4e00-\u9fa5-]/g, '-') || 'repo';
}

/** 取 HTTPS 地址的 host[:port]，非 HTTPS 返回 null */
export function httpHostOf(url: string): string | null {
  const m = /^https?:\/\/(?:[^@/]+@)?([^/]+)/i.exec(url.trim());
  return m ? m[1].toLowerCase() : null;
}

/** 状态徽标字母 */
export const STATUS_LETTER: Record<ChangeStatus, string> = {
  added: 'A',
  untracked: 'U',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  conflicted: '!',
};

export const STATUS_LABEL: Record<ChangeStatus, string> = {
  added: '新增',
  untracked: '新增',
  modified: '修改',
  deleted: '删除',
  renamed: '重命名',
  conflicted: '冲突',
};

/** 拆分路径为 目录 + 文件名 */
export function splitPath(path: string): { dir: string; name: string } {
  const idx = path.lastIndexOf('/');
  return idx < 0 ? { dir: '', name: path } : { dir: path.slice(0, idx), name: path.slice(idx + 1) };
}

export interface CommitDayGroup {
  key: string;
  label: string;
  commits: CommitInfo[];
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** 按本地日期分组：今天 / 昨天 / M月D日 周X（跨年显示年份） */
export function groupCommitsByDay(commits: CommitInfo[], now = new Date()): CommitDayGroup[] {
  const today = dayKey(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterday = dayKey(yesterdayDate);
  const groups: CommitDayGroup[] = [];
  for (const commit of commits) {
    const d = new Date(commit.timestamp * 1000);
    const key = dayKey(d);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      let label: string;
      if (key === today) label = '今天';
      else if (key === yesterday) label = '昨天';
      else if (d.getFullYear() === now.getFullYear())
        label = `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`;
      else label = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
      group = { key, label, commits: [] };
      groups.push(group);
    }
    group.commits.push(commit);
  }
  return groups;
}
