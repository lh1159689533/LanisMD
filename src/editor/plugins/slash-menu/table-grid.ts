/**
 * 表格网格选择器
 *
 * 在 slash menu 中 hover "表格" 命令时，右侧展示一个可交互网格：
 * - 默认展示 4x4 空网格
 * - 鼠标移入按位置高亮 "行 x 列"（行数含表头行），底部实时显示计数
 * - 选中尺寸达到默认边界时网格向外扩展一格缓冲区，最大 10x10
 * - 点击某格即按 "行 x 列" 插入表格
 *
 * 网格自身只负责选择交互，实际插入由外部通过 `onPick` 回调完成。
 * 键盘导航由 SlashMenuView 通过 `setSelection` / `getSelection` 驱动。
 */

/** 最大行列数 */
const MAX_SIZE = 10;
/** 默认网格边长（未超过时至少展示 4x4） */
const BASE_SIZE = 4;

export interface TableGridController {
  /** 面板根元素 */
  element: HTMLElement;
  /** 设置当前选中的行列（自动 clamp 到 0..MAX_SIZE 并重渲染） */
  setSelection: (rows: number, cols: number) => void;
  /** 获取当前选中行列 */
  getSelection: () => { rows: number; cols: number };
  /** 重置为未选中状态（0 x 0） */
  reset: () => void;
}

/**
 * 计算某一维度下应展示的格子数：
 * 至少 BASE_SIZE，选中值达到边界时向外多展示一格缓冲区，上限 MAX_SIZE。
 */
function visibleDim(selected: number): number {
  return Math.min(MAX_SIZE, Math.max(BASE_SIZE, selected + 1));
}

/**
 * 创建表格网格选择器。
 *
 * @param onPick 用户点击某格时回调，参数为 (行数含表头, 列数)
 */
export function createTableGrid(onPick: (rows: number, cols: number) => void): TableGridController {
  let selRows = 0;
  let selCols = 0;

  const root = document.createElement('div');
  root.className = 'lanismd-table-grid';

  const title = document.createElement('div');
  title.className = 'lanismd-table-grid-title';
  title.textContent = '表格';
  root.appendChild(title);

  const cellsEl = document.createElement('div');
  cellsEl.className = 'lanismd-table-grid-cells';
  root.appendChild(cellsEl);

  const countEl = document.createElement('div');
  countEl.className = 'lanismd-table-grid-count';
  root.appendChild(countEl);

  /** 重建/更新网格 DOM 与高亮状态 */
  function render() {
    const vRows = visibleDim(selRows);
    const vCols = visibleDim(selCols);

    // 仅在可见尺寸变化时重建格子，避免频繁 DOM 抖动
    if (cellsEl.dataset.rows !== String(vRows) || cellsEl.dataset.cols !== String(vCols)) {
      cellsEl.dataset.rows = String(vRows);
      cellsEl.dataset.cols = String(vCols);
      cellsEl.style.gridTemplateColumns = `repeat(${vCols}, var(--lanismd-table-grid-cell))`;
      cellsEl.innerHTML = '';
      for (let r = 1; r <= vRows; r++) {
        for (let c = 1; c <= vCols; c++) {
          const cell = document.createElement('div');
          cell.className = 'lanismd-table-grid-cell';
          cell.dataset.row = String(r);
          cell.dataset.col = String(c);
          cellsEl.appendChild(cell);
        }
      }
    }

    // 更新高亮
    Array.from(cellsEl.children).forEach((el) => {
      const cell = el as HTMLElement;
      const r = Number(cell.dataset.row);
      const c = Number(cell.dataset.col);
      cell.dataset.active = String(r <= selRows && c <= selCols);
    });

    countEl.textContent = `${selRows} x ${selCols}`;
  }

  function setSelection(rows: number, cols: number) {
    selRows = Math.max(0, Math.min(MAX_SIZE, Math.floor(rows)));
    selCols = Math.max(0, Math.min(MAX_SIZE, Math.floor(cols)));
    render();
  }

  // hover 高亮：使用事件委托，避免为每个格子单独绑定
  cellsEl.addEventListener('mouseover', (e) => {
    const target = (e.target as HTMLElement).closest('.lanismd-table-grid-cell') as HTMLElement | null;
    if (!target) return;
    setSelection(Number(target.dataset.row), Number(target.dataset.col));
  });

  // 移出网格时归零（对应初始 0 x 0 态；键盘选择时鼠标不在网格内，不受影响）
  cellsEl.addEventListener('mouseleave', () => {
    setSelection(0, 0);
  });

  // 点击插入：使用 mousedown 以避免编辑器失焦/选区变化带来的副作用
  cellsEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const target = (e.target as HTMLElement).closest('.lanismd-table-grid-cell') as HTMLElement | null;
    if (!target) return;
    onPick(Number(target.dataset.row), Number(target.dataset.col));
  });

  render();

  return {
    element: root,
    setSelection,
    getSelection: () => ({ rows: selRows, cols: selCols }),
    reset: () => setSelection(0, 0),
  };
}
