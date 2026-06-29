/// <reference types="vite/client" />

// Vite 的 ?url 后缀导入声明
declare module '*?url' {
  const src: string;
  export default src;
}
