import React, { useState, useCallback, useRef } from 'react';
import { Input, Button, Space } from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined,
  CheckOutlined, CloseOutlined,
} from '@ant-design/icons';
import './TranscriptEditor.scss';

export interface TranscriptSegment {
  id:          string;
  startTime:   number;
  endTime:     number;
  text:        string;
  translation?: string;
  speaker?:    string;
}

interface TranscriptEditorProps {
  segments:        TranscriptSegment[];
  translating?:    boolean;
  currentTime?:    number;
  onChange?:       (segments: TranscriptSegment[]) => void;
  onSegmentClick?: (startTime: number) => void;
}

export const SPEAKER_COLORS = [
  '#1677ff', '#3dbf9a', '#fa8c16', '#722ed1', '#eb2f96', '#13c2c2',
];

export function getSpeakerColor(speaker?: string): string {
  if (!speaker) return SPEAKER_COLORS[0];
  const num = parseInt(speaker.replace(/\D/g, '') || '1', 10);
  return SPEAKER_COLORS[(num - 1) % SPEAKER_COLORS.length];
}

function formatSegTime(s: number): string {
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
}

function parseTimecode(tc: string): number {
  const match = tc.match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) return 0;
  const [, h, m, s, ms] = match.map(Number);
  return h * 3600 + m * 60 + s + ms / 1000;
}

