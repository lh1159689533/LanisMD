/**
 * Theme Loader Service
 * 主题加载服务 - 支持用户自定义 CSS 加载（Typora 风格）
 *
 * 主题发现规则（无需 manifest.json）：
 * 1. 单文件形式：themes/my-theme.css → 主题 ID: "my-theme", 名称: "My Theme"
 * 2. 目录形式：themes/dracula/dracula.css → 主题 ID: "dracula", 名称: "Dracula"
 *    - CSS 入口文件必须与目录同名
 *    - 可选 fonts/ 子目录，自动发现并加载字体
 *
 * 用户 CSS 文件（按加载顺序）：
 * 1. base.user.css - 全局用户样式，应用于所有主题
 * 2. {theme}.user.css - 主题专属用户样式，仅在该主题激活时加载
 *
 * 字体支持（Typora 风格）：
 * 1. 全局字体目录：themes/fonts/ - 所有主题可用
 * 2. 主题专属字体：themes/{theme}/fonts/ - 仅该主题可用
 * 3. 用户 CSS 字体路径：自动处理 url('./fonts/...') 相对路径
 * 4. local() 优先：@font-face 中 local() 优先检查系统字体
 * 5. 多格式回退：自动生成 woff2 → woff → ttf 回退链
 *
 * 文件位置：~/.config/lanismd/themes/ (macOS/Linux) 或 AppData/lanismd/themes/ (Windows)
 */

import { invoke } from '@tauri-apps/api/core';
import { appDataDir } from '@tauri-apps/api/path';
import {
  exists,
  readTextFile,
  mkdir,
  writeTextFile,
  readDir,
  type DirEntry,
} from '@tauri-apps/plugin-fs';

export interface ThemeMetadata {
  /** 主题唯一标识（文件名或目录名，不含扩展名） */
  id: string;
  /** 主题显示名称（从 ID 自动转换：连字符→空格，首字母大写） */
  name: string;
  /** 主题形式：'file' 单文件 | 'directory' 目录形式 */
  form: 'file' | 'directory';
}

/** 用户 CSS 加载结果 */
export interface UserCSSResult {
  /** 是否成功加载 */
  loaded: boolean;
  /** base.user.css 内容（如有） */
  baseCSS?: string;
  /** {theme}.user.css 内容（如有） */
  themeCSS?: string;
  /** 错误信息（如有） */
  error?: string;
}

export interface LoadedTheme {
  /** 主题元数据 */
  metadata: ThemeMetadata;
  /** CSS 内容 */
  cssContent: string;
  /** 主题路径（单文件为 CSS 路径，目录形式为目录路径） */
  themePath: string;
  /** 自动发现的字体文件路径列表 */
  fonts?: string[];
}

/** 字体文件信息 */
export interface FontFileInfo {
  /** 字体文件绝对路径 */
  path: string;
  /** 推断的字体族名称 */
  family: string;
  /** 字体格式 (woff2, woff, truetype, opentype) */
  format: string;
  /** 字体权重 (normal, bold, 100-900) */
  weight: string;
  /** 字体样式 (normal, italic) */
  style: string;
  /** 原始文件名 */
  fileName: string;
}

/** 字体组（同一字体族的不同变体） */
export interface FontFamilyGroup {
  /** 字体族名称 */
  family: string;
  /** 该字体族下所有变体文件 */
  variants: FontFileInfo[];
}

/** 全局字体加载结果 */
export interface GlobalFontsResult {
  /** 是否成功加载 */
  loaded: boolean;
  /** 加载的字体数量 */
  count: number;
  /** 字体族列表 */
  families: string[];
  /** 错误信息（如有） */
  error?: string;
}

class ThemeLoaderService {
  /** 已加载的自定义主题样式元素 */
  private customStyleElement: HTMLStyleElement | null = null;

  /** 已加载的自定义字体样式元素（主题专属） */
  private fontStyleElement: HTMLStyleElement | null = null;

  /** 已加载的全局字体样式元素 */
  private globalFontStyleElement: HTMLStyleElement | null = null;

  /** 字体预加载 link 元素列表 */
  private preloadLinks: HTMLLinkElement[] = [];

  /** 已加载的 base.user.css 样式元素 */
  private baseUserStyleElement: HTMLStyleElement | null = null;

  /** 已加载的 {theme}.user.css 样式元素 */
  private themeUserStyleElement: HTMLStyleElement | null = null;

  /** 当前加载的自定义主题 */
  private currentCustomTheme: LoadedTheme | null = null;

  /** 当前激活的内置主题 ID */
  private currentBuiltinTheme: string | null = null;

  /** 用户主题目录（懒加载） */
  private userThemesDirPromise: Promise<string> | null = null;

  /** 已加载的全局字体族列表（缓存） */
  private loadedGlobalFonts: Set<string> = new Set();

  /**
   * 获取用户主题目录路径
   * 默认为 ~/.lanismd/themes/ (应用数据目录下的 themes 子目录)
   */
  async getUserThemesDir(): Promise<string> {
    if (!this.userThemesDirPromise) {
      this.userThemesDirPromise = (async () => {
        try {
          // 尝试获取应用数据目录
          const appDir = await appDataDir();
          // 确保路径正确拼接（appDataDir 可能带或不带尾部斜杠）
          const normalizedAppDir = appDir.endsWith('/') ? appDir.slice(0, -1) : appDir;
          console.log('appDir', appDir);
          // 在应用数据目录下创建 themes 子目录
          return `${normalizedAppDir}/themes`;
        } catch {
          // 如果无法获取，使用默认路径
          console.warn('Failed to get app data dir, using fallback');
          return '';
        }
      })();
    }
    return this.userThemesDirPromise;
  }

