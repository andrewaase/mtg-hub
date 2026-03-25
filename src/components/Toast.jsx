export default function Toast({ msg }) {
  return (
    <div id="toast" className="show" style={{ position: 'fixed', bottom: '90px', right: '20px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 18px', fontSize: '.88rem', boxShadow: 'var(--shadow)', zIndex: 300 }}>
      ✓ {msg}
    </div>
  )
}
