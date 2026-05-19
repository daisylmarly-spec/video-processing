import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, ConfigProvider, Spin, Button, Space } from 'antd';
import type { ThemeConfig } from 'antd';
import { AudioOutlined, WarningOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import Toolbar, { type ProcessStatus } from './components/Toolbar';
import VideoPlayer from './components/VideoPlayer';
import TranscriptEditor, { type TranscriptSegment } from './components/TranscriptEditor';
import Timeline from './components/Timeline';
import { SettingsModal, loadSettings } from './components/SettingsModal';
import { getVideo } from '../../utils/videoDB';
import { transcribeAudio } from '../../utils/transcribe';
import { translateSegments } from '../../utils/translate';
import './VideoProcessingPage.scss';

// ── Ant Design dark theme token override ─────────────────────────────────────
const antdTheme: ThemeConfig = {
  token: {
    colorPrimary:        '#1677FF',
    colorBgBase:         '#0D0E12',
    colorBgContainer:    '#16181F',
    colorBgElevated:     '#1E2029',
    colorBorder:         '#2A2D3A',
    colorText:           '#F0F1F5',
    colorTextSecondary:  '#9098A8',
    colorTextDisabled:   '#4A5060',
    borderRadius:        6,
    fontSize:            13,
    fontFamily:          `-apple-system, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif`,
  },
  components: {
    Button: {
      colorBgContainer:  '#1E2029',
      defaultBorderColor: '#2A2D3A',
      defaultColor:      '#9098A8',
    },
    Slider: { railBg: 'rgba(255,255,255,0.12)', railHoverBg: 'rgba(255,255,255,0.2)' },
    Input:  { colorBgContainer: '#1E2029' },
  },
};

// ── Mock data (demo mode when no video is uploaded) ───────────────────────────
const MOCK_SEGMENTS: TranscriptSegment[] = [
  { id: 's1', startTime: 2,  endTime: 5.5,  text: '欢迎来到本次课程，今天我们来学习视频资源处理的基本流程。', translation: 'Welcome to this course. Today we will learn the basic workflow of video resource processing.' },
  { id: 's2', startTime: 6,  endTime: 10,   text: '首先我们需要了解什么是视频转码，以及为什么要进行转码处理。', translation: 'First, we need to understand what video transcoding is and why it is necessary.' },
  { id: 's3', startTime: 11, endTime: 15.5, text: '视频转码是指将一种视频格式转换为另一种格式的过程。',       translation: 'Video transcoding refers to the process of converting one video format to another.' },
  { id: 's4', startTime: 16, endTime: 21,   text: '这个过程中涉及到编解码器、分辨率、帧率和比特率等关键参数。', translation: 'This process involves key parameters such as codecs, resolution, frame rate, and bitrate.' },
  { id: 's5', startTime: 22, endTime: 26,   text: '不同平台对视频格式有不同的要求，因此转码处理非常重要。',   translation: 'Different platforms have different requirements for video formats, making transcoding essential.' },
  { id: 's6', startTime: 27, endTime: 31.5, text: '接下来我们来看一个具体的视频处理示例。',                   translation: 'Next, let us look at a concrete example of video processing.' },
  { id: 's7', startTime: 33, endTime: 38,   text: '在实际工作中，我们会用到各种视频处理工具和平台。',         translation: 'In real-world work, we use various video processing tools and platforms.' },
  { id: 's8', startTime: 39, endTime: 44,   text: '本平台提供了完整的视频资源管理和处理功能，让我们一起来探索。', translation: 'This platform provides comprehensive video resource management and processing features. Let us explore together.' },
];

// ── Transcript storage helpers ────────────────────────────────────────────────
const DEMO_KEY = 'vp_transcript_demo';

function loadTranscript(key: string, fallback: TranscriptSegment[]): TranscriptSegment[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as TranscriptSegment[];
  } catch {}
  return fallback;
}

