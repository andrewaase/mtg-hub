import { useRef, useState } from 'react'

export default function CameraModal({ onClose, showToast }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      showToast('Camera access denied')
    }
  }

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop())
    }
  }

  const captureCard = () => {
    if (canvasRef.current && videoRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      ctx.drawImage(videoRef.current, 0, 0)
      showToast('Photo captured!')
      stopCamera()
      onClose()
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div className="modal-box" style={{ maxWidth: '500px' }}>
        <h3>📷 Scan Card</h3>
        <video ref={videoRef} style={{ width: '100%', borderRadius: '10px', background: '#000', marginBottom: '16px' }} onLoadedMetadata={startCamera} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => { stopCamera(); onClose() }}>Cancel</button>
          <button className="btn btn-primary" onClick={captureCard}>Capture</button>
        </div>
      </div>
    </div>
  )
}
