# 视频资源处理页面 — 接入说明

## 文件结构

```
video-processing/
├── VideoProcessingPage.tsx       # 主页面（直接路由到此）
├── VideoProcessingPage.scss
├── styles/
│   └── _tokens.scss              # Design Token（颜色/间距/字体）
└── components/
    ├── Toolbar.tsx / .scss       # 顶部工具栏
    ├── VideoPlayer.tsx / .scss   # 视频播放器
    ├── TranscriptEditor.tsx / .scss  # 字幕编辑器
    └── Timeline.tsx / .scss     # 时间轴
```

## 集成步骤

### 1. 安装依赖
确保项目已安装：
```bash
npm install antd @ant-design/icons sass
```

### 2. 复制文件
将整个 `video-processing/` 目录复制到 `src/pages/` 或 `src/features/` 下。

### 3. 注册路由
```tsx
// src/router/index.tsx
import VideoProcessingPage from '@/pages/video-processing/VideoProcessingPage';

{
  path: '/resources/video/process/:id',
  element: <VideoProcessingPage />,
}
```

### 4. 接入真实 API
在 `VideoProcessingPage.tsx` 中替换 mock 数据：

```tsx
// 替换 MOCK_SEGMENTS，改为接口请求
const { data } = useQuery({
  queryKey: ['video-transcript', videoId],
  queryFn: () => api.getTranscript(videoId),
});

// VideoPlayer 的 src 改为真实视频地址
<VideoPlayer
  src={data?.videoUrl}
  ...
/>
```

### 5. SCSS 路径别名
如果你的项目用了路径别名，需调整各组件中的 `@use` 路径：
```scss
// 改为绝对路径
@use '@/styles/tokens' as *;
```

或统一将 `_tokens.scss` 放到 `src/styles/` 目录下，与项目全局样式整合。

## 组件 Props

### `<Toolbar />`
| Prop | 类型 | 说明 |
|------|------|------|
| `fileName` | `string` | 显示的文件名 |
| `status` | `'idle' \| 'processing' \| 'done' \| 'error'` | 处理状态 |
| `onSave` | `() => void` | 保存回调 |
| `onExport` | `(format: string) => void` | 导出格式回调 |

### `<VideoPlayer />`
| Prop | 类型 | 说明 |
|------|------|------|
| `src` | `string` | 视频地址 |
| `currentTime` | `number` | 外部控制跳转时间 |
| `onTimeUpdate` | `(t: number) => void` | 播放时间回调 |
| `onDurationChange` | `(d: number) => void` | 视频时长回调 |

### `<TranscriptEditor />`
| Prop | 类型 | 说明 |
|------|------|------|
| `segments` | `TranscriptSegment[]` | 字幕段数组 |
| `currentTime` | `number` | 当前播放时间（用于高亮） |
| `onChange` | `(segs) => void` | 字幕变更回调 |
| `onSegmentClick` | `(t: number) => void` | 点击字幕跳转回调 |

### `<Timeline />`
| Prop | 类型 | 说明 |
|------|------|------|
| `duration` | `number` | 视频总时长（秒） |
| `currentTime` | `number` | 当前播放时间 |
| `segments` | `TranscriptSegment[]` | 字幕段（用于渲染轨道块） |
| `onSeek` | `(t: number) => void` | 点击跳转回调 |
