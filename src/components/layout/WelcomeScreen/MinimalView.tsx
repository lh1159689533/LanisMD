import { TipCarousel } from './TipCarousel';

/**
 * 欢迎页：极简视图。
 */
export function MinimalView() {
  return (
    <div className="lanismd-welcome-minimal">
      <div className="lanismd-welcome-minimal-brand">
        <img src="/logo.png" alt="LanisMD" width={88} height={88} />
        <h1 className="lanismd-welcome-minimal-title">LanisMD</h1>
        <h3 className="lanismd-welcome-minimal-slogan">专注书写，所见即所得</h3>
      </div>
      <TipCarousel />
    </div>
  );
}
