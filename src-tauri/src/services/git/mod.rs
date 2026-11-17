// Git 能力模块：基于系统 git 命令实现仓库查询、提交推送、同步与克隆

pub mod clone;
pub mod credentials;
pub mod ops;
pub mod parser;
pub mod repo;
pub mod runner;
pub mod types;

#[cfg(test)]
mod tests;
