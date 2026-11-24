// Git 能力集成测试：在临时目录中用本地裸仓库模拟远程，覆盖提交、推送、同步、冲突、自动暂存
//
// @author hhhuilli

use std::fs;
use std::path::Path;

use super::ops;
use super::repo;
use super::runner::GitRunner;
use super::types::FileEntryRequest;

fn git(dir: &Path, args: &[&str]) {
    GitRunner::run(dir, args).unwrap_or_else(|e| panic!("git {:?} 失败: {}", args, e));
}

fn entries(dir: &Path) -> Vec<FileEntryRequest> {
    repo::status(dir.to_str().unwrap(), "")
        .unwrap()
        .into_iter()
        .map(|f| FileEntryRequest {
            path: f.path,
            old_path: f.old_path,
            status: f.status,
        })
        .collect()
}

fn clone_to(remote: &Path, target: &Path) {
    let parent = target.parent().unwrap();
    git(
        parent,
        &["clone", remote.to_str().unwrap(), target.to_str().unwrap()],
    );
    let t = target.to_str().unwrap();
    ops::set_identity(t, "Tester", "tester@example.com", false).unwrap();
}

#[test]
fn full_flow() {
    if GitRunner::availability().is_none() {
        return;
    }
    let tmp = tempfile::tempdir().unwrap();
    let remote = tmp.path().join("remote.git");
    fs::create_dir_all(&remote).unwrap();
    git(&remote, &["init", "--bare", "-q"]);

    let a = tmp.path().join("a");
    let b = tmp.path().join("b");
    clone_to(&remote, &a);
    let a_s = a.to_str().unwrap();
    let b_s = b.to_str().unwrap();

    // 1. 首次提交并推送（无上游，自动 -u）
    fs::write(a.join("note.md"), "line1\nline2\n").unwrap();
    fs::create_dir_all(a.join("docs")).unwrap();
    fs::write(a.join("docs/x.md"), "x\n").unwrap();
    let st = repo::status(a_s, "").unwrap();
    assert_eq!(st.len(), 2);
    assert!(st.iter().all(|f| f.status == "untracked"));
    assert_eq!(
        st.iter().find(|f| f.path == "note.md").unwrap().additions,
        Some(2)
    );
    // 只提交勾选的文件
    let only_note: Vec<FileEntryRequest> = entries(&a)
        .into_iter()
        .filter(|f| f.path == "note.md")
        .collect();
    ops::commit_and_push(a_s, &only_note, "init").unwrap();
    let left = repo::status(a_s, "").unwrap();
    assert_eq!(left.len(), 1);
    assert_eq!(left[0].path, "docs/x.md");
    // 作用域过滤
    assert_eq!(repo::status(a_s, "docs").unwrap().len(), 1);
    ops::commit_and_push(a_s, &entries(&a), "add docs").unwrap();

    let info = repo::repo_info(a_s).unwrap().unwrap();
    assert!(info.upstream.is_some());
    assert_eq!(info.ahead, 0);
    let info_docs = repo::repo_info(a.join("docs").to_str().unwrap())
        .unwrap()
        .unwrap();
    assert_eq!(info_docs.scope, "docs");

    // 2. 另一端克隆并同步
    clone_to(&remote, &b);
    fs::write(a.join("note.md"), "line1\nline2 changed\n").unwrap();
    let st = repo::status(a_s, "").unwrap();
    assert_eq!(st[0].additions, Some(1));
    assert_eq!(st[0].deletions, Some(1));
    ops::commit_and_push(a_s, &entries(&a), "update note").unwrap();
    let p = ops::pull(b_s).unwrap();
    assert!(p.updated);
    assert!(p.conflicts.is_empty());
    assert_eq!(
        fs::read_to_string(b.join("note.md")).unwrap(),
        "line1\nline2 changed\n"
    );

    // 3. 自动暂存：本地有未提交修改时同步不丢失
    fs::write(b.join("docs/x.md"), "x local\n").unwrap();
    fs::write(a.join("other.md"), "o\n").unwrap();
    ops::commit_and_push(a_s, &entries(&a), "other").unwrap();
    let p = ops::pull(b_s).unwrap();
    assert!(p.updated);
    assert!(b.join("other.md").exists());
    assert_eq!(
        fs::read_to_string(b.join("docs/x.md")).unwrap(),
        "x local\n"
    );
    ops::discard(b_s, &entries(&b)).unwrap();
    assert!(repo::status(b_s, "").unwrap().is_empty());

    // 4. 推送被拒：提交被撤销，HEAD 不变，修改仍在工作区且未暂存
    fs::write(a.join("note.md"), "line1 from a\nline2 changed\n").unwrap();
    ops::commit_and_push(a_s, &entries(&a), "a edit").unwrap();
    fs::write(b.join("note.md"), "line1 from b\nline2 changed\n").unwrap();
    let head_before = GitRunner::run(&b, &["rev-parse", "HEAD"]).unwrap();
    let err = ops::commit_and_push(b_s, &entries(&b), "b edit")
        .unwrap_err()
        .to_string();
    assert!(err.contains("已撤销本次提交"), "{}", err);
    assert!(err.contains("推送被拒绝"), "{}", err);
    assert_eq!(
        GitRunner::run(&b, &["rev-parse", "HEAD"]).unwrap(),
        head_before
    );
    assert_eq!(
        fs::read_to_string(b.join("note.md")).unwrap(),
        "line1 from b\nline2 changed\n"
    );
    assert!(GitRunner::run(&b, &["diff", "--cached", "--name-only"])
        .unwrap()
        .trim()
        .is_empty());
    assert_eq!(repo::status(b_s, "").unwrap()[0].status, "modified");

    // 5. 冲突：本地提交后同步产生合并冲突，保留本地解决
    git(&b, &["commit", "-qam", "b edit"]);
    let p = ops::pull(b_s).unwrap();
    assert_eq!(p.conflicts, vec!["note.md".to_string()]);
    assert_eq!(repo::status(b_s, "").unwrap()[0].status, "conflicted");
    assert!(repo::repo_info(b_s).unwrap().unwrap().merging);
    ops::resolve_conflict(b_s, "note.md", "local").unwrap();
    assert_eq!(
        fs::read_to_string(b.join("note.md")).unwrap(),
        "line1 from b\nline2 changed\n"
    );

    // 5.1 合并提交推送被拒：撤销后仍处于合并中，已解决内容保留
    fs::write(a.join("late.md"), "late\n").unwrap();
    ops::commit_and_push(a_s, &entries(&a), "late").unwrap();
    let head_before = GitRunner::run(&b, &["rev-parse", "HEAD"]).unwrap();
    let err = ops::commit_and_push(b_s, &entries(&b), "")
        .unwrap_err()
        .to_string();
    assert!(err.contains("仍处于合并中"), "{}", err);
    assert_eq!(
        GitRunner::run(&b, &["rev-parse", "HEAD"]).unwrap(),
        head_before
    );
    assert!(repo::repo_info(b_s).unwrap().unwrap().merging);
    assert_eq!(
        fs::read_to_string(b.join("note.md")).unwrap(),
        "line1 from b\nline2 changed\n"
    );

    // 5.2 放弃合并后重新同步、再次解决冲突并成功推送
    ops::abort_merge(b_s).unwrap();
    let p = ops::pull(b_s).unwrap();
    assert_eq!(p.conflicts, vec!["note.md".to_string()]);
    ops::resolve_conflict(b_s, "note.md", "local").unwrap();
    ops::commit_and_push(b_s, &entries(&b), "").unwrap();
    assert!(!repo::repo_info(b_s).unwrap().unwrap().merging);
    assert!(b.join("late.md").exists());
    assert_eq!(repo::repo_info(b_s).unwrap().unwrap().ahead, 0);

    // 6. 历史与提交文件、版本内容
    let log = repo::log(b_s, "", 0, 50).unwrap();
    assert!(log.len() >= 6);
    let add_docs = log.iter().find(|c| c.subject == "add docs").unwrap();
    assert_eq!(add_docs.added, 1);
    let files = repo::commit_files(b_s, "", &add_docs.hash).unwrap();
    assert_eq!(files[0].path, "docs/x.md");
    let init = log.iter().find(|c| c.subject == "init").unwrap();
    let files = repo::commit_files(b_s, "", &init.hash).unwrap();
    assert_eq!(files[0].status, "added");
    let update = log.iter().find(|c| c.subject == "update note").unwrap();
    let v = repo::file_versions(super::types::FileVersionsRequest {
        repo_path: b_s.to_string(),
        file_path: "note.md".to_string(),
        old_path: None,
        status: "modified".to_string(),
        commit: Some(update.hash.clone()),
    })
    .unwrap();
    assert_eq!(v.original.as_deref(), Some("line1\nline2\n"));
    assert_eq!(v.modified.as_deref(), Some("line1\nline2 changed\n"));
    assert_eq!(repo::log(b_s, "docs", 0, 50).unwrap().len(), 1);

    // 7. 分支列表（含末端提交摘要）
    let branches = repo::branches(b_s).unwrap();
    let current = branches.iter().find(|br| br.current && !br.remote).unwrap();
    assert!(current.short_hash.is_some());
    assert!(current.author_name.is_some());
    assert!(current.timestamp.is_some());
    assert!(current.subject.is_some());
}

