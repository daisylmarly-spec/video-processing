import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, Button, Steps } from 'antd'
import { InboxOutlined, VideoCameraOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons'
import { saveVideo, deleteVideo } from '../../utils/videoDB'
import { transcribeAudio } from '../../utils/transcribe'
import { translateSegments } from '../../utils/translate'
import { loadSettings } from '../video-processing/components/SettingsModal'
import './HomePage.scss'

const { Dragger } = Upload

type Stage = 'idle' | 'saving' | 'transcribing' | 'translating' | 'done' | 'error'

const STEPS = [
  { title: '文件上传',   desc: '正在保存视频文件…'           },
  { title: '语音识别',   desc: '调用讯飞识别音频内容（约 1–5 分钟）' },
  { title: '字幕翻译',   desc: '自动翻译字幕文本'             },
]

interface PipelineData { id: string; blob: Blob; name: string }

function stageToStep(stage: Stage): number {
  if (stage === 'saving')       return 0
  if (stage === 'transcribing') return 1
  if (stage === 'translating' || stage === 'done') return 2
  return 0
}

export default function HomePage() {
  const navigate   = useNavigate()
  const [stage,    setStage]    = useState<Stage>('idle')
  const [fileName, setFileName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const retryRef   = useRef<PipelineData | null>(null)

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

  const runPipeline = useCallback(async ({ id, blob, name }: PipelineData) => {
    const settings = loadSettings()
    setErrorMsg('')

    try {
      setStage('transcribing')
      const segs = await transcribeAudio(
        blob, name,
        settings.xfAppId, settings.xfApiKey, settings.xfAsrSecret || settings.xfApiSecret,
        settings.sourceLang,
      )
      localStorage.setItem(`vp_transcript_${id}`, JSON.stringify(segs))

      setStage('translating')
      let finalSegs = segs
      try {
        const translated = await translateSegments(
          segs,
          settings.xfAppId, settings.xfApiKey, settings.xfApiSecret,
          settings.sourceLang, settings.targetLang,
        )
        finalSegs = translated
      } catch {
        // translation failure is non-fatal — navigate with untranslated segments
      }
      localStorage.setItem(`vp_transcript_${id}`, JSON.stringify(finalSegs))

      setStage('done')
      setTimeout(() => navigate('/video/process'), 800)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setStage('error')
    }
  }, [navigate])

  async function handleFile(file: File) {
    const oldId = localStorage.getItem('vp_current_video_id')
    if (oldId) deleteVideo(oldId).catch(() => {})

    setFileName(file.name)
    setStage('saving')

    let id: string
    try {
      id = await saveVideo(file)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '视频保存失败')
      setStage('error')
      return
    }

    localStorage.setItem('vp_current_video_id',   id)
    localStorage.setItem('vp_current_video_name', file.name)

    const data: PipelineData = { id, blob: file, name: file.name }
    retryRef.current = data
    runPipeline(data)
  }

  const isProcessing = stage !== 'idle' && stage !== 'error'

  const stepCurrent = stage === 'error'
    ? stageToStep(stage)   // stays on the failed step
    : stageToStep(stage)

  const stepsStatus =
    stage === 'error' ? 'error' :
    stage === 'done'  ? 'finish' :
    'process'

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

        {!isProcessing && stage !== 'error' ? (
          <div className="home-page__upload-area">
            <Dragger
              name="file"
              multiple={false}
              accept="video/*"
              beforeUpload={file => { handleFile(file); return false }}
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
            {stage === 'error' ? (
              <>
                <div className="home-page__progress-title" style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ff4d4f' }}>
                  <WarningOutlined />
                  处理失败
                </div>
                {errorMsg && (
                  <p style={{ fontSize: 13, color: '#9098a8', margin: '0 0 24px', wordBreak: 'break-all' }}>
                    {errorMsg}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 12 }}>
                  {retryRef.current && (
                    <Button
                      type="primary"
                      icon={<ReloadOutlined />}
                      onClick={() => retryRef.current && runPipeline(retryRef.current)}
                    >
                      重试
                    </Button>
                  )}
                  <Button onClick={() => { setStage('idle'); setErrorMsg('') }}>
                    重新上传
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="home-page__progress-title">
                  {fileName && `正在处理：${fileName}`}
                </p>
                <Steps
                  direction="vertical"
                  current={stepCurrent}
                  status={stepsStatus}
                  items={STEPS.map(s => ({ title: s.title, description: s.desc }))}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