function saveTranscript(key: string, segs: TranscriptSegment[]): void {
  try { localStorage.setItem(key, JSON.stringify(segs)); } catch {}
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface SeekTarget { time: number; seq: number; }

type TxStatus = 'idle' | 'ready' | 'transcribing' | 'translating' | 'done' | 'error';

const MAX_HISTORY = 50;

// ── Page inner ────────────────────────────────────────────────────────────────
const VideoProcessingPageInner: React.FC = () => {
  // Video
  const [videoId, setVideoId]     = useState<string | null>(null);
  const [videoUrl, setVideoUrl]   = useState<string | undefined>(undefined);
  const [videoName, setVideoName] = useState('公开课_第三章_视频处理技术.mp4');

  // Transcription / translation pipeline
  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [txError,  setTxError]  = useState<string | null>(null);

  // UI
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Playback
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDuration]    = useState(0);
  const [seekTarget,  setSeekTarget]  = useState<SeekTarget | undefined>(undefined);

  // Segments + history
  const [segments, setSegments] = useState<TranscriptSegment[]>(() =>
    loadTranscript(DEMO_KEY, MOCK_SEGMENTS)
  );
  const [, setCanUndo] = useState(false);
  const [, setCanRedo] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const historyRef       = useRef<TranscriptSegment[][]>([loadTranscript(DEMO_KEY, MOCK_SEGMENTS)]);
  const historyIndexRef  = useRef(0);
  const seekSeqRef       = useRef(0);
  const autoSaveTimer    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const transcriptKeyRef = useRef(DEMO_KEY);
  const videoUrlRef      = useRef<string | undefined>(undefined);
  const autoStartedRef   = useRef(false);

  const { message: msg } = App.useApp();
  const navigate = useNavigate();

  // ── Load video from IndexedDB on mount ───────────────────────────────────
  useEffect(() => {
    const id   = localStorage.getItem('vp_current_video_id');
    const name = localStorage.getItem('vp_current_video_name');
    if (!id) return; // demo mode

    setVideoId(id);
    if (name) setVideoName(name);
    transcriptKeyRef.current = `vp_transcript_${id}`;

    const existing = loadTranscript(`vp_transcript_${id}`, []);
    if (existing.length > 0) {
      setSegments(existing);
      historyRef.current      = [existing];
      historyIndexRef.current = 0;
      setTxStatus('done');
    } else {
      setSegments([]);
      historyRef.current      = [[]];
      historyIndexRef.current = 0;
      setTxStatus('ready');
    }

    getVideo(id)
      .then(record => {
        if (!record) return;
        const url = URL.createObjectURL(record.blob);
        videoUrlRef.current = url;
        setVideoUrl(url);
      })
      .catch(() => msg.error('视频文件加载失败'));

    return () => {
      if (videoUrlRef.current) {
        URL.revokeObjectURL(videoUrlRef.current);
        videoUrlRef.current = undefined;
      }
    };
  }, []);

  // ── Auto-start transcription when video is ready + credentials configured ─
  useEffect(() => {
    if (txStatus !== 'ready' || autoStartedRef.current) return;
    const s = loadSettings();
    if (s.xfAppId && s.xfApiKey && s.xfApiSecret) {
      autoStartedRef.current = true;
      handleTranscribe();
    }
  }, [txStatus, handleTranscribe]);

  // ── Auto-save ────────────────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(
      () => saveTranscript(transcriptKeyRef.current, segments), 800
    );
    return () => clearTimeout(autoSaveTimer.current);
  }, [segments]);

  // ── Undo / Redo ──────────────────────────────────────────────────────────
  const pushHistory = useCallback((segs: TranscriptSegment[]) => {
    const trimmed = historyRef.current.slice(0, historyIndexRef.current + 1);
    trimmed.push(segs);
    if (trimmed.length > MAX_HISTORY) trimmed.shift();
    historyRef.current      = trimmed;
    historyIndexRef.current = trimmed.length - 1;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  }, []);

  const handleSegmentsChange = useCallback((segs: TranscriptSegment[]) => {
    setSegments(segs);
    pushHistory(segs);
    setIsDirty(true);
  }, [pushHistory]);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    setSegments(historyRef.current[historyIndexRef.current]);
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(true);
  }, []);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    setSegments(historyRef.current[historyIndexRef.current]);
    setCanUndo(true);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  // Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo, handleRedo]);

  // ── Seek ──────────────────────────────────────────────────────────────────
  const handleSeek = useCallback((t: number) => {
    seekSeqRef.current += 1;
    setSeekTarget({ time: t, seq: seekSeqRef.current });
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleExport = useCallback((format: string) => {
    msg.info(`正在导出 ${format.toUpperCase()} 格式...`);
  }, [msg]);

  // ── Transcription + Translation pipeline ─────────────────────────────────
  const handleTranscribe = useCallback(async () => {
    const settings = loadSettings();
    if (!settings.xfAppId || !settings.xfApiKey || !settings.xfApiSecret) {
      setSettingsOpen(true);
      return;
    }
    if (!videoId) return;

    const record = await getVideo(videoId).catch(() => null);
    if (!record) { msg.error('视频文件不存在，请重新上传'); return; }

    setTxError(null);
    setTxStatus('transcribing');

    try {
      const segs = await transcribeAudio(
        record.blob, record.name,
        settings.xfAppId, settings.xfApiKey, settings.xfApiSecret,
        settings.sourceLang,
      );

      setSegments(segs);
      historyRef.current      = [segs];
      historyIndexRef.current = 0;
      setCanUndo(false);
      setCanRedo(false);

      setTxStatus('translating');
      const translated = await translateSegments(
        segs,
        settings.xfAppId, settings.xfApiKey, settings.xfApiSecret,
        settings.sourceLang, settings.targetLang,
      );

      setSegments(translated);
      historyRef.current      = [translated];
      historyIndexRef.current = 0;
      saveTranscript(transcriptKeyRef.current, translated);
      setTxStatus('done');
      setIsDirty(false);
      msg.success('语音识别与翻译完成');
    } catch (err) {
      const msg2 = err instanceof Error ? err.message : String(err);
      setTxStatus('error');
      setTxError(msg2);
      msg.error('识别失败，请检查 API 配置和网络');
    }
  }, [videoId, msg]);

  // ── Active segment (for subtitle overlay) ────────────────────────────────
  const activeSegment = useMemo(() =>
    segments.find(s => currentTime >= s.startTime && currentTime <= s.endTime),
    [segments, currentTime],
  );

  // ── Derived ──────────────────────────────────────────────────────────────
  const toolbarStatus: ProcessStatus =
    txStatus === 'done'                              ? 'done'       :
    txStatus === 'error'                             ? 'error'      :
    txStatus === 'transcribing' || txStatus === 'translating' ? 'processing' :
    'idle';

  const showTranscriptEditor = txStatus === 'idle' || txStatus === 'done' || txStatus === 'translating';

  return (
    <div className="vp-page">
      <Toolbar
        fileName={videoName}
        status={toolbarStatus}
        isDirty={isDirty}
        onBack={() => navigate('/')}
        onExport={handleExport}
        onSettings={() => setSettingsOpen(true)}
        onTranscribe={videoId && txStatus !== 'transcribing' && txStatus !== 'translating' ? handleTranscribe : undefined}
        transcribeRunning={txStatus === 'transcribing' || txStatus === 'translating'}
        onClearStorage={() => {
          localStorage.removeItem(transcriptKeyRef.current);
          const initial = videoId ? [] : MOCK_SEGMENTS;
          setSegments(initial);
          historyRef.current      = [initial];
          historyIndexRef.current = 0;
          setCanUndo(false);
          setCanRedo(false);
          setIsDirty(false);
          if (videoId) setTxStatus('ready');
          msg.info('已清除本地缓存');
        }}
      />

      <div className="vp-page__body">
        {/* Left: transcript */}
        <div className="vp-page__sidebar">
          {txStatus === 'ready' && (
            <div className="vp-page__tx-prompt">
              <AudioOutlined className="vp-page__tx-icon" />
              <p className="vp-page__tx-title">视频已就绪</p>
              <p className="vp-page__tx-desc">点击下方按钮开始语音识别，自动生成字幕和翻译</p>
              <Button type="primary" icon={<AudioOutlined />} onClick={handleTranscribe}>
                开始识别
              </Button>
            </div>
          )}

          {txStatus === 'transcribing' && (
            <div className="vp-page__tx-loading">
              <Spin size="large" />
              <p className="vp-page__tx-step">正在识别语音…</p>
              <p className="vp-page__tx-hint">调用讯飞语音转写，请稍候（约 1–5 分钟）</p>
            </div>
          )}

          {txStatus === 'error' && (
            <div className="vp-page__tx-error">
              <WarningOutlined className="vp-page__tx-error-icon" />
              <p className="vp-page__tx-error-title">识别失败</p>
              {txError && <p className="vp-page__tx-error-msg">{txError}</p>}
              <Button type="primary" icon={<ReloadOutlined />} onClick={handleTranscribe}>
                重试
              </Button>
            </div>
          )}

          {showTranscriptEditor && (
            <TranscriptEditor
              segments={segments}
              currentTime={currentTime}
              translating={txStatus === 'translating'}
              onChange={handleSegmentsChange}
              onSegmentClick={handleSeek}
            />
          )}
        </div>

        {/* Right: video + timeline */}
        <div className="vp-page__main">
          <div className="vp-page__video-area">
            <VideoPlayer
              src={videoUrl}
              seekTo={seekTarget}
              onTimeUpdate={setCurrentTime}
              onDurationChange={setDuration}
              subtitle={activeSegment ? {
                text:    activeSegment.translation || activeSegment.text,
                speaker: activeSegment.speaker,
              } : undefined}
            />
          </div>
          <Timeline
            duration={duration}
            currentTime={currentTime}
            segments={segments}
            onSeek={handleSeek}
          />
        </div>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
};

// ── Wrap with providers ───────────────────────────────────────────────────────
const VideoProcessingPage: React.FC = () => (
  <ConfigProvider theme={antdTheme}>
    <App>
      <VideoProcessingPageInner />
    </App>
  </ConfigProvider>
);

export default VideoProcessingPage;
