import { useEffect, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { WELCOME_TIPS } from './tips';

/** 每条提示展示时长（毫秒） */
const ROTATE_INTERVAL = 10000;

/**
 * 单行提示轮播组件。
 * 每 10 秒切换一条，使用淡入淡出过渡。
 */
export function TipCarousel() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % WELCOME_TIPS.length);
    }, ROTATE_INTERVAL);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="lanismd-welcome-tip">
      <Lightbulb size={14} className="lanismd-welcome-tip-icon" />
      <span key={index} className="lanismd-welcome-tip-text">
        {WELCOME_TIPS[index]}
      </span>
    </div>
  );
}
