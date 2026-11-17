/**
 * @changelog
 * | 版本   | 变更说明                                       | 关联                                          |
 * | v1.0.0 | 浏览器端空实现，替代 @napi-rs/canvas 原生模块 | REQ: 构建修复 TECH: vite-config 原生模块排除  |
 * /@changelog
 *
 * @author lihui
 */

// @napi-rs/canvas 是 pdfjs-dist 在 Node 环境下的可选 Canvas 后端（原生 .node 二进制）。
// 浏览器端不会执行相关代码路径，此处用空实现替换，避免 Vite/Rollup 构建时解析原生二进制文件。

export const createCanvas = () => {
  throw new Error('@napi-rs/canvas 仅在 Node 环境可用');
};

export const loadImage = () => {
  throw new Error('@napi-rs/canvas 仅在 Node 环境可用');
};

export default {
  createCanvas,
  loadImage,
};
