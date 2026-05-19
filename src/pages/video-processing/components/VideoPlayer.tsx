import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Slider } from 'antd';
import {
  PlayCircleFilled,
  PauseCircleFilled,
  SoundOutlined,
  MutedOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
} from '@ant-design/icons';
import './VideoPlayer.scss';

interface SeekTarget { time: number; seq: number; }

interface VideoPlayerProps {
  src?:              string;
  seekTo?:           SeekTarget;
  subtitle?:         { text: string; speaker?: string };
  onTimeUpdate?:     (time: number) => void;
  onDurationChange?: (duration: number) => void;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  seekTo,
  subtitle,
  onTimeUpdate,
  onDurationChange,
}) => {
  const videoRef     = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [playing,      setPlaying]      = useState(false);
  const [currentTime,  setCurrentTime]  = useState(0);
  const [duration,     setDuration]     = useState(0);
  const [volume,       setVolume]       = useState(80);
  const [muted,        setMuted]        = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (videoRef.current && seekTo !== undefined) {
      videoRef.current.currentTime = seekTo.time;
      setCurrentTime(seekTo.time);
    }
  }, [seekTo?.seq]);

  const handlePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) { video.pause(); } else { video.play(); }
    setPlaying(!playing);
  }, [playing]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    onTimeUpdate?.(video.currentTime);
  }, [onTimeUpdate]);

  const handleDurationChange = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration);
    onDurationChange?.(video.duration);
  }, [onDurationChange]);

  const handleSeek = useCallback((value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = value;
    setCurrentTime(value);
    onTimeUpdate?.(value);
  }, [onTimeUpdate]);

  const handleVolumeChange = useCallback((value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = value / 100;
    setVolume(value);
    setMuted(value === 0);
  }, []);

  const handleMuteToggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !muted;
    setMuted(!muted);
  }, [muted]);

  const handleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!isFullscreen) { el.requestFullscreen?.(); }
    else { document.exitFullscreen?.(); }
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); handlePlayPause(); }
      if (e.code === 'ArrowLeft') {
        const v = videoRef.current; if (v) v.currentTime = Math.max(0, v.currentTime - 5);
      }
      if (e.code === 'ArrowRight') {
        const v = videoRef.current; if (v) v.currentTime = Math.min(duration, v.currentTime + 5);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlePlayPause, duration]);

  return (
    <div className="video-player" ref={containerRef}>
      {/* Video */}
      <div className="video-player__video-wrap" onClick={handlePlayPause}>
        {src ? (
          <video
            ref={videoRef}
            src={src}
            className="video-player__video"
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleDurationChange}
            onEnded={() => setPlaying(false)}
          />
        ) : (
          <div className="video-player__placeholder">
            <div className="video-player__placeholder-icon">▶</div>
            <p>暂无视频资源</p>
          </div>
        )}

        {/* Subtitle overlay */}
        {subtitle?.text && (
          <div className="video-player__subtitle">
            <p className="video-player__subtitle-text">{subtitle.text}</p>
            {subtitle.speaker && (
              <span className="video-player__subtitle-speaker">{subtitle.speaker}</span>
            )}
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className="video-player__controls">
        {/* Progress */}
        <div className="video-player__progress">
          <Slider
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            tooltip={{ formatter: v => formatTime(v ?? 0) }}
            className="video-player__seek-slider"
          />
        </div>

        {/* Control row */}
        <div className="video-player__control-row">
          <div className="video-player__ctrl-left">
            <button className="vp-btn vp-btn--play" onClick={handlePlayPause}>
              {playing ? <PauseCircleFilled /> : <PlayCircleFilled />}
            </button>
            <span className="video-player__time">
              {formatTime(currentTime)}
            </span>
          </div>

          <div className="video-player__ctrl-right">
            <span className="video-player__time video-player__time--total">
              {formatTime(duration)}
            </span>
            <div className="video-player__volume">
              <button className="vp-btn" onClick={handleMuteToggle}>
                {muted || volume === 0 ? <MutedOutlined /> : <SoundOutlined />}
              </button>
              <Slider
                min={0}
                max={100}
                value={muted ? 0 : volume}
                onChange={handleVolumeChange}
                className="video-player__volume-slider"
                tooltip={{ formatter: v => `${v}%` }}
              />
            </div>
            <button className="vp-btn" onClick={handleFullscreen}>
              {isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
