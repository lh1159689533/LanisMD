import { GravityLetters } from './GravityLetters';
import { TipCarousel } from './TipCarousel';

interface MinimalViewProps {
  /** 是否播放标题入场动画（仅应用启动时的欢迎页为 true） */
  playIntro?: boolean;
}

/**
 * 欢迎页：极简视图。
 */
export function MinimalView({ playIntro = false }: MinimalViewProps) {
  return (
    <div className="lanismd-welcome-minimal">
      <div className="lanismd-welcome-minimal-brand">
        <img src="/logo.png" alt="LanisMD" width={88} height={88} />
        <GravityLetters text="LanisMD" playIntro={playIntro} />
        <h3 className="lanismd-welcome-minimal-slogan">专注书写，所见即所得</h3>
      </div>
      <TipCarousel />
    </div>
  );
}
