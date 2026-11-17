// git 输出解析（纯函数，便于单元测试）
//
// @changelog
// | 版本   | 变更说明                                    | 关联                         |
// | v1.0.0 | 初始实现：status/numstat/log/name-status 解析 | REQ: Git 改造 TECH: 系统 git |
// /@changelog
//
// @author hhhuilli

use std::collections::HashMap;

use super::types::{ChangedFile, CommitInfo};

/// 解析 `git status --porcelain=v1 -z`
pub fn parse_status_z(raw: &str) -> Vec<ChangedFile> {
    let mut result = Vec::new();
    let mut parts = raw.split('\0').filter(|s| !s.is_empty());
    while let Some(entry) = parts.next() {
        if entry.len() < 4 {
            continue;
        }
        let (code, path) = entry.split_at(3);
        let x = code.chars().next().unwrap_or(' ');
        let y = code.chars().nth(1).unwrap_or(' ');
        let mut old_path = None;
        // -z 模式下重命名/复制条目后紧跟原路径
        if x == 'R' || x == 'C' {
            old_path = parts.next().map(|s| s.to_string());
        }
        let xy = format!("{}{}", x, y);
        let status = if matches!(xy.as_str(), "DD" | "AU" | "UD" | "UA" | "DU" | "AA" | "UU") {
            "conflicted"
        } else if xy == "??" {
            "untracked"
        } else if x == 'R' || y == 'R' {
            "renamed"
        } else if x == 'A' && y == 'D' {
            // 暂存新增后又在工作区删除，等价于无变更
            continue;
        } else if x == 'A' || x == 'C' {
            "added"
        } else if x == 'D' || y == 'D' {
            "deleted"
        } else {
            "modified"
        };
        result.push(ChangedFile {
            path: path.to_string(),
            old_path: if status == "renamed" { old_path } else { None },
            status: status.to_string(),
            additions: None,
            deletions: None,
            binary: false,
        });
    }
    result
}

/// numstat 单条结果
#[derive(Debug, Clone, PartialEq)]
pub struct NumStat {
    pub additions: Option<u32>,
    pub deletions: Option<u32>,
    pub binary: bool,
}

/// 解析 `git diff --numstat -z`，key 为新路径
pub fn parse_numstat_z(raw: &str) -> HashMap<String, NumStat> {
    let mut map = HashMap::new();
    let mut parts = raw.split('\0');
    while let Some(entry) = parts.next() {
        if entry.is_empty() {
            continue;
        }
        let mut cols = entry.splitn(3, '\t');
        let add = cols.next().unwrap_or("");
        let del = cols.next().unwrap_or("");
        let mut path = cols.next().unwrap_or("").to_string();
        if path.is_empty() {
            // 重命名：路径为空，随后依次为 旧路径\0新路径\0
            let _old = parts.next();
            path = parts.next().unwrap_or("").to_string();
        }
        let binary = add == "-" && del == "-";
        map.insert(
            path,
            NumStat {
                additions: add.parse().ok(),
                deletions: del.parse().ok(),
                binary,
            },
        );
    }
    map
}

/// 解析 `git diff --name-status -z`
pub fn parse_name_status_z(raw: &str) -> Vec<ChangedFile> {
    let mut result = Vec::new();
    let mut parts = raw.split('\0').filter(|s| !s.is_empty());
    while let Some(code) = parts.next() {
        let letter = code.chars().next().unwrap_or('M');
        let (status, old_path, path) = match letter {
            'R' => {
                let old = parts.next().unwrap_or("").to_string();
                let new = parts.next().unwrap_or("").to_string();
                ("renamed", Some(old), new)
            }
            'C' => {
                let _src = parts.next();
                ("added", None, parts.next().unwrap_or("").to_string())
            }
            'A' => ("added", None, parts.next().unwrap_or("").to_string()),
            'D' => ("deleted", None, parts.next().unwrap_or("").to_string()),
            'U' => ("conflicted", None, parts.next().unwrap_or("").to_string()),
            _ => ("modified", None, parts.next().unwrap_or("").to_string()),
        };
        if path.is_empty() {
            continue;
        }
        result.push(ChangedFile {
            path,
            old_path,
            status: status.to_string(),
            additions: None,
            deletions: None,
            binary: false,
        });
    }
    result
}

/// log 格式：记录分隔 0x1e，字段分隔 0x1f
pub const LOG_FORMAT: &str = "--format=%x1e%H%x1f%h%x1f%an%x1f%ae%x1f%at%x1f%s";

