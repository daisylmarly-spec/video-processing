import React from 'react';
import { Button, Space, Tag, Tooltip, Dropdown, Popconfirm } from 'antd';
import {
  LeftOutlined,
  ExportOutlined,
  DownOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  DeleteOutlined,
  AudioOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import './Toolbar.scss';

export type ProcessStatus = 'idle' | 'processing' | 'done' | 'error';

interface ToolbarProps {
  fileName?:         string;
  status?:           ProcessStatus;
  isDirty?:          boolean;
  onBack?:           () => void;
  onExport?:         (format: string) => void;
  onClearStorage?:   () => void;
  onTranscribe?:     () => void;
  transcribeRunning?: boolean;
}

const STATUS_CONFIG: Record<ProcessStatus, { label: string; color: string; icon?: React.ReactNode }> = {
  idle:       { label: '未处理',  color: 'default' },
  processing: { label: '处理中',  color: 'processing', icon: <LoadingOutlined /> },
  done:       { label: '已完成',  color: 'success',    icon: <CheckCircleOutlined /> },
  error:      { label: '处理失败', color: 'error' },
};

const exportMenuItems: MenuProps['items'] = [
  { key: 'srt', label: '导出 SRT 字幕' },
  { key: 'vtt', label: '导出 VTT 字幕' },
  { key: 'txt', label: '导出纯文本' },
  { type: 'divider' },
  { key: 'mp4', label: '导出处理后视频' },
];

const Toolbar: React.FC<ToolbarProps> = ({
  fileName           = '未命名资源',
  status             = 'idle',
  isDirty            = false,
  onBack,
  onExport,
  onClearStorage,
  onTranscribe,
  transcribeRunning  = false,
}) => {
  const statusCfg = STATUS_CONFIG[status];

  return (
    <div className="toolbar">
      {/* Left */}
      <div className="toolbar__left">
        {onBack && (
          <Tooltip title="返回">
            <button className="toolbar__back-btn" onClick={onBack}>
              <LeftOutlined />
            </button>
          </Tooltip>
        )}
        <span className="toolbar__filename">
          {isDirty && <span className="toolbar__dirty-dot" title="有未保存的更改" />}
          {fileName}
        </span>
        <Tag color={statusCfg.color} icon={statusCfg.icon} className="toolbar__status-tag">
          {statusCfg.label}
        </Tag>
      </div>

      {/* Right */}
      <div className="toolbar__right">
        <Space size={6}>
          <Popconfirm
            title="清除本地缓存"
            description="将恢复初始字幕数据，此操作不可撤销。"
            okText="确认清除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={onClearStorage}
          >
            <Tooltip title="清除本地缓存">
              <Button type="text" icon={<DeleteOutlined />} className="toolbar__icon-btn toolbar__icon-btn--danger" />
            </Tooltip>
          </Popconfirm>
          <div className="toolbar__divider" />
          {onTranscribe && (
            <Button icon={<AudioOutlined />} loading={transcribeRunning} onClick={onTranscribe}>
              {transcribeRunning ? '识别中…' : '识别字幕'}
            </Button>
          )}
          <Dropdown
            menu={{ items: exportMenuItems, onClick: ({ key }) => onExport?.(key) }}
            placement="bottomRight"
          >
            <Button type="primary" icon={<ExportOutlined />}>
              导出 <DownOutlined style={{ fontSize: 10 }} />
            </Button>
          </Dropdown>
        </Space>
      </div>
    </div>
  );
};

export default Toolbar;
