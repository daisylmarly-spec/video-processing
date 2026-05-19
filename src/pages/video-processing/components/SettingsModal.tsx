import React from 'react';
import { Modal, Form, Input, Select, Alert, Typography } from 'antd';
import { KeyOutlined } from '@ant-design/icons';
import './SettingsModal.scss';

const { Text } = Typography;

export interface VpSettings {
  xfAppId:     string;
  xfApiKey:    string;
  xfApiSecret: string;
  sourceLang:  string;
  targetLang:  string;
}

const SETTINGS_KEY = 'vp_settings_v2';

export function loadSettings(): VpSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw) as VpSettings;
  } catch {}
  // Fall back to .env.local defaults if available
  return {
    xfAppId:     import.meta.env.VITE_XF_APP_ID     ?? '',
    xfApiKey:    import.meta.env.VITE_XF_API_KEY    ?? '',
    xfApiSecret: import.meta.env.VITE_XF_API_SECRET ?? '',
    sourceLang:  'cn',
    targetLang:  'en',
  };
}

function persistSettings(s: VpSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

const SOURCE_LANG_OPTIONS = [
  { value: 'cn', label: '中文（普通话）' },
  { value: 'en', label: '英文' },
  { value: 'ja', label: '日文' },
  { value: 'ko', label: '韩文' },
];

const TARGET_LANG_OPTIONS = [
  { value: 'en', label: '英文' },
  { value: 'cn', label: '中文' },
  { value: 'ja', label: '日文' },
  { value: 'ko', label: '韩文' },
  { value: 'es', label: '西班牙文' },
  { value: 'fr', label: '法文' },
];

interface Props {
  open:    boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<Props> = ({ open, onClose }) => {
  const [form] = Form.useForm<VpSettings>();

  const handleSave = async () => {
    const vals = await form.validateFields();
    persistSettings(vals);
    onClose();
  };

  return (
    <Modal
      title="讯飞 API 设置"
      open={open}
      onOk={handleSave}
      onCancel={onClose}
      okText="保存"
      cancelText="取消"
      afterOpenChange={visible => visible && form.setFieldsValue(loadSettings())}
      width={500}
    >
      <Alert
        type="info"
        showIcon
        message="密钥仅存储在本地浏览器，不会上传至任何服务器。"
        style={{ marginBottom: 20 }}
      />
      <Form form={form} layout="vertical">
        <Form.Item
          label="APPID"
          name="xfAppId"
          rules={[{ required: true, message: '请输入讯飞 APPID' }]}
        >
          <Input prefix={<KeyOutlined />} placeholder="例：31a2xxxx" />
        </Form.Item>
        <Form.Item
          label="APIKey"
          name="xfApiKey"
          rules={[{ required: true, message: '请输入讯飞 APIKey' }]}
        >
          <Input prefix={<KeyOutlined />} placeholder="32 位十六进制字符串" />
        </Form.Item>
        <Form.Item
          label="APISecret"
          name="xfApiSecret"
          rules={[{ required: true, message: '请输入讯飞 APISecret' }]}
        >
          <Input.Password prefix={<KeyOutlined />} placeholder="32 位十六进制字符串" />
        </Form.Item>
        <Form.Item
          label="识别语言"
          name="sourceLang"
          extra="视频/音频中的语言"
        >
          <Select options={SOURCE_LANG_OPTIONS} />
        </Form.Item>
        <Form.Item
          label="翻译目标语言"
          name="targetLang"
          extra="字幕原文将被翻译为所选语言并对齐展示"
        >
          <Select options={TARGET_LANG_OPTIONS} />
        </Form.Item>
      </Form>
      <div className="settings-modal__footer">
        <Text type="secondary">
          语音识别使用讯飞 LFASR；翻译使用讯飞机器翻译（ntrans）。
        </Text>
      </div>
    </Modal>
  );
};
