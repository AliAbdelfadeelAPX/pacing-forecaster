import React, { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import dayjs from 'dayjs'
// Vite raw import so the app works on GitHub Pages with no upload step
import defaultCsv from './data/default.csv?raw'

const WEEKDAYS = [
  { id: 1, label: 'Monday' },
  { id: 2, label: 'Tuesday' },
  { id: 3, label: 'Wednesday' },
  { id: 4, label: 'Thursday' },
  { id: 5, label: 'Friday' },
  { id: 6, label: 'Saturday' },
  { id: 0, label: 'Sunday' },
]

function pct(x, digits = 1) {
  if (!isFinite(x)) return '—'
  return `${(x * 100).toFixed(digits)}%`
}
function money(x) {
  if (!isFinite(x)) return '—'
  return x.toLocaleString(undefined, { maximumFractionDigits: 0 })
}
function num(x) {
  if (!isFinite(x)) return '—'
  return x.toLocaleString()
}

function int(x) {
  if (!isFinite(x)) return '—'
  return x.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function quantile(arr, q) {
  if (!arr?.length) return NaN
  const a = [...arr].sort((x, y) => x - y)
  const pos = (a.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (a[base + 1] === undefined) return a[base]
  return a[base] + rest * (a[base + 1] - a[base])
}

function safeDiv(a, b) {
  return b ? a / b : NaN
}

/**
 * Build per-weekday stats from day×hour rows
 * Expected CSV headers (case-insensitive, flexible):
 * - date: dh.date | date
 * - hour: dh.hour | hour
 * - revenue, impressions, clicks, sessions
 */
function buildStats(rows) {
  // Normalize keys
  const norm = rows
    .map(r => {
      const keys = Object.keys(r || {})
      const get = (...cands) => {
        for (const c of cands) {
          const k = keys.find(k => k.toLowerCase() === c)
          if (k != null) return r[k]
        }
        return undefined
      }
      const date = get('dh.date', 'date')
      const hour = Number(get('dh.hour', 'hour'))
      const revenue = Number(get('revenue'))
      const impressions = Number(get('impressions'))
      const clicks = Number(get('clicks'))
      const sessions = Number(get('sessions'))
      return {
        date: (date || '').slice(0, 10),
        hour: Number.isFinite(hour) ? hour : NaN,
        revenue: Number.isFinite(revenue) ? revenue : 0,
        impressions: Number.isFinite(impressions) ? impressions : 0,
        clicks: Number.isFinite(clicks) ? clicks : 0,
        sessions: Number.isFinite(sessions) ? sessions : 0,
      }
    })
    .filter(r => r.date && r.hour >= 0 && r.hour <= 23)

  // Group by date -> 24hr arrays
  const byDate = new Map()
  for (const r of norm) {
    if (!byDate.has(r.date)) {
      byDate.set(r.date, {
        date: r.date,
        weekday: dayjs(r.date).day(), // 0..6 (Sun..Sat)
        hours: Array.from({ length: 24 }, () => ({
          revenue: 0, impressions: 0, clicks: 0, sessions: 0,
        })),
      })
    }
    const d = byDate.get(r.date)
    d.hours[r.hour] = {
      revenue: r.revenue,
      impressions: r.impressions,
      clicks: r.clicks,
      sessions: r.sessions,
    }
  }

  const days = [...byDate.values()]

  // Per-weekday containers
  const stats = {}
  for (const w of [0,1,2,3,4,5,6]) {
    stats[w] = {
      dayCount: 0,
      dailyTotals: { revenue: [], impressions: [], clicks: [], sessions: [] },
      // arrays of arrays: completion ratio per day per hour
      cumCompletion: { revenue: Array.from({length:24}, () => []),
                      impressions: Array.from({length:24}, () => []),
                      clicks: Array.from({length:24}, () => []),
                      sessions: Array.from({length:24}, () => []) },
      // hourly absolute values per day (for expected per hour)
      hourly: { revenue: Array.from({length:24}, () => []),
                impressions: Array.from({length:24}, () => []),
                clicks: Array.from({length:24}, () => []),
                sessions: Array.from({length:24}, () => []) },
      // hourly share per day
      share: { revenue: Array.from({length:24}, () => []),
               impressions: Array.from({length:24}, () => []),
               clicks: Array.from({length:24}, () => []),
               sessions: Array.from({length:24}, () => []) },
    }
  }

  for (const d of days) {
    const w = d.weekday
    const container = stats[w]
    container.dayCount += 1

    const totals = { revenue: 0, impressions: 0, clicks: 0, sessions: 0 }
    for (let h=0; h<24; h++) {
      totals.revenue += d.hours[h].revenue
      totals.impressions += d.hours[h].impressions
      totals.clicks += d.hours[h].clicks
      totals.sessions += d.hours[h].sessions
    }
    container.dailyTotals.revenue.push(totals.revenue)
    container.dailyTotals.impressions.push(totals.impressions)
    container.dailyTotals.clicks.push(totals.clicks)
    container.dailyTotals.sessions.push(totals.sessions)

    const cum = { revenue: 0, impressions: 0, clicks: 0, sessions: 0 }
    for (let h=0; h<24; h++) {
      const x = d.hours[h]
      // absolute per hour
      container.hourly.revenue[h].push(x.revenue)
      container.hourly.impressions[h].push(x.impressions)
      container.hourly.clicks[h].push(x.clicks)
      container.hourly.sessions[h].push(x.sessions)

      // shares per hour
      container.share.revenue[h].push(safeDiv(x.revenue, totals.revenue))
      container.share.impressions[h].push(safeDiv(x.impressions, totals.impressions))
      container.share.clicks[h].push(safeDiv(x.clicks, totals.clicks))
      container.share.sessions[h].push(safeDiv(x.sessions, totals.sessions))

      // cumulative completion ratios
      cum.revenue += x.revenue
      cum.impressions += x.impressions
      cum.clicks += x.clicks
      cum.sessions += x.sessions

      container.cumCompletion.revenue[h].push(safeDiv(cum.revenue, totals.revenue))
      container.cumCompletion.impressions[h].push(safeDiv(cum.impressions, totals.impressions))
      container.cumCompletion.clicks[h].push(safeDiv(cum.clicks, totals.clicks))
      container.cumCompletion.sessions[h].push(safeDiv(cum.sessions, totals.sessions))
    }
  }

  // Summarize into percentiles/means/std
  const summarize = (arr) => {
    const mean = arr?.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN
    const variance = arr?.length
      ? arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length
      : NaN
    const std = isFinite(variance) ? Math.sqrt(variance) : NaN
    return {
      p25: quantile(arr, 0.25),
      p50: quantile(arr, 0.50),
      p75: quantile(arr, 0.75),
      mean,
      std,
    }
  }

  const out = {}
  for (const w of [0,1,2,3,4,5,6]) {
    const s = stats[w]
    out[w] = {
      dayCount: s.dayCount,
      daily: {
        revenue: summarize(s.dailyTotals.revenue),
        impressions: summarize(s.dailyTotals.impressions),
        clicks: summarize(s.dailyTotals.clicks),
        sessions: summarize(s.dailyTotals.sessions),
      },
      hourly: {
        revenue: Array.from({length:24}, (_,h)=>summarize(s.hourly.revenue[h])),
        impressions: Array.from({length:24}, (_,h)=>summarize(s.hourly.impressions[h])),
        clicks: Array.from({length:24}, (_,h)=>summarize(s.hourly.clicks[h])),
        sessions: Array.from({length:24}, (_,h)=>summarize(s.hourly.sessions[h])),
      },
      share: {
        revenue: Array.from({length:24}, (_,h)=>summarize(s.share.revenue[h])),
        impressions: Array.from({length:24}, (_,h)=>summarize(s.share.impressions[h])),
        clicks: Array.from({length:24}, (_,h)=>summarize(s.share.clicks[h])),
        sessions: Array.from({length:24}, (_,h)=>summarize(s.share.sessions[h])),
      },
      cumCompletion: {
        revenue: Array.from({length:24}, (_,h)=>summarize(s.cumCompletion.revenue[h])),
        impressions: Array.from({length:24}, (_,h)=>summarize(s.cumCompletion.impressions[h])),
        clicks: Array.from({length:24}, (_,h)=>summarize(s.cumCompletion.clicks[h])),
        sessions: Array.from({length:24}, (_,h)=>summarize(s.cumCompletion.sessions[h])),
      }
    }
  }
  return out
}

function Badge({ tone='neutral', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export default function App() {
  const [rawRows, setRawRows] = useState(null)
  const [parseError, setParseError] = useState(null)

  const [weekday, setWeekday] = useState(1) // Monday
  const [hour, setHour] = useState(12)
  // How to interpret the "current hour" input:
  // - true: revenue includes the selected hour (0..hour)
  // - false: revenue is through the previous hour (0..hour-1)
  const [includeCurrentHour, setIncludeCurrentHour] = useState(true)
  const [revSoFar, setRevSoFar] = useState('')
  const [imprSoFar, setImprSoFar] = useState('')
  const [clickSoFar, setClickSoFar] = useState('')
  const [sessSoFar, setSessSoFar] = useState('')

  // Load baked-in dataset on first mount (can still be overridden via "Replace CSV")
  useEffect(() => {
    if (rawRows) return
    setParseError(null)
    Papa.parse(defaultCsv, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (res) => {
        if (res.errors?.length) {
          setParseError(res.errors[0].message || 'CSV parse error')
        }
        setRawRows(res.data || [])
      }
    })
  }, [rawRows])


  const stats = useMemo(() => {
    if (!rawRows) return null
    try {
      return buildStats(rawRows)
    } catch (e) {
      console.error(e)
      setParseError(`Failed to build stats: ${e?.message || String(e)}`)
      return null
    }
  }, [rawRows])

  function onUpload(file) {
    setParseError(null)
    if (!file) return
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (res) => {
        if (res.errors?.length) {
          setParseError(res.errors[0].message || 'CSV parse error')
        }
        setRawRows(res.data || [])
      }
    })
  }

  const wStats = stats ? stats[weekday] : null

  // Day-level series for backtesting (group raw rows by date -> 24 hourly values)
  const daySeries = useMemo(() => {
    if (!rawRows) return null
    const byDate = new Map()
    for (const r of rawRows) {
      const keys = Object.keys(r || {})
      const get = (...cands) => {
        for (const c of cands) {
          const k = keys.find(k => k.toLowerCase() === c)
          if (k != null) return r[k]
        }
        return undefined
      }
      const date = (get('dh.date', 'date') || '').slice(0, 10)
      const hour = Number(get('dh.hour', 'hour'))
      if (!date || !(hour >= 0 && hour <= 23)) continue
      const revenue = Number(get('revenue')) || 0
      if (!byDate.has(date)) {
        byDate.set(date, {
          date,
          weekday: dayjs(date).day(),
          revenueByHour: Array.from({ length: 24 }, () => 0),
          totalRevenue: 0,
        })
      }
      const d = byDate.get(date)
      d.revenueByHour[hour] = revenue
    }
    for (const d of byDate.values()) {
      d.totalRevenue = d.revenueByHour.reduce((a, b) => a + b, 0)
    }
    return [...byDate.values()]
  }, [rawRows])

  const inputs = {
    revenue: Number(revSoFar),
    impressions: Number(imprSoFar),
    clicks: Number(clickSoFar),
    sessions: Number(sessSoFar),
  }

  const has = {
    revenue: Number.isFinite(inputs.revenue) && inputs.revenue > 0,
    impressions: Number.isFinite(inputs.impressions) && inputs.impressions > 0,
    clicks: Number.isFinite(inputs.clicks) && inputs.clicks > 0,
    sessions: Number.isFinite(inputs.sessions) && inputs.sessions > 0,
  }

  const forecast = useMemo(() => {
    if (!wStats || !has.revenue) return null
    const hSelected = Math.max(0, Math.min(23, Number(hour)))
    const h = includeCurrentHour ? hSelected : Math.max(0, hSelected - 1)
    const cr = wStats.cumCompletion.revenue[h]
    const cr50 = cr.p50
    const cr25 = cr.p25
    const cr75 = cr.p75

    const eod = inputs.revenue / cr50
    const low = inputs.revenue / cr75
    const high = inputs.revenue / cr25

    const avgDaily = wStats.daily.revenue.mean
    const expectedByNow = avgDaily * cr50
    const delta = inputs.revenue - expectedByNow
    const deltaPct = safeDiv(delta, expectedByNow)

    let pacingTone = 'neutral'
    let pacingLabel = 'On pace'
    if (isFinite(deltaPct)) {
      if (deltaPct > 0.05) { pacingTone='good'; pacingLabel='Ahead of pace' }
      else if (deltaPct < -0.05) { pacingTone='bad'; pacingLabel='Behind pace' }
      else { pacingTone='neutral'; pacingLabel='On pace' }
    }

    // Warning layer based on traffic + efficiency (if provided)
    const warnings = []
    const trafficChecks = [
      { key: 'impressions', label: 'impressions' },
      { key: 'clicks', label: 'clicks' },
      { key: 'sessions', label: 'sessions' },
    ]
    for (const t of trafficChecks) {
      if (!has[t.key]) continue
      const cumT = wStats.cumCompletion[t.key][h].p50
      const expectedTByNow = wStats.daily[t.key].mean * cumT
      const dT = inputs[t.key] - expectedTByNow
      const dTPct = safeDiv(dT, expectedTByNow)
      if (isFinite(dTPct) && Math.abs(dTPct) >= 0.08) {
        warnings.push({
          tone: dTPct < 0 ? 'bad' : 'good',
          msg: `${t.label} are ${dTPct < 0 ? 'below' : 'above'} normal by ${Math.abs(dTPct*100).toFixed(1)}% for this weekday at hour ${h}.`
        })
      }
    }

    // Efficiency checks if relevant inputs exist
    if (has.sessions) {
      const rps = inputs.revenue / inputs.sessions
      const histRps = safeDiv(wStats.daily.revenue.mean, wStats.daily.sessions.mean)
      const diff = safeDiv(rps - histRps, histRps)
      if (isFinite(diff) && Math.abs(diff) >= 0.10) {
        warnings.push({
          tone: diff < 0 ? 'bad' : 'good',
          msg: `Revenue per session is ${diff < 0 ? 'lower' : 'higher'} than this weekday’s average by ${Math.abs(diff*100).toFixed(1)}%.`
        })
      }
    }
    if (has.clicks) {
      const rpc = inputs.revenue / inputs.clicks
      const histRpc = safeDiv(wStats.daily.revenue.mean, wStats.daily.clicks.mean)
      const diff = safeDiv(rpc - histRpc, histRpc)
      if (isFinite(diff) && Math.abs(diff) >= 0.10) {
        warnings.push({
          tone: diff < 0 ? 'bad' : 'good',
          msg: `Revenue per click is ${diff < 0 ? 'lower' : 'higher'} than this weekday’s average by ${Math.abs(diff*100).toFixed(1)}%.`
        })
      }
    }

    // Build hour table expectations (full day)
    // Table is CUMULATIVE until each hour, and shows per-hour deltas in brackets.
    const clamp01 = (x) => Math.max(0, Math.min(1, x))
    const rows = []
    let cumImpr = 0
    let cumClicks = 0
    let cumSessions = 0

    for (let hh = 0; hh < 24; hh++) {
      // Revenue (cumulative)
      const cumR = wStats.cumCompletion.revenue[hh]
      const shareR = wStats.share.revenue[hh]

      const cum50 = cumR.p50
      const hour50 = shareR.p50

      // Std-dev bands on completion ratios (mean ± std)
      const cumMean = cumR.mean
      const cumStd = cumR.std
      const hourMean = shareR.mean
      const hourStd = shareR.std

      const expCumRev = eod * cum50
      const expHourRev = eod * hour50

      const cumLow = eod * clamp01(cumMean - (isFinite(cumStd) ? cumStd : 0))
      const cumHigh = eod * clamp01(cumMean + (isFinite(cumStd) ? cumStd : 0))

      const hourLow = eod * clamp01(hourMean - (isFinite(hourStd) ? hourStd : 0))
      const hourHigh = eod * clamp01(hourMean + (isFinite(hourStd) ? hourStd : 0))

      // Traffic: cumulative (integer, no decimals)
      const hImpr = wStats.hourly.impressions[hh].mean
      const hClicks = wStats.hourly.clicks[hh].mean
      const hSessions = wStats.hourly.sessions[hh].mean
      cumImpr += isFinite(hImpr) ? hImpr : 0
      cumClicks += isFinite(hClicks) ? hClicks : 0
      cumSessions += isFinite(hSessions) ? hSessions : 0

      rows.push({
        hour: hh,
        // revenue
        expCumRev,
        expHourRev,
        cumLow,
        cumHigh,
        hourLow,
        hourHigh,
        // traffic (cumulative)
        expCumImpr: cumImpr,
        expCumClicks: cumClicks,
        expCumSessions: cumSessions,
      })
    }

    return {
      hourSelected: hSelected,
      hour: h,
      eod, low, high,
      expectedByNow, delta, deltaPct,
      pacingTone, pacingLabel,
      warnings,
      hourRows: rows,
    }
  }, [wStats, weekday, hour, includeCurrentHour, revSoFar, imprSoFar, clickSoFar, sessSoFar])

  // In-sample backtest (per selected weekday) to quantify typical error by checkpoint hour
  const backtest = useMemo(() => {
    if (!daySeries || !wStats) return null
    const days = daySeries.filter(d => d.weekday === weekday && d.totalRevenue > 0)
    if (days.length < 3) return null

    const checkpoints = [6, 9, 12, 15, 18, 21]
    const results = []
    for (const hourSelected of checkpoints) {
      const effectiveHour = includeCurrentHour ? hourSelected : Math.max(0, hourSelected - 1)
      const cr50 = wStats.cumCompletion.revenue[effectiveHour]?.p50
      if (!isFinite(cr50) || cr50 <= 0) continue

      const errs = []
      for (const d of days) {
        const soFar = d.revenueByHour.slice(0, effectiveHour + 1).reduce((a, b) => a + b, 0)
        if (!(soFar > 0)) continue
        const pred = soFar / cr50
        const err = safeDiv(pred - d.totalRevenue, d.totalRevenue)
        if (isFinite(err)) errs.push(err)
      }
      if (!errs.length) continue
      const mape = errs.reduce((a, e) => a + Math.abs(e), 0) / errs.length
      const bias = errs.reduce((a, e) => a + e, 0) / errs.length
      results.push({ hourSelected, effectiveHour, samples: errs.length, mape, bias })
    }
    return results.length ? results : null
  }, [daySeries, wStats, weekday, includeCurrentHour])

  return (
    <div className="container">
      <header className="header">
        <div>
          <div className="title">Pacing Forecaster</div>
          <div className="subtitle">Weekday-aware intra-day revenue estimate + traffic diagnostics (static, GitHub Pages-ready).</div>
        </div>
        <div className="upload">
          <label className="file">
            <input type="file" accept=".csv,text/csv" onChange={(e)=>onUpload(e.target.files?.[0])} />
            <span>Replace CSV</span>
          </label>
          {rawRows && stats && (
            <div className="hint">
              Loaded <b>{rawRows.length.toLocaleString()}</b> rows • {Object.values(stats).reduce((a,s)=>a+(s?.dayCount||0),0)} days
            </div>
          )}
        </div>
      </header>

      {parseError && <div className="alert alert-bad">{parseError}</div>}

      {!stats && (
        <div className="card">
          <h2>1) Upload your day×hour CSV</h2>
          <p className="muted">
            Expected columns: <code>dh.date</code>, <code>dh.hour</code>, <code>revenue</code>, <code>impressions</code>, <code>clicks</code>, <code>sessions</code>.
            (Case-insensitive; <code>date/hour</code> also accepted.)
          </p>
          <p className="muted">Nothing is sent anywhere — everything is computed in your browser.</p>
        </div>
      )}

      {stats && (
        <>
          <div className="grid">
            <div className="card">
              <h2>Inputs</h2>
              <div className="row">
                <label>Day of week</label>
                <select value={weekday} onChange={(e)=>setWeekday(Number(e.target.value))}>
                  {WEEKDAYS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </div>
              <div className="row">
                <label>Current hour slot</label>
                <input type="number" min="0" max="23" value={hour} onChange={(e)=>setHour(e.target.value)} />
              </div>

              <div className="row">
                <label>Hour interpretation</label>
                <select value={includeCurrentHour ? 'incl' : 'prev'} onChange={(e)=>setIncludeCurrentHour(e.target.value === 'incl')}>
                  <option value="incl">Revenue includes selected hour (0…hour)</option>
                  <option value="prev">Revenue through previous hour (0…hour−1)</option>
                </select>
              </div>
              <div className="row">
                <label>Revenue so far</label>
                <input placeholder="e.g. 18400" value={revSoFar} onChange={(e)=>setRevSoFar(e.target.value)} />
              </div>

              <div className="divider" />

              <div className="row">
                <label>Impressions so far (optional)</label>
                <input placeholder="e.g. 210000" value={imprSoFar} onChange={(e)=>setImprSoFar(e.target.value)} />
              </div>
              <div className="row">
                <label>Clicks so far (optional)</label>
                <input placeholder="e.g. 8200" value={clickSoFar} onChange={(e)=>setClickSoFar(e.target.value)} />
              </div>
              <div className="row">
                <label>Sessions so far (optional)</label>
                <input placeholder="e.g. 54000" value={sessSoFar} onChange={(e)=>setSessSoFar(e.target.value)} />
              </div>

              <div className="hint muted" style={{marginTop: 10}}>
                Baselines are computed from your uploaded data <b>filtered to the selected weekday</b>.
              </div>
            </div>

            <div className="card">
              <h2>Forecast</h2>

              {!forecast && (
                <div className="muted">
                  Enter <b>Revenue so far</b> to see the forecast.
                </div>
              )}

              {forecast && (
                <>
                  <div className="big">
                    <div className="big-label">Estimated end-of-day revenue</div>
                    <div className="big-value">${money(forecast.eod)}</div>
                    <div className="big-range">
                      Range: <b>${money(forecast.low)}</b> – <b>${money(forecast.high)}</b>
                    </div>
                  </div>

                  <div className="kpis">
                    <div className="kpi">
                      <div className="kpi-label">Pacing</div>
                      <div className="kpi-value">
                        <Badge tone={forecast.pacingTone}>{forecast.pacingLabel}</Badge>
                      </div>
                      <div className="kpi-sub muted">
                        Δ ${money(forecast.delta)} ({isFinite(forecast.deltaPct) ? (forecast.deltaPct*100).toFixed(1) : '—'}%)
                      </div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">Expected by now (baseline)</div>
                      <div className="kpi-value">${money(forecast.expectedByNow)}</div>
                      <div className="kpi-sub muted">For this weekday at hour {forecast.hour}</div>
                    </div>
                  </div>

                  {forecast.warnings?.length > 0 && (
                    <div className="warnings">
                      <div className="section-title">Diagnostics</div>
                      {forecast.warnings.map((w, idx)=>(
                        <div key={idx} className={`alert alert-${w.tone}`}>{w.msg}</div>
                      ))}
                      <div className="muted" style={{marginTop: 6}}>
                        This layer is advisory; the forecast is still anchored on revenue completion ratios from your data.
                      </div>
                    </div>
                  )}

                  {forecast.warnings?.length === 0 && (
                    <div className="muted" style={{marginTop: 12}}>
                      No notable traffic/efficiency deviations detected (based on the optional inputs provided).
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="table-head">
              <h2>Backtest (Historical Accuracy)</h2>
              <div className="muted">
                In-sample backtest on the baked-in dataset, computed per selected weekday. Metrics shown are typical absolute % error (MAPE) and bias (avg % over/under).
              </div>
            </div>

            {!backtest && <div className="muted">No backtest available for this weekday.</div>}

            {backtest && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Hour selected</th>
                      <th>Effective hour used</th>
                      <th>Days</th>
                      <th>Typical abs error (MAPE)</th>
                      <th>Bias (avg over/under)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backtest.map(r => (
                      <tr key={r.hourSelected}>
                        <td>{r.hourSelected}</td>
                        <td>{r.effectiveHour}</td>
                        <td>{r.samples}</td>
                        <td>{pct(r.mape, 1)}</td>
                        <td>{isFinite(r.bias) ? `${(r.bias*100).toFixed(1)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <div className="table-head">
              <h2>Expected by Hour</h2>
              <div className="muted">
                Table shows cumulative expectations through each hour. Revenue uses forecasted EOD × weekday curves; ranges use ±1σ on completion/slot share. Traffic is cumulative weekday means.
              </div>
            </div>

            {!forecast && <div className="muted">Enter revenue to populate the table.</div>}

            {forecast && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Hour</th>
                      <th>Expected revenue</th>
                      <th>Range</th>
                      <th>Cumulative impressions</th>
                      <th>Cumulative clicks</th>
                      <th>Cumulative sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.hourRows.map(r => {
                      const isPast = r.hour <= forecast.hour
                      const isCurrent = r.hour === forecast.hour
                      return (
                        <tr key={r.hour} className={`${isPast ? 'past' : ''} ${isCurrent ? 'current' : ''}`.trim()}>
                          <td>{r.hour}</td>
                          <td>${money(r.expCumRev)} <span className="muted">(${money(r.expHourRev)})</span></td>
                          <td className="muted">${money(r.cumLow)} – ${money(r.cumHigh)} <span className="muted">(${money(r.hourLow)} – ${money(r.hourHigh)})</span></td>
                          <td>{int(r.expCumImpr)}</td>
                          <td>{int(r.expCumClicks)}</td>
                          <td>{int(r.expCumSessions)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <footer className="footer muted">
            Tip: this page ships with your current dataset baked in. Use <b>Replace CSV</b> only when you intentionally want to swap datasets (still processed entirely in-browser).
          </footer>
        </>
      )}
    </div>
  )
}
