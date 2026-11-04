/**
 * localStorage 兜底守卫（side-effect 模块，import 即生效）
 *
 * 背景（为什么需要本模块）：
 * WKWebView 在存储子系统偶发不可用时，`window.localStorage` 会返回 null
 * （WebKit 的行为是返回 null 而非抛 SecurityError）。而 `@plait/core` 的
 * `isDebug()`（debug.ts，编译产物 plait-core.mjs 的 isDebug 函数）在命中检测、
 * list-render 组件初始化等画布所有高频路径上裸调 `localStorage.getItem`，
 * `@plait/draw` 的创建/移动/缩放调试绘制同样如此。localStorage 一旦为 null，
 * 画布上任何操作都会抛 `TypeError: null is not an object (evaluating
 * 'localStorage.getItem')`。更糟的是 plait 在 `board.isRectangleHit` 的
 * catch 分支里调用 `isDebug()`，原始异常会被这个 TypeError 替换，真实错误
 * 彻底不可见。
 *
 * 方案：拦截 `window.localStorage` 的读取。每次访问时优先返回 WebKit 原生
 * 实现；若原生实现为 null（启动时即坏，或运行中途劣化），降级返回内存垫片，
 * 保证不崩溃（代价是降级期间数据不持久化）。首次降级时 console.warn 一次，
 * 用于收集该偶现问题的发生时机证据。
 *
 * 注意：本模块必须在任何 store / 业务模块之前导入——Zustand store 在模块
 * 初始化阶段就会访问 localStorage。
 *
 * @changelog
 * | 版本   | 变更说明                                        | 关联                                    |
 * | v1.0.0 | 初始实现：localStorage 为 null 时降级内存垫片     | REQ: board-localstorage-null-fix        |
 * /@changelog
 *
 * @author hhhuilli
 */

/** 内存垫片：原生 localStorage 不可用时的降级实现（不持久化） */
function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(String(key), String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
    key: (index) => Array.from(map.keys())[index] ?? null,
  } as Storage;
}

const memoryShim = createMemoryStorage();
let hasWarned = false;

/** 沿原型链查找原生 localStorage 属性描述符（WebKit 定义在原型上） */
function findNativeDescriptor(): PropertyDescriptor | undefined {
  let current: unknown = window;
  while (current && typeof current === 'object') {
    const desc = Object.getOwnPropertyDescriptor(
      current as object,
      'localStorage',
    );
    if (desc) return desc;
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}

const nativeDescriptor = findNativeDescriptor();

if (nativeDescriptor?.get) {
  // 常规路径：Web 环境（含 WKWebView）中 localStorage 是访问器属性。
  // 在 window 实例上覆写同名 getter，按次读取时惰性探测原生实现是否可用，
  // 从而同时覆盖「启动时即为 null」与「运行中途劣化为 null」两种偶现形态；
  // 原生恢复后自动切回原生实现（数据持久化不受影响）。
  const nativeGet = nativeDescriptor.get;
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get(this: Window) {
      let native: Storage | null = null;
      try {
        native = nativeGet.call(this) as Storage | null;
      } catch {
        // 原生 getter 抛 SecurityError 等异常时按不可用处理
      }
      if (native) return native;
      if (!hasWarned) {
        hasWarned = true;
        console.warn(
          '[storage-guard] window.localStorage 为 null（WKWebView 偶发异常），已降级为内存存储（不持久化）',
        );
      }
      return memoryShim;
    },
  });
} else {
  // 兜底路径：非标准环境下拿不到访问器描述符，仅在当前值确实为 null/undefined
  // 时以数据属性方式补一个内存垫片（此形态下无法感知原生恢复）
  let initial: Storage | null | undefined;
  try {
    initial = window.localStorage;
  } catch {
    initial = null;
  }
  if (initial === null || initial === undefined) {
    hasWarned = true;
    console.warn(
      '[storage-guard] window.localStorage 不可用，已降级为内存存储（不持久化）',
    );
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryShim,
    });
  }
}
