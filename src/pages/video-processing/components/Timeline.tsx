import React, { useRef, useCallback, useMemo, useState } from 'react';
import { MinusOutlined, PlusOutlined } from '@ant-design/icons';
import type { TranscriptSegment } from './TranscriptEditor';
import { getSpeakerColor } from './TranscriptEditor';
import './Timeline.scss';

interface TimelineProps {
  duration:    number;
  currentTime: number;
  segments:    TranscriptSegment[];
  onSeek?:     (time: number) => void;
}

function formatRulerTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getRulerInterval(duration: number, zoom: number): number {
  const visible = duration / zoom;
  if (visible <= 30)  return 5;
  if (visible <= 120) return 10;
  if (visible <= 300) return 30;
  if (visible <= 600) return 60;
  return 120;
}

const ZOOM_LEVELS = [1, 2, 3, 5, 8];

const Timeline: React.FC<TimelineProps> = ({ duration, currentTime, segments, onSeek }) => {
  const railRef    = useRef<HTMLDivElement>(null);
  const scrollRef  = useRef<HTMLDivElement>(null);
  const [zoomIdx, setZoomIdx] = useState(0);
  const zoom = ZOOM_LEVELS[zoomIdx];

  const handleRailClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    if (!rail || duration === 0) return;
    const rect  = rail.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek?.(Math.max(0, Math.min(duration, ratio * duration)));
  }, [duration, onSeek]);

  const ticks = useMemo(() => {
    if (!duration) return [];
    const interval = getRulerInterval(duration, zoom);
    const result: { time: number; label: string }[] = [];
    for (let t = 0; t <= duration; t += interval) {
      result.push({ time: t, label: formatRulerTime(t) });
    }
    return result;
  }, [duration, zoom]);

  const pct = (t: number) => duration > 0 ? `${(t / duration) * 100}%` : '0%';

  // Keep playhead visible when it moves
  React.useEffect(() => {
    const container = scrollRef.current;
    if (!container || duration === 0 || zoom === 1) return;
    const ratio     = currentTime / duration;
    const trackW    = container.scrollWidth;
    const viewW     = container.clientWidth;
    const target    = ratio * trackW - viewW / 2;
    container.scrollLeft = Math.max(0, Math.min(target, trackW - viewW));
  }, [currentTime, duration, zoom]);

  return (
    <div className="timeline">
      {/* Header */}
      <div className="timeline__header">
        <span className="timeline__label">时间轴</span>
        <div className="timeline__zoom">
          <button
            className="timeline__zoom-btn"
            onClick={() => setZoomIdx(i => Math.max(0, i - 1))}
            disabled={zoomIdx === 0}
          >
            <MinusOutlined />
          </button>
          <span className="timeline__zoom-val">{zoom.toFixed(1)}x</span>
          <button
            className="timeline__zoom-btn"
            onClick={() => setZoomIdx(i => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
            disabled={zoomIdx === ZOOM_LEVELS.length - 1}
          >
            <PlusOutlined />
          </button>
        </div>
      </div>

      {/* Scrollable track area */}
      <div className="timeline__scroll" ref={scrollRef}>
        <div
          className="timeline__body"
          style={{ width: `${zoom * 100}%` }}
          ref={railRef}
          onClick={handleRailClick}
        >
          {/* Ruler */}
          <div className="timeline__ruler">
            {ticks.map(({ time, label }) => (
              <div key={time} className="timeline__tick" style={{ left: pct(time) }}>
                <span className="timeline__tick-label">{label}</span>
              </div>
            ))}
          </div>

          {/* Segment track */}
          <div className="timeline__track">
            {segments.map(seg => {
              const color   = getSpeakerColor(seg.speaker);
              const speaker = seg.speaker || '讲话人 1';
              return (
                <div
                  key={seg.id}
                  className="timeline__segment"
                  style={{
                    left:        pct(seg.startTime),
                    width:       pct(seg.endTime - seg.startTime),
                    background:  `${color}28`,
                    borderColor: `${color}88`,
                  }}
                  title={seg.text}
                  onClick={e => { e.stopPropagation(); onSeek?.(seg.startTime); }}
                >
                  <span className="timeline__segment-speaker" style={{ color }}>
                    {speaker}
                  </span>
                  <span className="timeline__segment-text">{seg.text}</span>
                </div>
              );
            })}
          </div>

          {/* Playhead */}
          {duration > 0 && (
            <div className="timeline__playhead" style={{ left: pct(currentTime) }}>
              <div className="timeline__playhead-head" />
              <div className="timeline__playhead-line" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Timeline;