  /**
   * 列出所有可用的用户自定义主题
   * 自动发现两种形式：
   * 1. 单文件：themes/my-theme.css
   * 2. 目录形式：themes/dracula/dracula.css
   */
  async listUserThemes(): Promise<ThemeMetadata[]> {
    try {
      const themesDir = await this.getUserThemesDir();
      if (!themesDir) return [];

      // 确保目录存在
      const dirExists = await exists(themesDir).catch(() => false);
      if (!dirExists) return [];

      // 读取主题目录内容
      const entries = await readDir(themesDir).catch(() => [] as DirEntry[]);
      const themes: ThemeMetadata[] = [];

      for (const entry of entries) {
        // 跳过特殊文件（base.user.css, *.user.css）
        if (entry.name.endsWith('.user.css')) continue;

        if (entry.isFile && entry.name.endsWith('.css')) {
          // 单文件形式：my-theme.css
          const id = entry.name.replace(/\.css$/, '');
          themes.push({
            id,
            name: this.idToDisplayName(id),
            form: 'file',
          });
        } else if (entry.isDirectory) {
          // 目录形式：检查是否有同名 CSS 文件
          const dirName = entry.name;
          const cssPath = `${themesDir}/${dirName}/${dirName}.css`;
          const cssExists = await exists(cssPath).catch(() => false);

          if (cssExists) {
            themes.push({
              id: dirName,
              name: this.idToDisplayName(dirName),
              form: 'directory',
            });
          }
        }
      }

      return themes;
    } catch (error) {
      console.error('Failed to list user themes:', error);
      return [];
    }
  }

  /**
   * 将主题 ID 转换为显示名称
   * 规则：连字符→空格，每个单词首字母大写
   * 示例：'my-awesome-theme' → 'My Awesome Theme'
   */
  private idToDisplayName(id: string): string {
    return id
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * 加载用户自定义主题
   * 支持两种形式：
   * 1. 单文件：themes/my-theme.css
   * 2. 目录形式：themes/dracula/dracula.css + fonts/
   */
  async loadUserTheme(themeId: string): Promise<LoadedTheme | null> {
    try {
      const themesDir = await this.getUserThemesDir();
      if (!themesDir) return null;

      // 尝试两种形式
      let cssContent: string | null = null;
      let themePath: string;
      let form: 'file' | 'directory';
      let fonts: string[] | undefined;

      // 1. 先尝试单文件形式：themes/{themeId}.css
      const singleFilePath = `${themesDir}/${themeId}.css`;
      const singleFileExists = await exists(singleFilePath).catch(() => false);

      if (singleFileExists) {
        cssContent = await readTextFile(singleFilePath).catch(() => null);
        themePath = singleFilePath;
        form = 'file';
      } else {
        // 2. 尝试目录形式：themes/{themeId}/{themeId}.css
        const dirPath = `${themesDir}/${themeId}`;
        const dirCssPath = `${dirPath}/${themeId}.css`;
        const dirCssExists = await exists(dirCssPath).catch(() => false);

        if (dirCssExists) {
          cssContent = await readTextFile(dirCssPath).catch(() => null);
          themePath = dirPath;
          form = 'directory';

          // 自动发现 fonts/ 目录中的字体
          fonts = await this.discoverFonts(dirPath);
        } else {
          console.error(`Theme not found: ${themeId}`);
          return null;
        }
      }

      if (!cssContent) {
        console.error(`Failed to read theme CSS: ${themeId}`);
        return null;
      }

      // 处理 CSS 中的相对路径（仅目录形式需要）
      const processedCss =
        form === 'directory' ? this.processThemeCss(cssContent, themePath) : cssContent;

      const theme: LoadedTheme = {
        metadata: {
          id: themeId,
          name: this.idToDisplayName(themeId),
          form,
        },
        cssContent: processedCss,
        themePath,
        fonts,
      };

      return theme;
    } catch (error) {
      console.error('Failed to load user theme:', error);
      return null;
    }
  }

  /**
   * 自动发现主题目录中的字体文件
   * 扫描 {themePath}/fonts/ 目录
   */
  private async discoverFonts(themePath: string): Promise<string[]> {
    try {
      const fontsDir = `${themePath}/fonts`;
      const fontsDirExists = await exists(fontsDir).catch(() => false);
      if (!fontsDirExists) return [];

      const entries = await readDir(fontsDir).catch(() => [] as DirEntry[]);
      const fontExtensions = ['.woff2', '.woff', '.ttf', '.otf'];

      const fonts: string[] = [];
      for (const entry of entries) {
        if (entry.isFile) {
          const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase();
          if (fontExtensions.includes(ext)) {
            fonts.push(`${fontsDir}/${entry.name}`);
          }
        }
      }

      return fonts;
    } catch (error) {
      console.error('Failed to discover fonts:', error);
      return [];
    }
  }

  /**
   * 发现并解析字体文件的详细信息
   * @param fontsDir 字体目录路径
   * @returns 字体文件信息列表
   */
  private async discoverFontFiles(fontsDir: string): Promise<FontFileInfo[]> {
    try {
      const fontsDirExists = await exists(fontsDir).catch(() => false);
      if (!fontsDirExists) return [];

      const entries = await readDir(fontsDir).catch(() => [] as DirEntry[]);
      const fontExtensions = ['.woff2', '.woff', '.ttf', '.otf'];
      const fonts: FontFileInfo[] = [];

      for (const entry of entries) {
        if (entry.isFile) {
          const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase();
          if (fontExtensions.includes(ext)) {
            const fontInfo = this.parseFontFileName(entry.name, `${fontsDir}/${entry.name}`);
            if (fontInfo) {
              fonts.push(fontInfo);
            }
          }
        }
      }

      return fonts;
    } catch (error) {
      console.error('Failed to discover font files:', error);
      return [];
    }
  }

  /**
   * 解析字体文件名，提取字体族、权重、样式等信息
   * 支持的命名格式：
   * - FiraCode-Regular.woff2 → family: "Fira Code", weight: "normal"
   * - OpenSans-BoldItalic.ttf → family: "Open Sans", weight: "bold", style: "italic"
   * - Roboto-500.woff2 → family: "Roboto", weight: "500"
   */
  private parseFontFileName(fileName: string, fullPath: string): FontFileInfo | null {
    const format = this.getFontFormat(fileName);
    if (!format) return null;

    // 移除扩展名
    const baseName = fileName.replace(/\.[^/.]+$/, '');

    // 常见权重映射
    const weightMap: Record<string, string> = {
      thin: '100',
      hairline: '100',
      extralight: '200',
      ultralight: '200',
      light: '300',
      regular: '400',
      normal: '400',
      book: '400',
      medium: '500',
      semibold: '600',
      demibold: '600',
      bold: '700',
      extrabold: '800',
      ultrabold: '800',
      black: '900',
      heavy: '900',
    };

    // 尝试提取权重和样式
    let weight = '400';
    let style = 'normal';
    let family = baseName;

    // 分割文件名（支持 - 和 _ 分隔符）
    const parts = baseName.split(/[-_]/);

    if (parts.length > 1) {
      const lastPart = parts[parts.length - 1].toLowerCase();

      // 检查是否包含 italic
      if (lastPart.includes('italic')) {
        style = 'italic';
      }

      // 提取权重
      const weightPart = lastPart.replace('italic', '').trim();
      if (weightMap[weightPart]) {
        weight = weightMap[weightPart];
        family = parts.slice(0, -1).join(' ');
      } else if (/^\d{3}$/.test(weightPart)) {
        // 数字权重如 500, 700
        weight = weightPart;
        family = parts.slice(0, -1).join(' ');
      } else if (lastPart === 'italic') {
        family = parts.slice(0, -1).join(' ');
      }
    }

    // 清理字体族名称：驼峰转空格分隔
    family = family
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[-_]/g, ' ')
      .trim();

    return {
      path: fullPath,
      family,
      format,
      weight,
      style,
      fileName,
    };
  }

