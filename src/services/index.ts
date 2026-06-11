export { fileService, configService, handleError } from './tauri/index';
export {
  openFileDialog,
  saveFileDialog,
  showMessage,
  showConfirmDialog,
} from './tauri/dialog-service';
export { themeLoader } from './theme-loader';
export type {
  ThemeMetadata,
  LoadedTheme,
  UserCSSResult,
  FontFileInfo,
  FontFamilyGroup,
  GlobalFontsResult,
} from './theme-loader';
export * as aiService from './ai-service';
export { PROVIDER_PRESETS, getProviderMeta } from './ai/providers';
export { AI_COMMANDS, AI_COMMAND_ORDER } from './ai/commands';
