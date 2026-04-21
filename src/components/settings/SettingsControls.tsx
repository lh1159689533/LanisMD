import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/utils/cn';

// ---------------------------------------------------------------------------
// Slider - 滑块控件（带数值显示）
// ---------------------------------------------------------------------------

interface SliderProps {
  /** 当前值 */
  value: number;
  /** 最小值 */
  min: number;
  /** 最大值 */
  max: number;
  /** 步进值 */
  step: number;
  /** 值变更回调 */
  onChange: (value: number) => void;
  /** 显示的单位后缀（如 "px"） */
  suffix?: string;
  /** 格式化显示值 */
  formatValue?: (value: number) => string;
}

export function SettingsSlider({
  value,
  min,
  max,
  step,
  onChange,
  suffix = '',
  formatValue,
}: SliderProps) {
  // 计算填充百分比
  const percent = ((value - min) / (max - min)) * 100;
  const displayValue = formatValue ? formatValue(value) : `${value}${suffix}`;

  return (
    <div className="settings-slider-wrapper">
      <input
        type="range"
        className="settings-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={
          { '--slider-percent': `${percent}%` } as React.CSSProperties
        }
      />
      <span className="settings-slider-value">{displayValue}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Select - 下拉选择控件
// ---------------------------------------------------------------------------

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  /** 当前选中值 */
  value: string;
  /** 选项列表 */
  options: SelectOption[];
  /** 值变更回调 */
  onChange: (value: string) => void;
}

export function SettingsSelect({ value, options, onChange }: SelectProps) {
  return (
    <select
      className="settings-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// TextInput - 文本输入控件（带 debounce）
// ---------------------------------------------------------------------------

interface TextInputProps {
  /** 当前值 */
  value: string;
  /** 值变更回调 */
  onChange: (value: string) => void;
  /** 占位提示 */
  placeholder?: string;
}

export function SettingsTextInput({ value, onChange, placeholder }: TextInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // 外部值变化时同步
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = useCallback(
    (newValue: string) => {
      setLocalValue(newValue);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onChange(newValue);
      }, 500);
    },
    [onChange],
  );

  // 清理定时器
  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  return (
    <input
      type="text"
      className="settings-text-input"
      value={localValue}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={() => {
        clearTimeout(timerRef.current);
        onChange(localValue);
      }}
      placeholder={placeholder}
    />
  );
}

// ---------------------------------------------------------------------------
// NumberInput - 数字输入控件（带上下按钮）
// ---------------------------------------------------------------------------

interface NumberInputProps {
  /** 当前值 */
  value: number;
  /** 最小值 */
  min: number;
  /** 最大值 */
  max: number;
  /** 步进值 */
  step?: number;
  /** 值变更回调 */
  onChange: (value: number) => void;
  /** 显示的单位后缀 */
  suffix?: string;
}

export function SettingsNumberInput({
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix = '',
}: NumberInputProps) {
  const [localValue, setLocalValue] = useState(String(value));

  useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  const clamp = useCallback(
    (v: number) => Math.min(max, Math.max(min, v)),
    [min, max],
  );

  const commit = useCallback(
    (raw: string) => {
      const parsed = Number(raw);
      if (!Number.isNaN(parsed)) {
        onChange(clamp(parsed));
      } else {
        setLocalValue(String(value));
      }
    },
    [onChange, clamp, value],
  );

  return (
    <div className="settings-number-input-wrapper">
      <button
        className="settings-number-btn"
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        aria-label="减少"
      >
        -
      </button>
      <input
        type="text"
        className="settings-number-input"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => commit(localValue)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(localValue);
        }}
      />
      {suffix && <span className="settings-number-suffix">{suffix}</span>}
      <button
        className="settings-number-btn"
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        aria-label="增加"
      >
        +
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SegmentedControl - 分段控件
// ---------------------------------------------------------------------------

interface SegmentedOption {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  /** 当前选中值 */
  value: string;
  /** 选项列表 */
  options: SegmentedOption[];
  /** 值变更回调 */
  onChange: (value: string) => void;
}

export function SettingsSegmentedControl({
  value,
  options,
  onChange,
}: SegmentedControlProps) {
  return (
    <div className="settings-segmented">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={cn(
            'settings-segmented-item',
            value === opt.value && 'active',
          )}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