  /**
   * 将字体文件按字体族分组
   */
  private groupFontsByFamily(fonts: FontFileInfo[]): FontFamilyGroup[] {
    const groups = new Map<string, FontFileInfo[]>();

    for (const font of fonts) {
      const existing = groups.get(font.family) || [];
      existing.push(font);
      groups.set(font.family, existing);
    }

    // 对每个组内的字体按格式优先级排序（woff2 > woff > ttf > otf）
    const formatPriority: Record<string, number> = {
      woff2: 0,
      woff: 1,
      truetype: 2,
      opentype: 3,
    };

    return Array.from(groups.entries()).map(([family, variants]) => ({
      family,
      variants: variants.sort(
        (a, b) => (formatPriority[a.format] || 99) - (formatPriority[b.format] || 99),
      ),
    }));
  }

  /**
   * 处理主题 CSS 中的相对路径
   * 将 url('./fonts/xxx') 转换为绝对路径或 data URL
   */
  private processThemeCss(css: string, themePath: string): string {
    // 替换 url() 中的相对路径
    return css.replace(
      /url\s*\(\s*['"]?(?!data:)(?!https?:)([^'")\s]+)['"]?\s*\)/gi,
      (_match, relativePath) => {
        // 构建绝对路径
        // 注意：在 Tauri 中，可能需要使用 asset:// 协议
        const absolutePath = `${themePath}/${relativePath.replace(/^\.\//, '')}`;
        // 使用 Tauri 的 asset 协议来加载本地文件
        return `url("asset://localhost/${encodeURIComponent(absolutePath)}")`;
      },
    );
  }

  /**
   * 应用用户自定义主题到 DOM
   */
  applyCustomTheme(theme: LoadedTheme): void {
    // 移除之前的自定义主题样式
    this.removeCustomTheme();

    // 创建新的 style 元素
    this.customStyleElement = document.createElement('style');
    this.customStyleElement.id = 'lanismd-custom-theme';
    this.customStyleElement.setAttribute('data-theme-id', theme.metadata.id);
    this.customStyleElement.textContent = theme.cssContent;

    // 插入到 head 中（在内置主题之后）
    document.head.appendChild(this.customStyleElement);

    // 保存当前主题引用
    this.currentCustomTheme = theme;

    // 如果有自动发现的字体，加载字体
    if (theme.fonts?.length) {
      this.loadDiscoveredFonts(theme.fonts, theme.themePath);
    }

    console.log(`Applied custom theme: ${theme.metadata.name}`);
  }

