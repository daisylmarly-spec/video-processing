import React, { useRef, useCallback, useMemo } from 'react';
import type { TranscriptSegment } from './TranscriptEditor';
import './Timeline.scss';

interface TimelineProps {
  duration: number;
  currentTime: number;
  segments: TranscriptSegment[];
  onSeek?: (time: number) => void;
}

function formatRulerTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Ruler: how many seconds between each major tick, based on duration
function getRulerInterval(duration: number): number {
  if (duration <= 60)   return 5;
  if (duration <= 300)  return 30;
  if (duration <= 600)  return 60;
  return 120;
}

const Timeline: React.FC<TimelineProps> = ({
  duration,
  currentTime,
  segments,
  onSeek,
}) => {
  const railRef = useRef<HTMLDivElement>(null);

  const handleRailClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    if (!rail || duration === 0) return;
    const rect = rail.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek?.(Math.max(0, Math.min(duration, ratio * duration)));
  }, [duration, onSeek]);

  // Generate ruler ticks
  const ticks = useMemo(() => {
    if (!duration) return [];
    const interval = getRulerInterval(duration);
    const result: { time: number; label: string }[] = [];
    for (let t = 0; t <= duration; t += interval) {
      result.push({ time: t, label: formatRulerTime(t) });
    }
    return result;
  }, [duration]);

  const pct = (t: number) => duration > 0 ? `${(t / duration) * 100}%` : '0%';

  return (
    <div className="timeline">
      <div className="timeline__label">时间轴</div>

      <div className="timeline__body" ref={railRef} onClick={handleRailClick}>
        {/* Ruler */}
        <div className="timeline__ruler">
          {ticks.map(({ time, label }) => (
            <div
              key={time}
              className="timeline__tick"
              style={{ left: pct(time) }}
            >
              <span className="timeline__tick-label">{label}</span>
            </div>
          ))}
        </div>

        {/* Subtitle segments track */}
        <div className="timeline__track">
          {segments.map(seg => (
            <div
              key={seg.id}
              className="timeline__segment"
              style={{
                left:  pct(seg.startTime),
                width: pct(seg.endTime - seg.startTime),
              }}
              title={seg.text}
              onClick={e => {
                e.stopPropagation();
                onSeek?.(seg.startTime);
              }}
            >
              <span className="timeline__segment-text">{seg.text}</span>
            </div>
          ))}
        </div>

        {/* Playhead */}
        {duration > 0 && (
          <div
            className="timeline__playhead"
            style={{ left: pct(currentTime) }}
          >
            <div className="timeline__playhead-head" />
            <div className="timeline__playhead-line" />
          </div>
        )}
      </div>

      {/* Duration display */}
      <div className="timeline__footer">
        <span className="timeline__footer-time">
          {formatRulerTime(currentTime)} / {formatRulerTime(duration)}
        </span>
        <span className="timeline__footer-info">
          {segments.length} 段字幕
        </span>
      </div>
    </div>
  );
};

export default Timeline;
