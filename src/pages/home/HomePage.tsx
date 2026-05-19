import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, Button, Steps } from 'antd'
import { InboxOutlined, VideoCameraOutlined } from '@ant-design/icons'
import { saveVideo, deleteVideo } from '../../utils/videoDB'
import './HomePage.scss'

const { Dragger } = Upload

type Stage = 'idle' | 'uploading' | 'upload_done' | 'recognizing' | 'done'

const STEPS = [
  { key: 'uploading',     title: '上传中',       desc: '正在上传视频文件…' },
  { key: 'upload_done',   title: '上传完成',     desc: '文件已成功上传'     },
  { key: 'recognizing',   title: '语音识别中',   desc: '正在提取并识别音频…' },
  { key: 'done',          title: '语音识别完成', desc: '字幕已生成，即将跳转' },
]

const STAGE_ORDER: Stage[] = ['idle', 'uploading', 'upload_done', 'recognizing', 'done']

function stageIndex(s: Stage) {
  return STAGE_ORDER.indexOf(s)
}

function currentStepIndex(stage: Stage) {
  // Maps processing stage to Steps current index
  const map: Partial<Record<Stage, number>> = {
    uploading:    0,
    upload_done:  1,
    recognizing:  2,
    done:         3,
  }
  return map[stage] ?? 0
}

function stepStatus(stepKey: string, stage: Stage): 'wait' | 'process' | 'finish' | 'error' {
  const stageIdx = stageIndex(stage)
  const stepIdx  = STEPS.findIndex(s => s.key === stepKey)
  const stageOfStep = STAGE_ORDER[stepIdx + 1] // uploading=1, upload_done=2, ...

  if (stage === 'idle') return 'wait'
  if (stageIndex(stageOfStep as Stage) < stageIdx) return 'finish'
  if (stageOfStep === stage) return 'process'
  return 'wait'
}

export default function HomePage() {
  const navigate = useNavigate()
  const [stage, setStage] = useState<Stage>('idle')
  const [fileName, setFileName] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // Scale the 1920×1080 canvas to fit the browser window
  const [scale, setScale] = useState(1)
  useEffect(() => {
    function updateScale() {
      const sx = window.innerWidth  / 1920
      const sy = window.innerHeight / 1080
      setScale(Math.min(sx, sy))
    }
    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  // Cleanup timers on unmount
  useEffect(() => () => { timerRef.current.forEach(clearTimeout) }, [])

  function startProcessing(name: string) {
    setFileName(name)
    setStage('uploading')

    const delays: [Stage, number][] = [
      ['upload_done',  2000],
      ['recognizing',  3500],
      ['done',         6000],
    ]
    delays.forEach(([s, ms]) => {
      timerRef.current.push(setTimeout(() => setStage(s), ms))
    })
    timerRef.current.push(
      setTimeout(() => navigate('/video/process'), 7200),
    )
  }

  const isProcessing = stage !== 'idle'

  return (
    <div className="home-scale-root">
      <div
        className="home-page"
        style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
      >
        <div className="home-page__bg" />

        <div className="home-page__header">
          <h1>视频资源处理平台</h1>
          <p>上传视频，自动完成语音识别与字幕生成</p>
        </div>

        {!isProcessing ? (
          <div className="home-page__upload-area">
            <Dragger
              name="file"
              multiple={false}
              accept="video/*"
              beforeUpload={file => {
                // Replace old video in IndexedDB
                const oldId = localStorage.getItem('vp_current_video_id')
                if (oldId) deleteVideo(oldId).catch(() => {})

                // Save new video; navigation happens 7s later so this will finish in time
                saveVideo(file).then(id => {
                  localStorage.setItem('vp_current_video_id', id)
                }).catch(() => {})

                localStorage.setItem('vp_current_video_name', file.name)
                startProcessing(file.name)
                return false
              }}
              showUploadList={false}
            >
              <div className="upload-inner">
                <div className="upload-inner__icon">
                  <VideoCameraOutlined style={{ color: '#1677ff' }} />
                </div>
                <p className="upload-inner__title">拖拽视频文件到此处</p>
                <p className="upload-inner__hint">支持 MP4、MOV、AVI、MKV 等常见格式</p>
                <Button
                  type="primary"
                  size="large"
                  className="upload-inner__btn"
                  icon={<InboxOutlined />}
                >
                  点击选择文件
                </Button>
              </div>
            </Dragger>
          </div>
        ) : (
          <div className="home-page__progress">
            <p className="home-page__progress-title">
              {fileName && `正在处理：${fileName}`}
            </p>
            <Steps
              direction="vertical"
              current={currentStepIndex(stage)}
              items={STEPS.map(s => ({
                title:       s.title,
                description: s.desc,
                status:      stepStatus(s.key, stage),
              }))}
            />
          </div>
        )}
      </div>
    </div>
  )
}