  /**
   * 移除当前自定义主题
   */
  removeCustomTheme(): void {
    if (this.customStyleElement) {
      this.customStyleElement.remove();
      this.customStyleElement = null;
    }
    if (this.fontStyleElement) {
      this.fontStyleElement.remove();
      this.fontStyleElement = null;
    }
    this.currentCustomTheme = null;
  }

  /**
   * 加载自动发现的字体文件（增强版）
   * 支持 local() 优先和多格式回退
   * @param fontPaths 字体文件绝对路径列表
   * @param themePath 主题目录路径（用于日志）
   */
  private loadDiscoveredFonts(fontPaths: string[], themePath: string): void {
    try {
      // 移除之前的字体样式
      if (this.fontStyleElement) {
        this.fontStyleElement.remove();
      }

      // 解析字体文件信息
      const fontInfos: FontFileInfo[] = fontPaths
        .map((path) => {
          const fileName = path.split('/').pop() || '';
          return this.parseFontFileName(fileName, path);
        })
        .filter((info): info is FontFileInfo => info !== null);

      // 按字体族分组
      const familyGroups = this.groupFontsByFamily(fontInfos);

      // 生成 @font-face 规则
      const fontFaces = this.generateFontFaceRules(familyGroups);

      if (fontFaces.length > 0) {
        this.fontStyleElement = document.createElement('style');
        this.fontStyleElement.id = 'lanismd-custom-fonts';
        this.fontStyleElement.textContent = fontFaces.join('\n');
        document.head.appendChild(this.fontStyleElement);
        console.log(
          `[ThemeLoader] Loaded ${familyGroups.length} font families from ${themePath}/fonts/`,
        );
      }
    } catch (error) {
      console.error('Failed to load discovered fonts:', error);
    }
  }

  /**
   * 生成 @font-face 规则（支持 local() 和多格式回退）
   */
  private generateFontFaceRules(familyGroups: FontFamilyGroup[]): string[] {
    const rules: string[] = [];

    for (const group of familyGroups) {
      // 按权重和样式组合变体
      const variantMap = new Map<string, FontFileInfo[]>();

      for (const variant of group.variants) {
        const key = `${variant.weight}-${variant.style}`;
        const existing = variantMap.get(key) || [];
        existing.push(variant);
        variantMap.set(key, existing);
      }

      // 为每个变体生成 @font-face
      for (const [, variants] of variantMap) {
        if (variants.length === 0) continue;

        const firstVariant = variants[0];
        const { family, weight, style } = firstVariant;

        // 构建 src 列表，支持 local() 和多格式回退
        const srcParts: string[] = [];

        // 1. 添加 local() - 优先使用系统已安装字体
        const localNames = this.generateLocalFontNames(family, weight, style);
        for (const localName of localNames) {
          srcParts.push(`local('${localName}')`);
        }

        // 2. 添加本地文件 URL（按格式优先级排序）
        for (const variant of variants) {
          const url = `asset://localhost/${encodeURIComponent(variant.path)}`;
          srcParts.push(`url("${url}") format('${variant.format}')`);
        }

        rules.push(`
@font-face {
  font-family: '${family}';
  font-style: ${style};
  font-weight: ${weight};
  font-display: swap;
  src: ${srcParts.join(',\n       ')};
}`);
      }
    }

    return rules;
  }

  /**
   * 生成 local() 字体名称列表
   * Typora 风格：优先检查系统已安装字体
   */
  private generateLocalFontNames(family: string, weight: string, style: string): string[] {
    const names: string[] = [];

    // 权重名称映射
    const weightNames: Record<string, string[]> = {
      '100': ['Thin', 'Hairline'],
      '200': ['ExtraLight', 'UltraLight'],
      '300': ['Light'],
      '400': ['Regular', ''],
      '500': ['Medium'],
      '600': ['SemiBold', 'DemiBold'],
      '700': ['Bold'],
      '800': ['ExtraBold', 'UltraBold'],
      '900': ['Black', 'Heavy'],
    };

    const weightNameList = weightNames[weight] || ['Regular'];
    const isItalic = style === 'italic';

    // 生成多种可能的本地字体名称
    for (const weightName of weightNameList) {
      const styleSuffix = isItalic ? 'Italic' : '';

      if (weightName) {
        // "Font Name Bold Italic"
        names.push(`${family} ${weightName}${styleSuffix ? ' ' + styleSuffix : ''}`);
        // "Font Name-Bold-Italic"
        names.push(`${family}-${weightName}${styleSuffix ? '-' + styleSuffix : ''}`);
        // "FontName-BoldItalic"
        const compactFamily = family.replace(/\s+/g, '');
        names.push(`${compactFamily}-${weightName}${styleSuffix}`);
      } else {
        // Regular 权重
        if (isItalic) {
          names.push(`${family} Italic`);
          names.push(`${family}-Italic`);
        } else {
          names.push(family);
          names.push(`${family} Regular`);
          names.push(`${family}-Regular`);
        }
      }
    }

    return names;
  }

