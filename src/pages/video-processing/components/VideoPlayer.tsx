import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Slider, Tooltip, Space } from 'antd';
import {
  PlayCircleFilled,
  PauseCircleFilled,
  SoundOutlined,
  MutedOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
} from '@ant-design/icons';
import './VideoPlayer.scss';

interface SeekTarget { time: number; seq: number; }

interface VideoPlayerProps {
  src?: string;
  seekTo?: SeekTarget;
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  seekTo,
  onTimeUpdate,
  onDurationChange,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying]         = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration]       = useState(0);
  const [volume, setVolume]           = useState(80);
  const [muted, setMuted]             = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // seq-based seek: always fires even when time is the same
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

  const handlePlaybackRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
  }, []);

  const handleSkip = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(duration, video.currentTime + seconds));
  }, [duration]);

  const handleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!isFullscreen) {
      el.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 2500);
  }, [playing]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); handlePlayPause(); }
      if (e.code === 'ArrowLeft') handleSkip(-5);
      if (e.code === 'ArrowRight') handleSkip(5);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlePlayPause, handleSkip]);

  return (
    <div
      className={`video-player ${showControls ? 'video-player--controls-visible' : ''}`}
      ref={containerRef}
      onMouseMove={resetHideTimer}
      onMouseEnter={() => setShowControls(true)}
    >
      {src ? (
        <video
          ref={videoRef}
          src={src}
          className="video-player__video"
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={handleDurationChange}
          onEnded={() => setPlaying(false)}
          onClick={handlePlayPause}
        />
      ) : (
        <div className="video-player__placeholder">
          <div className="video-player__placeholder-icon">▶</div>
          <p>暂无视频资源</p>
        </div>
      )}

      {/* Controls overlay */}
      <div className="video-player__controls">
        {/* Progress bar */}
        <div className="video-player__progress">
          <Slider
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            tooltip={{
              formatter: (v) => formatTime(v ?? 0),
            }}
            className="video-player__seek-slider"
          />
        </div>

        {/* Control row */}
        <div className="video-player__control-row">
          <div className="video-player__control-left">
            <Space size={4}>
              <button className="vp-btn" onClick={() => handleSkip(-5)} title="后退5秒">
                <StepBackwardOutlined />
              </button>
              <button className="vp-btn vp-btn--play" onClick={handlePlayPause}>
                {playing ? <PauseCircleFilled /> : <PlayCircleFilled />}
              </button>
              <button className="vp-btn" onClick={() => handleSkip(5)} title="前进5秒">
                <StepForwardOutlined />
              </button>
            </Space>

            {/* Volume */}
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
                tooltip={{ formatter: (v) => `${v}%` }}
              />
            </div>

            <span className="video-player__time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="video-player__control-right">
            {/* Playback rate */}
            <div className="video-player__rate-group">
              {PLAYBACK_RATES.map(rate => (
                <button
                  key={rate}
                  className={`vp-rate-btn ${playbackRate === rate ? 'vp-rate-btn--active' : ''}`}
                  onClick={() => handlePlaybackRate(rate)}
                >
                  {rate}x
                </button>
              ))}
            </div>

            <Tooltip title={isFullscreen ? '退出全屏' : '全屏'}>
              <button className="vp-btn" onClick={handleFullscreen}>
                {isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
