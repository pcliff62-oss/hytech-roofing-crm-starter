import React from 'react'

export default function JobsList({ items = [], onSelect }) {
  const jobs = (items || []).filter(a => a.job)
  return (
    <div className="space-y-3">
      <div className="font-medium">Jobs</div>
      {jobs.length === 0 && (
        <div className="text-sm text-neutral-600">No jobs scheduled.</div>
      )}
      <ul className="bg-white rounded-2xl border border-neutral-200 divide-y">
        {jobs.map(j => (
          <li key={j.id} className="px-4 py-3 text-sm active:bg-neutral-50" onClick={()=>onSelect?.(j)}>
            <div className="flex items-start gap-3">
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Job</span>
              <div className="min-w-0">
                <div className="font-medium truncate">{j.title || 'Job'}</div>
                <div className="text-xs text-neutral-500 truncate">
                  {new Date(j.when).toLocaleDateString(undefined, { weekday:'short', month:'2-digit', day:'2-digit', year:'numeric' })}
                  {j.address ? ` • ${j.address}` : ''}
                </div>
                <div className="text-xs text-neutral-500 truncate">
                  {j.customerName || ''}{j.workType ? ` — ${j.workType}` : ''}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