  /**
   * 获取字体格式
   */
  private getFontFormat(fileName: string): string | null {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const formats: Record<string, string> = {
      woff2: 'woff2',
      woff: 'woff',
      ttf: 'truetype',
      otf: 'opentype',
      eot: 'embedded-opentype',
    };
    return formats[ext || ''] || null;
  }

  /**
   * 获取当前加载的自定义主题
   */
  getCurrentCustomTheme(): LoadedTheme | null {
    return this.currentCustomTheme;
  }

  /**
   * 检查是否有自定义主题加载
   */
  hasCustomTheme(): boolean {
    return this.currentCustomTheme !== null;
  }

  /**
   * 创建用户主题目录（如果不存在）
   */
  async ensureUserThemesDir(): Promise<boolean> {
    try {
      const themesDir = await this.getUserThemesDir();
      if (!themesDir) return false;

      // 使用 Tauri FS 插件创建目录
      const dirExists = await exists(themesDir).catch(() => false);
      if (!dirExists) {
        await mkdir(themesDir, { recursive: true });
      }
      return true;
    } catch (error) {
      console.error('Failed to create user themes directory:', error);
      return false;
    }
  }

  // ==================== 用户 CSS 加载功能 ====================

  /**
   * 加载用户自定义 CSS（Typora 风格）
   * 在主题切换时调用此方法
   *
   * 加载顺序：
   * 1. 全局字体（themes/fonts/）- 所有主题可用
   * 2. base.user.css - 全局用户样式
   * 3. {theme}.user.css - 主题专属用户样式
   *
   * @param themeId 当前激活的内置主题 ID（如 'light', 'dark', 'sepia', 'nord'）
   */
  async loadUserCSS(themeId: string): Promise<UserCSSResult> {
    try {
      const themesDir = await this.getUserThemesDir();
      if (!themesDir) {
        return { loaded: false, error: 'Unable to get themes directory' };
      }

      // 确保目录存在
      await this.ensureUserThemesDir();

      // 保存当前主题 ID
      this.currentBuiltinTheme = themeId;

      // 移除之前的用户 CSS
      this.removeUserCSS();

      // 0. 加载全局字体（themes/fonts/）
      await this.loadGlobalFonts();

      let baseCSS: string | undefined;
      let themeCSS: string | undefined;

      // 1. 尝试加载 base.user.css
      const baseUserCssPath = `${themesDir}/base.user.css`;
      try {
        const baseExists = await exists(baseUserCssPath);
        if (baseExists) {
          baseCSS = await readTextFile(baseUserCssPath);
          if (baseCSS?.trim()) {
            await this.applyUserCSS(baseCSS, 'base');
            console.log('[ThemeLoader] Loaded base.user.css');
          }
        }
      } catch (err) {
        console.debug('[ThemeLoader] No base.user.css found or failed to load:', err);
      }

      // 2. 尝试加载 {theme}.user.css
      const themeUserCssPath = `${themesDir}/${themeId}.user.css`;
      try {
        const themeExists = await exists(themeUserCssPath);
        if (themeExists) {
          themeCSS = await readTextFile(themeUserCssPath);
          if (themeCSS?.trim()) {
            await this.applyUserCSS(themeCSS, 'theme');
            console.log(`[ThemeLoader] Loaded ${themeId}.user.css`);
          }
        }
      } catch (err) {
        console.debug(`[ThemeLoader] No ${themeId}.user.css found or failed to load:`, err);
      }

      const loaded = !!(baseCSS?.trim() || themeCSS?.trim());
      return { loaded, baseCSS, themeCSS };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[ThemeLoader] Failed to load user CSS:', error);
      return { loaded: false, error: errorMsg };
    }
  }

  /**
   * 应用用户 CSS 到 DOM
   * @param css CSS 内容
   * @param type 类型：'base' 为全局样式，'theme' 为主题专属样式
   */
  private async applyUserCSS(css: string, type: 'base' | 'theme'): Promise<void> {
    const styleElement = document.createElement('style');
    styleElement.id = type === 'base' ? 'lanismd-user-css-base' : 'lanismd-user-css-theme';
    styleElement.setAttribute('data-user-css', type);

    // 处理 CSS 中的相对路径（异步）
    const processedCSS = await this.processUserCssAsync(css);
    styleElement.textContent = processedCSS;

    // 插入到 head 末尾（确保优先级最高）
    document.head.appendChild(styleElement);

    if (type === 'base') {
      this.baseUserStyleElement = styleElement;
    } else {
      this.themeUserStyleElement = styleElement;
    }
  }

  /**
   * 处理用户 CSS 中的相对路径（增强版）
   * 支持 url('./fonts/...') 等相对路径转换
   */
  private async processUserCssAsync(css: string): Promise<string> {
    const themesDir = await this.getUserThemesDir();
    if (!themesDir) return css;

    // 替换 url() 中的相对路径
    return css.replace(
      /url\s*\(\s*['"]?(?!data:)(?!https?:)(?!asset:)([^'")\s]+)['"]?\s*\)/gi,
      (_match, relativePath: string) => {
        // 处理 ./fonts/ 或 fonts/ 开头的路径
        let absolutePath: string;

        if (relativePath.startsWith('./')) {
          // ./fonts/xxx → {themesDir}/fonts/xxx
          absolutePath = `${themesDir}/${relativePath.slice(2)}`;
        } else if (relativePath.startsWith('../')) {
          // 不支持上级目录，保持原样
          return _match;
        } else if (!relativePath.startsWith('/')) {
          // fonts/xxx → {themesDir}/fonts/xxx
          absolutePath = `${themesDir}/${relativePath}`;
        } else {
          // 绝对路径
          absolutePath = relativePath;
        }

        return `url("asset://localhost/${encodeURIComponent(absolutePath)}")`;
      },
    );
  }