/// 首次提交推送失败（远程不可达）：回到未出生分支，文件恢复为未跟踪
#[test]
fn initial_commit_rollback() {
    if GitRunner::availability().is_none() {
        return;
    }
    let tmp = tempfile::tempdir().unwrap();
    let repo_dir = tmp.path().join("r");
    fs::create_dir_all(&repo_dir).unwrap();
    git(&repo_dir, &["init", "-q"]);
    let missing = tmp.path().join("missing.git");
    git(
        &repo_dir,
        &["remote", "add", "origin", missing.to_str().unwrap()],
    );
    let r = repo_dir.to_str().unwrap();
    ops::set_identity(r, "Tester", "tester@example.com", false).unwrap();
    fs::write(repo_dir.join("a.md"), "a\n").unwrap();

    let err = ops::commit_and_push(r, &entries(&repo_dir), "init")
        .unwrap_err()
        .to_string();
    assert!(err.contains("已撤销本次提交"), "{}", err);
    assert!(!repo::has_head(&repo_dir));
    let st = repo::status(r, "").unwrap();
    assert_eq!(st.len(), 1);
    assert_eq!(st[0].status, "untracked");
}

/// 未配置远程：直接拒绝，不产生本地提交
#[test]
fn reject_without_remote() {
    if GitRunner::availability().is_none() {
        return;
    }
    let tmp = tempfile::tempdir().unwrap();
    let repo_dir = tmp.path().join("r");
    fs::create_dir_all(&repo_dir).unwrap();
    git(&repo_dir, &["init", "-q"]);
    let r = repo_dir.to_str().unwrap();
    ops::set_identity(r, "Tester", "tester@example.com", false).unwrap();
    fs::write(repo_dir.join("a.md"), "a\n").unwrap();
    let err = ops::commit_and_push(r, &entries(&repo_dir), "init")
        .unwrap_err()
        .to_string();
    assert!(err.contains("未配置远程仓库"), "{}", err);
    assert!(!repo::has_head(&repo_dir));
}
