import React, { useState } from 'react'
import MobileShell from './ui/MobileShell.jsx'
import Today from './features/dashboard/Today.jsx'

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const title = 'HyTech CRM'
  return (
    <MobileShell title={title} onPlus={() => console.log('[+] tapped')} tab={tab} onTabChange={setTab} frame="edge">
      <div className="p-4">
        {tab === 'dashboard' && <Today />}
        {tab === 'customers' && <div className="text-sm text-neutral-700">Customers list (stub)</div>}
        {tab === 'settings' && <div className="text-sm text-neutral-700">Settings (stub)</div>}
      </div>
    </MobileShell>
  )
}