  /**
   * 移除当前加载的用户 CSS
   * @param includeGlobalFonts 是否同时移除全局字体（默认 false，切换主题时保留全局字体）
   */
  removeUserCSS(includeGlobalFonts = false): void {
    if (this.baseUserStyleElement) {
      this.baseUserStyleElement.remove();
      this.baseUserStyleElement = null;
    }
    if (this.themeUserStyleElement) {
      this.themeUserStyleElement.remove();
      this.themeUserStyleElement = null;
    }

    // 可选移除全局字体
    if (includeGlobalFonts) {
      if (this.globalFontStyleElement) {
        this.globalFontStyleElement.remove();
        this.globalFontStyleElement = null;
      }
      this.removePreloadLinks();
      this.loadedGlobalFonts.clear();
    }
  }

  /**
   * 重新加载用户 CSS（保持当前主题）
   * 用于手动刷新用户样式
   */
  async reloadUserCSS(): Promise<UserCSSResult> {
    if (!this.currentBuiltinTheme) {
      return { loaded: false, error: 'No theme is currently active' };
    }
    return this.loadUserCSS(this.currentBuiltinTheme);
  }

  /**
   * 获取用户 CSS 文件路径信息
   * 用于 UI 显示或打开文件
   */
  async getUserCSSPaths(): Promise<{
    themesDir: string;
    baseCssPath: string;
    themeCssPath: string | null;
  } | null> {
    try {
      const themesDir = await this.getUserThemesDir();
      if (!themesDir) return null;

      return {
        themesDir,
        baseCssPath: `${themesDir}/base.user.css`,
        themeCssPath: this.currentBuiltinTheme
          ? `${themesDir}/${this.currentBuiltinTheme}.user.css`
          : null,
      };
    } catch {
      return null;
    }
  }

  /**
   * 检查用户 CSS 文件是否存在
   */
  async checkUserCSSExists(): Promise<{
    baseExists: boolean;
    themeExists: boolean;
  }> {
    try {
      const paths = await this.getUserCSSPaths();
      if (!paths) return { baseExists: false, themeExists: false };

      const baseExists = await exists(paths.baseCssPath).catch(() => false);
      const themeExists = paths.themeCssPath
        ? await exists(paths.themeCssPath).catch(() => false)
        : false;

      return { baseExists, themeExists };
    } catch {
      return { baseExists: false, themeExists: false };
    }
  }

  /**
   * 创建用户 CSS 模板文件
   * @param type 'base' 创建 base.user.css，或主题 ID 创建 {theme}.user.css
   */
  async createUserCSSTemplate(type: 'base' | string): Promise<boolean> {
    try {
      const themesDir = await this.getUserThemesDir();
      if (!themesDir) return false;

      await this.ensureUserThemesDir();

      const fileName = type === 'base' ? 'base.user.css' : `${type}.user.css`;
      const filePath = `${themesDir}/${fileName}`;

      // 检查文件是否已存在
      const fileExists = await exists(filePath).catch(() => false);
      if (fileExists) {
        console.log(`[ThemeLoader] ${fileName} already exists`);
        return true;
      }

      // 生成模板内容
      const template = this.generateUserCSSTemplate(type);

      // 使用 Tauri FS 插件写入文件
      await writeTextFile(filePath, template);

      console.log(`[ThemeLoader] Created ${fileName}`);
      return true;
    } catch (error) {
      console.error('[ThemeLoader] Failed to create user CSS template:', error);
      return false;
    }
  }