/// 解析 `git log LOG_FORMAT --name-status`
pub fn parse_log(raw: &str) -> Vec<CommitInfo> {
    let mut commits = Vec::new();
    for record in raw.split('\x1e').filter(|r| !r.trim().is_empty()) {
        let mut lines = record.lines();
        let header = lines.next().unwrap_or("");
        let fields: Vec<&str> = header.splitn(6, '\x1f').collect();
        if fields.len() < 6 {
            continue;
        }
        let (mut added, mut modified, mut deleted) = (0u32, 0u32, 0u32);
        for line in lines {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            match line.chars().next() {
                Some('A') | Some('C') => added += 1,
                Some('D') => deleted += 1,
                Some('M') | Some('R') | Some('T') => modified += 1,
                _ => {}
            }
        }
        commits.push(CommitInfo {
            hash: fields[0].to_string(),
            short_hash: fields[1].to_string(),
            author_name: fields[2].to_string(),
            author_email: fields[3].to_string(),
            timestamp: fields[4].parse().unwrap_or(0),
            subject: fields[5].to_string(),
            added,
            modified,
            deleted,
        });
    }
    commits
}

/// 将远程地址转换为网页地址：git@host:a/b.git / ssh://git@host:22/a/b / https://u@host/a/b.git
pub fn remote_to_web_url(remote: &str) -> Option<String> {
    let r = remote.trim();
    let (host, path) = if let Some(rest) = r
        .strip_prefix("https://")
        .or_else(|| r.strip_prefix("http://"))
    {
        let rest = rest.rsplit_once('@').map(|(_, h)| h).unwrap_or(rest);
        let (h, p) = rest.split_once('/')?;
        (h.to_string(), p.to_string())
    } else if let Some(rest) = r.strip_prefix("ssh://") {
        let rest = rest.rsplit_once('@').map(|(_, h)| h).unwrap_or(rest);
        let (h, p) = rest.split_once('/')?;
        // ssh 端口不代表网页端口
        (h.split(':').next().unwrap_or(h).to_string(), p.to_string())
    } else if let Some((left, p)) = r.split_once(':') {
        if left.contains('/') {
            return None;
        }
        let h = left.rsplit_once('@').map(|(_, h)| h).unwrap_or(left);
        (h.to_string(), p.to_string())
    } else {
        return None;
    };
    let path = path.trim_end_matches('/').trim_end_matches(".git");
    if host.is_empty() || path.is_empty() {
        return None;
    }
    Some(format!("https://{}/{}", host, path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_parsing() {
        let raw = " M a.md\0?? new.md\0R  b2.md\0b.md\0UU c.md\0 D d.md\0";
        let list = parse_status_z(raw);
        assert_eq!(list.len(), 5);
        assert_eq!(list[0].status, "modified");
        assert_eq!(list[1].status, "untracked");
        assert_eq!(list[2].status, "renamed");
        assert_eq!(list[2].path, "b2.md");
        assert_eq!(list[2].old_path.as_deref(), Some("b.md"));
        assert_eq!(list[3].status, "conflicted");
        assert_eq!(list[4].status, "deleted");
    }

    #[test]
    fn numstat_parsing() {
        let raw = "3\t1\ta.md\0-\t-\timg.png\x000\t0\t\0old.md\0new.md\0";
        let map = parse_numstat_z(raw);
        assert_eq!(map["a.md"].additions, Some(3));
        assert!(map["img.png"].binary);
        assert!(map.contains_key("new.md"));
    }

    #[test]
    fn log_parsing() {
        let raw = "\x1eabc\x1fab\x1fBob\x1fb@x\x1f1700000000\x1ffeat: x\n\nA\tn.md\nM\tm.md\nR100\to.md\tp.md\n\x1edef\x1fde\x1fAl\x1fa@x\x1f1690000000\x1finit\n\nD\tz.md\n";
        let list = parse_log(raw);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].added, 1);
        assert_eq!(list[0].modified, 2);
        assert_eq!(list[1].deleted, 1);
        assert_eq!(list[1].subject, "init");
    }

    #[test]
    fn web_urls() {
        assert_eq!(
            remote_to_web_url("git@github.com:a/b.git").as_deref(),
            Some("https://github.com/a/b")
        );
        assert_eq!(
            remote_to_web_url("https://tok@gitee.com/a/b.git").as_deref(),
            Some("https://gitee.com/a/b")
        );
        assert_eq!(
            remote_to_web_url("ssh://git@git.x.com:2222/g/sub/r.git").as_deref(),
            Some("https://git.x.com/g/sub/r")
        );
    }
}
