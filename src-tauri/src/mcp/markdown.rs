// MCP Markdown 辅助：标题大纲提取、按行切片、精确文本替换
//
// @changelog
// | 版本   | 变更说明                         | 关联                              |
// | v1.0.0 | 初始实现：大纲、行切片、唯一替换 | REQ: MCP Server TECH: 文档工具 |
// /@changelog
//
// @author hhhuilli

use serde::Serialize;

/// 大纲条目
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Heading {
    pub level: u8,
    pub text: String,
    /// 从 1 开始的行号
    pub line: usize,
}

/// 提取 ATX 标题（# ~ ######），跳过围栏代码块与 front matter
pub fn outline(content: &str) -> Vec<Heading> {
    let mut headings = Vec::new();
    let mut fence: Option<(char, usize)> = None;
    let mut in_front_matter = false;

    for (idx, line) in content.lines().enumerate() {
        let trimmed = line.trim_start();

        if idx == 0 && line.trim_end() == "---" {
            in_front_matter = true;
            continue;
        }
        if in_front_matter {
            if matches!(line.trim_end(), "---" | "...") {
                in_front_matter = false;
            }
            continue;
        }

        if let Some(marker) = fence_marker(trimmed) {
            match fence {
                None => fence = Some(marker),
                // 闭合围栏必须使用相同字符且长度不短于开启围栏
                Some((ch, len)) if marker.0 == ch && marker.1 >= len => fence = None,
                _ => {}
            }
            continue;
        }
        if fence.is_some() {
            continue;
        }

        // 缩进 4 个空格以上属于缩进代码块
        if line.len() - trimmed.len() >= 4 {
            continue;
        }
        let level = trimmed.chars().take_while(|c| *c == '#').count();
        if level == 0 || level > 6 {
            continue;
        }
        let rest = &trimmed[level..];
        if !rest.is_empty() && !rest.starts_with(' ') && !rest.starts_with('\t') {
            continue;
        }
        // 去掉可选的结尾 # 序列
        let text = rest.trim().trim_end_matches('#').trim_end().to_string();
        headings.push(Heading {
            level: level as u8,
            text,
            line: idx + 1,
        });
    }
    headings
}

/// 识别围栏起止行，返回 (字符, 长度)
fn fence_marker(trimmed: &str) -> Option<(char, usize)> {
    let ch = trimmed.chars().next()?;
    if ch != '`' && ch != '~' {
        return None;
    }
    let len = trimmed.chars().take_while(|c| *c == ch).count();
    (len >= 3).then_some((ch, len))
}

/// 按 1 起始的闭区间行号切片；返回 (切片内容, 实际起始行, 实际结束行, 总行数)
pub fn slice_lines(
    content: &str,
    start: Option<usize>,
    end: Option<usize>,
) -> Result<(String, usize, usize, usize), String> {
    let lines: Vec<&str> = content.lines().collect();
    let total = lines.len();
    let start = start.unwrap_or(1).max(1);
    let end = end.unwrap_or(total).min(total);
    if total == 0 {
        return Ok((String::new(), 0, 0, 0));
    }
    if start > end {
        return Err(format!("行号范围无效: {}-{}（共 {} 行）", start, end, total));
    }
    Ok((lines[start - 1..end].join("\n"), start, end, total))
}

/// 精确替换：old_text 必须出现且（非 replace_all 时）只出现一次；返回 (新内容, 替换次数)
pub fn replace_exact(
    content: &str,
    old_text: &str,
    new_text: &str,
    replace_all: bool,
) -> Result<(String, usize), String> {
    if old_text.is_empty() {
        return Err("old_text 不能为空".to_string());
    }
    let count = content.matches(old_text).count();
    match count {
        0 => Err("未找到 old_text，请先用 read_document 获取最新内容后精确复制".to_string()),
        n if n > 1 && !replace_all => Err(format!(
            "old_text 出现了 {} 次，请补充上下文使其唯一，或设置 replace_all=true",
            n
        )),
        n => {
            let updated = if replace_all {
                content.replace(old_text, new_text)
            } else {
                content.replacen(old_text, new_text, 1)
            };
            Ok((updated, n))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn outline_skips_code_and_front_matter() {
        let md = "---\ntitle: x\n# not\n---\n# A\ntext\n```\n# code\n```\n## B ##\n####### seven\n#nospace\n    # indented\n";
        let h = outline(md);
        assert_eq!(
            h,
            vec![
                Heading { level: 1, text: "A".into(), line: 5 },
                Heading { level: 2, text: "B".into(), line: 10 },
            ]
        );
    }

    #[test]
    fn slice_lines_clamps_range() {
        let (s, a, b, t) = slice_lines("1\n2\n3", Some(2), Some(9)).unwrap();
        assert_eq!((s.as_str(), a, b, t), ("2\n3", 2, 3, 3));
        assert!(slice_lines("1\n2", Some(3), None).is_err());
    }

    #[test]
    fn replace_requires_unique_match() {
        assert!(replace_exact("a a", "a", "b", false).is_err());
        assert_eq!(replace_exact("a a", "a", "b", true).unwrap(), ("b b".into(), 2));
        assert_eq!(replace_exact("x y", "y", "z", false).unwrap(), ("x z".into(), 1));
        assert!(replace_exact("x", "q", "z", false).is_err());
    }
}