  /**
   * 生成用户 CSS 模板内容
   */
  private generateUserCSSTemplate(type: 'base' | string): string {
    if (type === 'base') {
      return `/**
 * LanisMD - 全局用户自定义样式 (base.user.css)
 * 
 * 此文件中的样式会应用于所有主题。
 * 适合放置：
 * - 自定义字体
 * - 全局颜色调整
 * - 通用布局修改
 * 
 * 变量参考：docs/theme-css-variables-reference.md
 * 
 * 注意：修改后需要切换主题或重启应用才能生效
 */

/* === 字体使用说明 === */
/*
 * 方式 1：使用全局字体目录（推荐）
 * 将字体文件放入 ~/.lanismd/themes/fonts/ 目录
 * 字体会自动加载，无需手动编写 @font-face
 * 字体族名称从文件名推断：FiraCode-Regular.woff2 → "Fira Code"
 *
 * 方式 2：手动定义 @font-face
 * 支持 local() 优先使用系统已安装字体
 * 支持相对路径 url('./fonts/xxx.woff2')
 */

/* === 示例：使用全局字体 === */
/*
:root {
  --lanismd-font-family-base: 'LXGW WenKai', -apple-system, sans-serif;
  --lanismd-font-family-mono: 'Fira Code', 'JetBrains Mono', monospace;
}
*/

/* === 示例：手动定义字体（支持 local() 回退） === */
/*
@font-face {
  font-family: 'My Font';
  font-style: normal;
  font-weight: 400;
  src: local('My Font'),
       local('MyFont-Regular'),
       url('./fonts/MyFont-Regular.woff2') format('woff2'),
       url('./fonts/MyFont-Regular.woff') format('woff');
}
*/

/* === 示例：调整编辑器宽度 === */
/*
:root {
  --editor-max-width: 900px;
}
*/

/* === 在下方添加您的自定义样式 === */

`;
    } else {
      const themeName = type.charAt(0).toUpperCase() + type.slice(1);
      return `/**
 * LanisMD - ${themeName} 主题用户自定义样式 (${type}.user.css)
 * 
 * 此文件中的样式仅在 ${themeName} 主题激活时生效。
 * 适合放置：
 * - 主题特定的颜色调整
 * - 覆盖内置主题的某些样式
 * 
 * 变量参考：docs/theme-css-variables-reference.md
 * 
 * 注意：修改后需要切换主题或重启应用才能生效
 */

/* === 示例：调整 ${themeName} 主题的强调色 === */
/*
.theme-${type} {
  --lanismd-accent: #your-color;
  --lanismd-accent-hover: #your-hover-color;
}
*/

/* === 示例：调整代码块背景 === */
/*
.theme-${type} {
  --lanismd-code-bg: #your-code-bg;
  --lanismd-cm-bg: #your-code-bg;
}
*/

/* === 示例：使用自定义字体 === */
/*
.theme-${type} {
  --lanismd-font-sans: 'Your Font', sans-serif;
  --lanismd-font-mono: 'Your Mono Font', monospace;
}
*/

/* === 在下方添加您的自定义样式 === */

`;
    }
  }

  /**
   * 打开用户主题目录（在系统文件管理器中）
   */
  async openUserThemesDir(): Promise<boolean> {
    try {
      const themesDir = await this.getUserThemesDir();
      if (!themesDir) return false;

      await this.ensureUserThemesDir();
      await invoke('reveal_in_finder', { path: themesDir });
      return true;
    } catch (error) {
      console.error('[ThemeLoader] Failed to open themes directory:', error);
      return false;
    }
  }

  // ==================== 全局字体支持 ====================

