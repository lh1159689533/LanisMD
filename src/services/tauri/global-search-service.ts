import { invoke } from '@tauri-apps/api/core';

/** 单条匹配结果 */
export interface SearchMatchItem {
  /** 匹配行号（从1开始） */
  lineNumber: number;
  /** 完整行内容 */
  lineContent: string;
  /** 匹配在行内的起始字符位置 */
  matchStart: number;
  /** 匹配在行内的结束字符位置 */
  matchEnd: number;
}

/** 单个文件的搜索结果 */
export interface FileSearchResult {
  /** 文件绝对路径 */
  filePath: string;
  /** 文件名 */
  fileName: string;
  /** 该文件中的所有匹配 */
  matches: SearchMatchItem[];
}

/** 搜索响应 */
export interface SearchResponse {
  /** 按文件分组的结果 */
  results: FileSearchResult[];
  /** 总匹配数 */
  totalMatches: number;
  /** 包含匹配的文件数 */
  totalFiles: number;
}

/** 搜索请求参数 */
export interface SearchParams {
  rootPath: string;
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  includeFolders: string[];
  excludeFolders: string[];
}

/**
 * 全局搜索服务 - 封装 Tauri 后端搜索命令调用
 */
class GlobalSearchService {
  /** 执行全局搜索 */
  async search(params: SearchParams): Promise<SearchResponse> {
    return invoke<SearchResponse>('global_search', { params });
  }
}

export const globalSearchService = new GlobalSearchService();
