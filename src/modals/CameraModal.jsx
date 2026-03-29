import { useRef, useState, useEffect } from 'react'

export default function CameraModal({ onClose, showToast }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState(null)

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop())
    }
  }

  useEffect(() => {
    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setCameraError('Camera not supported on this device/browser.')
          return
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } }
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          setCameraReady(true)
        }
      } catch (err) {
        setCameraError('Camera access denied. Please allow camera permissions and try again.')
        showToast('Camera access denied')
      }
    }
    startCamera()
    return () => stopCamera()
  }, [])

  const captureCard = () => {
    if (canvasRef.current && videoRef.current) {
      const video = videoRef.current
      canvasRef.current.width = video.videoWidth
      canvasRef.current.height = video.videoHeight
      const ctx = canvasRef.current.getContext('2d')
      ctx.drawImage(video, 0, 0)
      showToast('Photo captured!')
      stopCamera()
      onClose()
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div className="modal-box" style={{ maxWidth: '500px' }}>
        <h3>📷 Scan Card</h3>
        {cameraError ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: '10px', marginBottom: '16px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📷</div>
            <p>{cameraError}</p>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', borderRadius: '10px', background: '#000', marginBottom: '16px', display: 'block' }}
          />
        )}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => { stopCamera(); onClose() }}>Cancel</button>
          <button className="btn btn-primary" onClick={captureCard} disabled={!cameraReady || !!cameraError}>Capture</button>
        </div>
      </div>
    </div>
  )
}
