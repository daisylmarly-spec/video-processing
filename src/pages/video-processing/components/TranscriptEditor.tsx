import React, { useState, useCallback, useRef } from 'react';
import { Button, Input, Tag, Tooltip, Empty, Typography, Space } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  CheckOutlined,
  CloseOutlined,
  SearchOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import './TranscriptEditor.scss';

const { Text } = Typography;

export interface TranscriptSegment {
  id: string;
  startTime: number;  // seconds
  endTime: number;
  text: string;
  translation?: string;
}

interface TranscriptEditorProps {
  segments: TranscriptSegment[];
  translating?: boolean;
  currentTime?: number;
  onChange?: (segments: TranscriptSegment[]) => void;
  onSegmentClick?: (startTime: number) => void;
}

function formatTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
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
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editText, setEditText]     = useState('');
  const [searchText, setSearchText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  // timecode inline editing: 'start' | 'end' per segment
  const [editingTc, setEditingTc]   = useState<{ id: string; field: 'start' | 'end' } | null>(null);
  const [editTcValue, setEditTcValue] = useState('');
  const activeRef = useRef<HTMLDivElement>(null);

  // Active segment based on currentTime
  const activeSegment = segments.find(
    s => currentTime >= s.startTime && currentTime <= s.endTime
  );

  // Scroll active segment into view
  React.useEffect(() => {
    if (autoScroll && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeSegment?.id, autoScroll]);

  const filteredSegments = searchText
    ? segments.filter(s => s.text.includes(searchText) || s.translation?.includes(searchText))
    : segments;

  const handleStartEdit = useCallback((seg: TranscriptSegment) => {
    setEditingId(seg.id);
    setEditText(seg.text);
  }, []);

  const handleSaveEdit = useCallback((id: string) => {
    const updated = segments.map(s =>
      s.id === id ? { ...s, text: editText } : s
    );
    onChange?.(updated);
    setEditingId(null);
  }, [segments, editText, onChange]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText('');
  }, []);

  const handleDelete = useCallback((id: string) => {
    onChange?.(segments.filter(s => s.id !== id));
  }, [segments, onChange]);

  const handleStartTcEdit = useCallback((seg: TranscriptSegment, field: 'start' | 'end', e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTc({ id: seg.id, field });
    setEditTcValue(formatTimecode(field === 'start' ? seg.startTime : seg.endTime));
  }, []);

  const handleSaveTcEdit = useCallback((seg: TranscriptSegment) => {
    if (!editingTc) return;
    const parsed = parseTimecode(editTcValue);
    if (isNaN(parsed) || parsed < 0) { setEditingTc(null); return; }
    const updated = segments.map(s => {
      if (s.id !== seg.id) return s;
      if (editingTc.field === 'start') return { ...s, startTime: Math.min(parsed, s.endTime - 0.1) };
      return { ...s, endTime: Math.max(parsed, s.startTime + 0.1) };
    });
    onChange?.(updated);
    setEditingTc(null);
  }, [editingTc, editTcValue, segments, onChange]);

  const handleAddAfter = useCallback((index: number) => {
    const prev = segments[index];
    const next = segments[index + 1];
    const startTime = prev ? prev.endTime : 0;
    const endTime = next ? Math.min(next.startTime, startTime + 3) : startTime + 3;
    const newSeg: TranscriptSegment = {
      id: `seg_${Date.now()}`,
      startTime,
      endTime,
      text: '',
    };
    const updated = [
      ...segments.slice(0, index + 1),
      newSeg,
      ...segments.slice(index + 1),
    ];
    onChange?.(updated);
    setTimeout(() => {
      setEditingId(newSeg.id);
      setEditText('');
    }, 50);
  }, [segments, onChange]);

  return (
    <div className="transcript-editor">
      {/* Header */}
      <div className="transcript-editor__header">
        <Text className="transcript-editor__title">字幕编辑</Text>
        <Space size={6}>
          <Tooltip title={autoScroll ? '关闭自动滚动' : '开启自动滚动'}>
            <Button
              type={autoScroll ? 'primary' : 'text'}
              size="small"
              icon={<SyncOutlined />}
              onClick={() => setAutoScroll(!autoScroll)}
              ghost={autoScroll}
            />
          </Tooltip>
          <Tag className="transcript-editor__count">{segments.length} 条</Tag>
        </Space>
      </div>

      {/* Translation in progress banner */}
      {translating && (
        <div className="transcript-editor__translating-bar">
          <SyncOutlined spin style={{ marginRight: 6 }} />
          正在翻译字幕，请稍候…
        </div>
      )}

      {/* Search */}
      <div className="transcript-editor__search">
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索字幕内容"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          allowClear
          size="small"
        />
      </div>

      {/* Segment list */}
      <div className="transcript-editor__list">
        {filteredSegments.length === 0 ? (
          <Empty
            description={searchText ? '没有匹配的字幕' : '暂无字幕内容'}
            className="transcript-editor__empty"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          filteredSegments.map((seg, idx) => {
            const isActive  = seg.id === activeSegment?.id;
            const isEditing = seg.id === editingId;

            return (
              <div
                key={seg.id}
                ref={isActive ? activeRef : undefined}
                className={`ts-segment ${isActive ? 'ts-segment--active' : ''} ${isEditing ? 'ts-segment--editing' : ''}`}
              >
                {/* Timecode */}
                <div className="ts-segment__time">
                  {editingTc?.id === seg.id && editingTc.field === 'start' ? (
                    <Input
                      size="small"
                      value={editTcValue}
                      onChange={e => setEditTcValue(e.target.value)}
                      onBlur={() => handleSaveTcEdit(seg)}
                      onPressEnter={() => handleSaveTcEdit(seg)}
                      onKeyDown={e => e.key === 'Escape' && setEditingTc(null)}
                      autoFocus
                      className="ts-segment__tc-input"
                    />
                  ) : (
                    <span
                      onClick={() => onSegmentClick?.(seg.startTime)}
                      onDoubleClick={e => handleStartTcEdit(seg, 'start', e)}
                      title="单击跳转 / 双击编辑"
                    >
                      {formatTimecode(seg.startTime)}
                    </span>
                  )}
                  <span className="ts-segment__time-arrow">→</span>
                  {editingTc?.id === seg.id && editingTc.field === 'end' ? (
                    <Input
                      size="small"
                      value={editTcValue}
                      onChange={e => setEditTcValue(e.target.value)}
                      onBlur={() => handleSaveTcEdit(seg)}
                      onPressEnter={() => handleSaveTcEdit(seg)}
                      onKeyDown={e => e.key === 'Escape' && setEditingTc(null)}
                      autoFocus
                      className="ts-segment__tc-input"
                    />
                  ) : (
                    <span
                      onDoubleClick={e => handleStartTcEdit(seg, 'end', e)}
                      title="双击编辑结束时间"
                    >
                      {formatTimecode(seg.endTime)}
                    </span>
                  )}
                </div>

                {/* Text */}
                <div className="ts-segment__body">
                  {isEditing ? (
                    <div className="ts-segment__edit">
                      <Input.TextArea
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        autoFocus
                        onPressEnter={e => {
                          if (!e.shiftKey) { e.preventDefault(); handleSaveEdit(seg.id); }
                        }}
                      />
                      <Space size={4} className="ts-segment__edit-actions">
                        <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleSaveEdit(seg.id)}>确认</Button>
                        <Button size="small" icon={<CloseOutlined />} onClick={handleCancelEdit}>取消</Button>
                      </Space>
                    </div>
                  ) : (
                    <>
                      <p
                        className="ts-segment__text"
                        onClick={() => onSegmentClick?.(seg.startTime)}
                      >
                        {seg.text || <span className="ts-segment__placeholder">（空白字幕）</span>}
                      </p>
                      {seg.translation && (
                        <p className="ts-segment__translation">{seg.translation}</p>
                      )}
                    </>
                  )}
                </div>

                {/* Actions (visible on hover) */}
                {!isEditing && (
                  <div className="ts-segment__actions">
                    <Tooltip title="编辑">
                      <button className="ts-action-btn" onClick={() => handleStartEdit(seg)}>
                        <EditOutlined />
                      </button>
                    </Tooltip>
                    <Tooltip title="在此后插入">
                      <button className="ts-action-btn" onClick={() => handleAddAfter(idx)}>
                        <PlusOutlined />
                      </button>
                    </Tooltip>
                    <Tooltip title="删除">
                      <button
                        className="ts-action-btn ts-action-btn--danger"
                        onClick={() => handleDelete(seg.id)}
                      >
                        <DeleteOutlined />
                      </button>
                    </Tooltip>
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
