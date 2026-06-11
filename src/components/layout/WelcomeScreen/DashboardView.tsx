import { useSettingsStore } from '@/stores/settings-store';
import { StartActions } from './StartActions';
import { FeatureBadges } from './FeatureBadges';

/**
 * 欢迎页
 */
export function DashboardView() {
  const showOnStartup = useSettingsStore((s) => s.config.welcome.showOnStartup);
  const setNestedConfig = useSettingsStore((s) => s.setNestedConfig);

  return (
    <div className="lanismd-welcome-dashboard">
      <div className="lanismd-welcome-dashboard-inner">
        <header className="lanismd-welcome-header">
          <h1 className="lanismd-welcome-title">欢迎使用 LanisMD</h1>
          <p className="lanismd-welcome-slogan">专注书写，所见即所得</p>
        </header>

        <section className="lanismd-welcome-grid">
          <StartActions />
          {/* <RecentFilesList /> */}
        </section>

        <FeatureBadges />
        {/* <ShortcutsBar /> */}

        <footer className="lanismd-welcome-footer">
          <label className="lanismd-welcome-toggle">
            <input
              type="checkbox"
              checked={showOnStartup}
              onChange={(e) => setNestedConfig('welcome.showOnStartup', e.target.checked)}
            />
            <span>启动时显示此页</span>
          </label>
        </footer>
      </div>
    </div>
  );
}
