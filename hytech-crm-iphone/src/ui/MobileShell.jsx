export default function MobileShell({ title = 'HyTech CRM', onPlus, children, tab, onTabChange, frame = 'edge' }) {
  const container =
    frame === 'device'
      ? 'mx-auto h-screen max-w-[393px] bg-neutral-50 text-neutral-900 flex flex-col overflow-hidden rounded-2xl shadow-lg'
      : 'h-screen w-full bg-neutral-50 text-neutral-900 flex flex-col overflow-hidden'

  return (
    <div className={container}>
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-neutral-200" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="text-sm text-neutral-500">{new Date().toLocaleDateString()}</div>
          <div className="font-semibold">{title}</div>
          <button
            className="rounded-xl bg-neutral-900 text-white text-sm px-3 py-1"
            onClick={onPlus}
          >
            +
          </button>
        </div>
      </div>

      {/* Scroll area */}
      <div className="flex-1 overflow-y-auto">{children}</div>

      {/* Bottom nav */}
      <BottomNav value={tab} onChange={onTabChange} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
    </div>
  )
}

function BottomNav({ value, onChange, style }) {
  const Item = ({ id, label, icon }) => (
    <button
      onClick={() => onChange?.(id)}
      className={`flex-1 py-2 text-xs ${value === id ? 'text-neutral-900' : 'text-neutral-400'}`}
    >
      <div className="mx-auto mb-1">{icon}</div>
      {label}
    </button>
  )
  return (
    <div className="border-t border-neutral-200 bg-white" style={style}>
      <div className="mx-auto max-w-[393px] flex">
        <Item id="dashboard" label="Dashboard" icon="🏠" />
        <Item id="customers" label="Customers" icon="👤" />
        <Item id="settings" label="Settings" icon="⚙️" />
      </div>
    </div>
  )
}
