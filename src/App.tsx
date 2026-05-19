import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/home/HomePage'
import VideoProcessingPage from './pages/video-processing/VideoProcessingPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/video/process" element={<VideoProcessingPage />} />
    </Routes>
  )
}