const TranscriptEditor: React.FC<TranscriptEditorProps> = ({
  segments,
  currentTime = 0,
  translating = false,
  onChange,
  onSegmentClick,
}) => {
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editText,    setEditText]    = useState('');
  const [editField,   setEditField]   = useState<'text' | 'translation'>('text');
  const activeRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll]   = useState(true);

  const activeSegment = segments.find(
    s => currentTime >= s.startTime && currentTime <= s.endTime,
  );

  React.useEffect(() => {
    if (autoScroll && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeSegment?.id, autoScroll]);

  const handleStartEdit = useCallback((seg: TranscriptSegment, field: 'text' | 'translation') => {
    setEditingId(seg.id);
    setEditField(field);
    setEditText(field === 'text' ? seg.text : (seg.translation ?? ''));
  }, []);

  const handleSaveEdit = useCallback((id: string) => {
    const updated = segments.map(s => {
      if (s.id !== id) return s;
      return editField === 'text' ? { ...s, text: editText } : { ...s, translation: editText };
    });
    onChange?.(updated);
    setEditingId(null);
  }, [segments, editText, editField, onChange]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText('');
  }, []);

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.(segments.filter(s => s.id !== id));
  }, [segments, onChange]);

  const handleAddAfter = useCallback((index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const prev      = segments[index];
    const next      = segments[index + 1];
    const startTime = prev ? prev.endTime : 0;
    const endTime   = next ? Math.min(next.startTime, startTime + 3) : startTime + 3;
    const newSeg: TranscriptSegment = { id: `seg_${Date.now()}`, startTime, endTime, text: '' };
    const updated = [
      ...segments.slice(0, index + 1),
      newSeg,
      ...segments.slice(index + 1),
    ];
    onChange?.(updated);
    setTimeout(() => { setEditingId(newSeg.id); setEditField('text'); setEditText(''); }, 50);
  }, [segments, onChange]);

  return (
    <div className="transcript-editor">
      {/* Header */}
      <div className="transcript-editor__header">
        <span className="transcript-editor__title">转写文本与翻译</span>
        <div className="transcript-editor__header-right">
          {translating && (
            <span className="transcript-editor__translating">翻译中…</span>
          )}
          <span className="transcript-editor__count">共 {segments.length} 个段落</span>
        </div>
      </div>

      {/* Segment list */}
      <div className="transcript-editor__list">
        {segments.length === 0 ? (
          <div className="transcript-editor__empty">暂无字幕，请点击「识别字幕」</div>
        ) : (
          segments.map((seg, idx) => {
            const isActive  = seg.id === activeSegment?.id;
            const isEditing = seg.id === editingId;
            const color     = getSpeakerColor(seg.speaker);
            const speaker   = seg.speaker || '讲话人 1';

            return (
              <div
                key={seg.id}
                ref={isActive ? activeRef : undefined}
                className={`te-card ${isActive ? 'te-card--active' : ''} ${isEditing ? 'te-card--editing' : ''}`}
                onClick={() => !isEditing && onSegmentClick?.(seg.startTime)}
              >
                {/* Card header: speaker + time */}
                <div className="te-card__header">
                  <div className="te-card__speaker">
                    <span className="te-card__dot" style={{ background: color }} />
                    <span className="te-card__speaker-name">{speaker}</span>
                  </div>
                  <span className="te-card__time">
                    {formatSegTime(seg.startTime)} → {formatSegTime(seg.endTime)}
                  </span>
                </div>

                {/* Original text */}
                <div className="te-card__section">
                  <span className="te-card__label">原文</span>
                  {isEditing && editField === 'text' ? (
                    <div className="te-card__edit-wrap">
                      <Input.TextArea
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        autoSize={{ minRows: 1, maxRows: 5 }}
                        autoFocus
                        onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); handleSaveEdit(seg.id); } }}
                        onClick={e => e.stopPropagation()}
                      />
                      <Space size={4}>
                        <Button size="small" type="primary" icon={<CheckOutlined />} onClick={e => { e.stopPropagation(); handleSaveEdit(seg.id); }}>确认</Button>
                        <Button size="small" icon={<CloseOutlined />} onClick={e => { e.stopPropagation(); handleCancelEdit(); }}>取消</Button>
                      </Space>
                    </div>
                  ) : (
                    <p
                      className="te-card__text"
                      onDoubleClick={e => { e.stopPropagation(); handleStartEdit(seg, 'text'); }}
                      title="双击编辑"
                    >
                      {seg.text || <span className="te-card__placeholder">（空白）</span>}
                    </p>
                  )}
                </div>

                {/* Translation */}
                {(seg.translation || translating) && (
                  <div className="te-card__section">
                    <div className="te-card__trans-header">
                      <span className="te-card__label">译文</span>
                      {!isEditing && (
                        <button
                          className="te-card__edit-btn"
                          onClick={e => { e.stopPropagation(); handleStartEdit(seg, 'translation'); }}
                          title="编辑译文"
                        >
                          <EditOutlined />
                        </button>
                      )}
                    </div>
                    {isEditing && editField === 'translation' ? (
                      <div className="te-card__edit-wrap">
                        <Input.TextArea
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          autoSize={{ minRows: 1, maxRows: 5 }}
                          autoFocus
                          onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); handleSaveEdit(seg.id); } }}
                          onClick={e => e.stopPropagation()}
                        />
                        <Space size={4}>
                          <Button size="small" type="primary" icon={<CheckOutlined />} onClick={e => { e.stopPropagation(); handleSaveEdit(seg.id); }}>确认</Button>
                          <Button size="small" icon={<CloseOutlined />} onClick={e => { e.stopPropagation(); handleCancelEdit(); }}>取消</Button>
                        </Space>
                      </div>
                    ) : (
                      <p className="te-card__translation">
                        {seg.translation || <span className="te-card__placeholder">翻译中…</span>}
                      </p>
                    )}
                  </div>
                )}

                {/* Hover actions */}
                {!isEditing && (
                  <div className="te-card__actions">
                    <button className="te-card__action-btn" title="在此后插入" onClick={e => handleAddAfter(idx, e)}>
                      <PlusOutlined />
                    </button>
                    <button className="te-card__action-btn te-card__action-btn--danger" title="删除" onClick={e => handleDelete(seg.id, e)}>
                      <DeleteOutlined />
                    </button>
                  </div>
                )}

                {/* Playing badge */}
                {isActive && (
                  <div className="te-card__playing">
                    <span className="te-card__playing-dot" />
                    正在播放
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default TranscriptEditor;
