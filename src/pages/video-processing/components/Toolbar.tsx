import React from 'react';
import { Button, Space, Tag, Tooltip, Dropdown, Typography, Popconfirm } from 'antd';
import {
  SaveOutlined,
  ExportOutlined,
  UndoOutlined,
  RedoOutlined,
  SettingOutlined,
  QuestionCircleOutlined,
  DownOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  DeleteOutlined,
  AudioOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import './Toolbar.scss';

const { Text } = Typography;

export type ProcessStatus = 'idle' | 'processing' | 'done' | 'error';

interface ToolbarProps {
  fileName?: string;
  status?: ProcessStatus;
  isDirty?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onSave?: () => void;
  onExport?: (format: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSettings?: () => void;
  onClearStorage?: () => void;
  onTranscribe?: () => void;
  transcribeRunning?: boolean;
}

const STATUS_CONFIG: Record<ProcessStatus, { label: string; color: string; icon?: React.ReactNode }> = {
  idle:       { label: '未处理',  color: 'default' },
  processing: { label: '处理中',  color: 'processing', icon: <LoadingOutlined /> },
  done:       { label: '已完成',  color: 'success',    icon: <CheckCircleOutlined /> },
  error:      { label: '处理失败', color: 'error' },
};

const exportMenuItems: MenuProps['items'] = [
  { key: 'srt',  label: '导出 SRT 字幕' },
  { key: 'vtt',  label: '导出 VTT 字幕' },
  { key: 'txt',  label: '导出纯文本' },
  { type: 'divider' },
  { key: 'mp4',  label: '导出处理后视频' },
];

const Toolbar: React.FC<ToolbarProps> = ({
  fileName = '未命名资源',
  status = 'idle',
  isDirty = false,
  canUndo = false,
  canRedo = false,
  onSave,
  onExport,
  onUndo,
  onRedo,
  onSettings,
  onClearStorage,
  onTranscribe,
  transcribeRunning = false,
}) => {
  const statusCfg = STATUS_CONFIG[status];

  const handleExportClick: MenuProps['onClick'] = ({ key }) => {
    onExport?.(key);
  };

  return (
    <div className="toolbar">
      {/* Left: file info */}
      <div className="toolbar__left">
        <Text className="toolbar__filename">
          {isDirty && <span className="toolbar__dirty-dot" title="有未保存的更改" />}
          {fileName}
        </Text>
        <Tag
          color={statusCfg.color}
          icon={statusCfg.icon}
          className="toolbar__status-tag"
        >
          {statusCfg.label}
        </Tag>
      </div>

      {/* Center: edit actions */}
      <div className="toolbar__center">
        <Space size={4}>
          <Tooltip title="撤销 (Ctrl+Z)">
            <Button
              type="text"
              icon={<UndoOutlined />}
              disabled={!canUndo}
              onClick={onUndo}
              className="toolbar__icon-btn"
            />
          </Tooltip>
          <Tooltip title="重做 (Ctrl+Y)">
            <Button
              type="text"
              icon={<RedoOutlined />}
              disabled={!canRedo}
              onClick={onRedo}
              className="toolbar__icon-btn"
            />
          </Tooltip>
        </Space>
      </div>

      {/* Right: primary actions */}
      <div className="toolbar__right">
        <Space size={8}>
          <Tooltip title="帮助">
            <Button
              type="text"
              icon={<QuestionCircleOutlined />}
              className="toolbar__icon-btn"
            />
          </Tooltip>
          <Tooltip title="设置">
            <Button
              type="text"
              icon={<SettingOutlined />}
              onClick={onSettings}
              className="toolbar__icon-btn"
            />
          </Tooltip>
          <Popconfirm
            title="清除本地缓存"
            description="将恢复初始字幕数据，此操作不可撤销。"
            okText="确认清除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={onClearStorage}
          >
            <Tooltip title="清除本地缓存">
              <Button
                type="text"
                icon={<DeleteOutlined />}
                className="toolbar__icon-btn toolbar__icon-btn--danger"
              />
            </Tooltip>
          </Popconfirm>
          <div className="toolbar__divider" />
          {onTranscribe && (
            <Button
              icon={<AudioOutlined />}
              loading={transcribeRunning}
              onClick={onTranscribe}
            >
              {transcribeRunning ? '识别中…' : '识别字幕'}
            </Button>
          )}
          <Button
            icon={<SaveOutlined />}
            onClick={onSave}
          >
            保存
          </Button>
          <Dropdown
            menu={{ items: exportMenuItems, onClick: handleExportClick }}
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