  /**
   * 加载全局字体（themes/fonts/ 目录）
   * 所有主题都可以使用这些字体
   */
  async loadGlobalFonts(): Promise<GlobalFontsResult> {
    try {
      const themesDir = await this.getUserThemesDir();
      if (!themesDir) {
        return { loaded: false, count: 0, families: [], error: 'Unable to get themes directory' };
      }

      const globalFontsDir = `${themesDir}/fonts`;

      // 检查全局字体目录是否存在
      const fontsDirExists = await exists(globalFontsDir).catch(() => false);
      if (!fontsDirExists) {
        // 目录不存在，尝试创建（方便用户添加字体）
        try {
          await mkdir(globalFontsDir, { recursive: true });
          console.log('[ThemeLoader] Created global fonts directory:', globalFontsDir);
        } catch {
          // 创建失败也没关系，用户可能没有字体要加载
        }
        return { loaded: true, count: 0, families: [] };
      }

      // 发现并解析字体文件
      const fontInfos = await this.discoverFontFiles(globalFontsDir);
      if (fontInfos.length === 0) {
        return { loaded: true, count: 0, families: [] };
      }

      // 按字体族分组
      const familyGroups = this.groupFontsByFamily(fontInfos);

      // 移除之前的全局字体样式
      if (this.globalFontStyleElement) {
        this.globalFontStyleElement.remove();
      }

      // 生成并应用 @font-face 规则
      const fontFaces = this.generateFontFaceRules(familyGroups);

      if (fontFaces.length > 0) {
        this.globalFontStyleElement = document.createElement('style');
        this.globalFontStyleElement.id = 'lanismd-global-fonts';
        this.globalFontStyleElement.textContent = fontFaces.join('\n');

        // 插入到 head 开头（优先级低于主题和用户 CSS）
        const firstStyle = document.head.querySelector('style');
        if (firstStyle) {
          document.head.insertBefore(this.globalFontStyleElement, firstStyle);
        } else {
          document.head.appendChild(this.globalFontStyleElement);
        }
      }

      // 预加载字体文件
      await this.preloadFonts(familyGroups);

      // 缓存已加载的字体族
      const families = familyGroups.map((g) => g.family);
      families.forEach((f) => this.loadedGlobalFonts.add(f));

      console.log(`[ThemeLoader] Loaded ${families.length} global font families:`, families);

      return {
        loaded: true,
        count: familyGroups.length,
        families,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[ThemeLoader] Failed to load global fonts:', error);
      return { loaded: false, count: 0, families: [], error: errorMsg };
    }
  }

  /**
   * 预加载字体文件（减少 FOUT）
   * 使用 <link rel="preload"> 提前加载关键字体
   */
  private async preloadFonts(familyGroups: FontFamilyGroup[]): Promise<void> {
    // 移除之前的预加载链接
    this.removePreloadLinks();

    // 只预加载每个字体族的首选格式（通常是 woff2）
    for (const group of familyGroups) {
      // 获取 Regular (400) 权重的字体作为首要预加载目标
      const regularVariant = group.variants.find(
        (v) => v.weight === '400' && v.style === 'normal',
      );
      const targetVariant = regularVariant || group.variants[0];

      if (targetVariant && targetVariant.format === 'woff2') {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'font';
        link.type = 'font/woff2';
        link.href = `asset://localhost/${encodeURIComponent(targetVariant.path)}`;
        link.crossOrigin = 'anonymous';

        document.head.appendChild(link);
        this.preloadLinks.push(link);
      }
    }

    if (this.preloadLinks.length > 0) {
      console.log(`[ThemeLoader] Preloading ${this.preloadLinks.length} font files`);
    }
  }

  /**
   * 移除所有字体预加载链接
   */
  private removePreloadLinks(): void {
    for (const link of this.preloadLinks) {
      link.remove();
    }
    this.preloadLinks = [];
  }

  /**
   * 获取已加载的全局字体族列表
   */
  getLoadedGlobalFonts(): string[] {
    return Array.from(this.loadedGlobalFonts);
  }

  /**
   * 检查某个字体族是否已加载
   */
  isFontFamilyLoaded(family: string): boolean {
    return this.loadedGlobalFonts.has(family);
  }

  /**
   * 创建全局字体目录（如果不存在）
   */
  async ensureGlobalFontsDir(): Promise<boolean> {
    try {
      const themesDir = await this.getUserThemesDir();
      if (!themesDir) return false;

      const fontsDir = `${themesDir}/fonts`;
      const fontsDirExists = await exists(fontsDir).catch(() => false);

      if (!fontsDirExists) {
        await mkdir(fontsDir, { recursive: true });
        console.log('[ThemeLoader] Created global fonts directory');
      }

      return true;
    } catch (error) {
      console.error('[ThemeLoader] Failed to create global fonts directory:', error);
      return false;
    }
  }

  /**
   * 获取全局字体目录路径
   */
  async getGlobalFontsDir(): Promise<string | null> {
    try {
      const themesDir = await this.getUserThemesDir();
      if (!themesDir) return null;
      return `${themesDir}/fonts`;
    } catch {
      return null;
    }
  }

  /**
   * 获取主题模板
   * 返回一个基础的主题 CSS 模板内容
   *
   * Typora 风格：无需 manifest.json，直接创建 CSS 文件即可
   * - 单文件形式：直接创建 {theme-name}.css
   * - 目录形式：创建 {theme-name}/{theme-name}.css（可选添加 fonts/ 目录）
   */
  getThemeTemplate(themeName: string): string {
    const themeId = themeName.toLowerCase().replace(/\s+/g, '-');

    return `/**
 * ${themeName} - Custom Theme for LanisMD
 *
 * 主题 ID: ${themeId}
 * 显示名称: ${themeName}
 *
 * 使用说明：
 * 1. 单文件形式：将此文件命名为 ${themeId}.css 放入主题目录
 * 2. 目录形式：创建 ${themeId}/ 目录，将此文件命名为 ${themeId}.css 放入
 *    - 如需自定义字体，在目录中创建 fonts/ 子目录，放入字体文件（自动加载）
 *
 * 命名规则：
 * - 文件名使用小写字母和连字符（如 my-theme.css）
 * - 显示名称自动转换（my-theme → My Theme）
 *
 * 变量参考：docs/theme-css-variables-reference.md
 */

.theme-${themeId} {
  /* ===== 主色调 ===== */
  --lanismd-accent: #3b82f6;
  --lanismd-accent-hover: #2563eb;
  --lanismd-accent-light: rgba(59, 130, 246, 0.1);

  /* ===== 编辑器区域 ===== */
  --lanismd-editor-bg: #ffffff;
  --lanismd-editor-text: #1e293b;
  --lanismd-editor-border: #e2e8f0;

  /* ===== 侧边栏 ===== */
  --lanismd-sidebar-bg: #f8fafc;
  --lanismd-sidebar-text: #475569;
  --lanismd-sidebar-border: #e2e8f0;
  --lanismd-sidebar-hover: rgba(0, 0, 0, 0.04);
  --lanismd-sidebar-active: rgba(59, 130, 246, 0.08);
  --lanismd-sidebar-active-text: #3b82f6;

  /* ===== 标题栏 ===== */
  --lanismd-titlebar-bg: #f8fafc;
  --lanismd-titlebar-text: #1e293b;

  /* ===== 排版 ===== */
  --lanismd-heading-color: #0f172a;
  --lanismd-text-muted: #64748b;
  --lanismd-link-color: var(--lanismd-accent);

  /* ===== 代码块 ===== */
  --lanismd-code-bg: #f6f8fa;
  --lanismd-code-toolbar-bg: #f0f2f5;
  --lanismd-cm-bg: #f6f8fa;
  --lanismd-cm-text: #24292e;

  /* ===== 更多变量请参考文档 ===== */
}

/* ===== 自定义字体示例（目录形式） ===== */
/*
 * 将字体文件放入 fonts/ 目录后，会自动生成 @font-face
 * 字体名从文件名推断：FiraCode-Regular.woff2 → "Fira Code"
 *
 * 然后在 CSS 中引用：
 * .theme-${themeId} {
 *   --lanismd-font-mono: 'Fira Code', monospace;
 *   --lanismd-font-sans: 'Your Font', sans-serif;
 * }
 */
`;
  }
}

// 导出单例
export const themeLoader = new ThemeLoaderService();
