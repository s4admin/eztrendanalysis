import PDFDocument from 'pdfkit';
import { analyzeTrend, G_POS_LIMIT, G_NEG_LIMIT } from '../analysis/index.js';

// Built-in PDF fonts only cover Latin-1, so stick to plain characters (°, ² and – are fine)
const COLORS = { text: '#0f172a', muted: '#64748b', faint: '#cbd5e1', line: '#0284c7', trend: '#f59e0b', limit: '#dc2626', ok: '#059669', bad: '#dc2626', head: '#f1f5f9' };
const PARAMS = [
  { key: 'itt', label: 'ITT', unit: '°C', limit: 820 },
  { key: 'corrected_itt', label: 'Corrected ITT', unit: '°C' },
  { key: 'ng', label: 'Ng', unit: '%', limit: 104 },
  { key: 'torque', label: 'Torque', unit: '%' },
  { key: 'fuel_flow', label: 'Fuel flow', unit: 'lbs/hr' },
  { key: 'corrected_ff', label: 'Corrected FF', unit: 'lbs/hr' },
];
const CHARTS = ['itt', 'corrected_itt', 'ng', 'fuel_flow'];

const fmt = (v, d = 1) => (v == null || isNaN(v) ? '–' : Number(v).toFixed(d));
const dateOnly = (d) => (d instanceof Date ? d.toISOString() : String(d ?? '')).slice(0, 10);
const signed = (v, d) => (v >= 0 ? '+' : '') + Number(v).toFixed(d);

// Write the trend summary report for one aircraft to a writable stream (e.g. an HTTP response)
export function writeTrendReport(stream, { aircraft, records, exceedances, loadFactorDays, faultSummary }) {
  const doc = new PDFDocument({ size: 'LETTER', margin: 48, info: { Title: `${aircraft.tail_number} Engine Trend Summary`, Author: 'EZ Trend Analysis' } });
  doc.pipe(stream);
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const trend = analyzeTrend(records);

  const ensureSpace = (h) => { if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage(); };
  // Reserve room for the heading plus the start of its content so it isn't stranded at a page bottom
  const heading = (text) => {
    ensureSpace(110);
    doc.moveDown(0.8).font('Helvetica-Bold').fontSize(12).fillColor(COLORS.text).text(text, left, doc.y);
    doc.moveTo(left, doc.y + 2).lineTo(left + width, doc.y + 2).lineWidth(0.5).strokeColor(COLORS.faint).stroke();
    doc.moveDown(0.5);
  };
  const table = (columns, rows) => {
    const cellText = (cell) => (typeof cell === 'object' && cell ? cell.text : String(cell ?? '–'));
    const rowHeight = (cells, bold) => 6 + Math.max(...cells.map((cell, i) =>
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).heightOfString(cellText(cell), { width: columns[i].width - 8 })));
    const drawRow = (cells, y, bold, fill) => {
      const h = rowHeight(cells, bold);
      if (fill) doc.rect(left, y - 3, width, h).fill(fill);
      let x = left;
      cells.forEach((cell, i) => {
        const col = columns[i];
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
          .fillColor(typeof cell === 'object' && cell?.color ? cell.color : bold ? COLORS.muted : COLORS.text)
          .text(cellText(cell), x + 4, y, { width: col.width - 8, align: col.align || 'left' });
        x += col.width;
      });
      return h;
    };
    const header = columns.map(c => c.label);
    const bottom = () => doc.page.height - doc.page.margins.bottom;
    // Keep a table that fits on one page together; otherwise start it with at least a header and one row
    const total = rowHeight(header, true) + rows.reduce((h, row) => h + rowHeight(row, false), 0);
    ensureSpace(total <= bottom() - doc.page.margins.top ? total : rowHeight(header, true) * 2);
    let y = doc.y;
    y += drawRow(header, y, true, COLORS.head);
    for (const row of rows) {
      if (y + rowHeight(row, false) > bottom()) { doc.addPage(); y = doc.y; y += drawRow(header, y, true, COLORS.head); }
      y += drawRow(row, y, false);
    }
    doc.x = left; doc.y = y + 4;
  };

  // ── Header ──
  doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.text).text(`${aircraft.tail_number} — Engine Trend Summary`);
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
    .text(`Generated ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC by EZ Trend Analysis`);
  doc.moveDown(0.8);

  const statusText = { NORMAL: 'TREND NORMAL', ANOMALY: 'TREND ANOMALY' }[trend.status] || 'INSUFFICIENT DATA';
  const statusColor = trend.status === 'NORMAL' ? COLORS.ok : trend.status === 'ANOMALY' ? COLORS.bad : COLORS.muted;
  const boxY = doc.y;
  doc.roundedRect(left + width - 150, boxY, 150, 26, 4).lineWidth(1.5).strokeColor(statusColor).stroke();
  doc.font('Helvetica-Bold').fontSize(11).fillColor(statusColor).text(statusText, left + width - 150, boxY + 8, { width: 150, align: 'center' });

  const first = records[0], last = records[records.length - 1];
  const facts = [
    ['Aircraft', aircraft.make_model || '–'],
    ['Engine', [aircraft.engine_type, aircraft.engine_serial].filter(Boolean).join(' · ') || '–'],
    ['Date range', records.length ? `${dateOnly(first.flight_date)} – ${dateOnly(last.flight_date)}` : '–'],
    ['Stable cruise snapshots', String(records.length)],
  ];
  doc.y = boxY;
  for (const [label, value] of facts) {
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(label, left, doc.y, { continued: true, width: width - 170 })
      .font('Helvetica-Bold').fillColor(COLORS.text).text(`   ${value}`);
  }

  if (!records.length) {
    doc.moveDown().font('Helvetica').fontSize(10).fillColor(COLORS.muted).text('No stable cruise data has been uploaded for this aircraft yet.');
    doc.end();
    return;
  }

  // ── Parameter summary ──
  heading('Parameter summary');
  table(
    [
      { label: 'Parameter', width: 92 }, { label: 'Latest', width: 52, align: 'right' }, { label: 'Mean', width: 52, align: 'right' },
      { label: 'Min', width: 48, align: 'right' }, { label: 'Max', width: 48, align: 'right' }, { label: 'Std dev', width: 46, align: 'right' },
      { label: 'Slope/pt', width: 50, align: 'right' }, { label: 'R²', width: 40, align: 'right' }, { label: 'Trend', width: width - 428 },
    ],
    PARAMS.filter(p => trend.parameters[p.key]).map(p => {
      const t = trend.parameters[p.key];
      const vals = records.map(r => parseFloat(r[p.key])).filter(v => !isNaN(v));
      const trendText = t.isAnomaly ? `${t.trending} (anomaly)` : t.trending;
      return [
        `${p.label} (${p.unit})`, fmt(last[p.key]), fmt(t.mean), fmt(Math.min(...vals)), fmt(Math.max(...vals)), fmt(t.stdDev, 2),
        signed(t.slope, 2), fmt(t.rSquared, 3), { text: trendText, color: t.isAnomaly ? COLORS.bad : t.trending === 'STABLE' ? COLORS.ok : COLORS.text },
      ];
    })
  );

  // ── Trend charts ──
  heading('Long-term trend (stable cruise snapshots)');
  const chartW = (width - 16) / 2, chartH = 120;
  for (let row = 0; row < CHARTS.length; row += 2) {
    ensureSpace(chartH + 30);
    const rowY = doc.y;
    CHARTS.slice(row, row + 2).forEach((key, col) => {
      drawChart(doc, { x: left + col * (chartW + 16), y: rowY, w: chartW, h: chartH, records, param: PARAMS.find(p => p.key === key), regression: trend.parameters[key] });
    });
    doc.x = left; doc.y = rowY + chartH + 26;
  }

  // ── Exceedances ──
  const engineExceedances = exceedances.filter(e => e.parameter !== 'G-Force');
  heading(`Engine exceedances (${engineExceedances.length})`);
  if (!engineExceedances.length) {
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text('None recorded.');
  } else {
    table(
      [{ label: 'Date', width: 80 }, { label: 'Time', width: 60 }, { label: 'Parameter', width: 120 }, { label: 'Peak', width: 70, align: 'right' }, { label: 'Limit', width: 70, align: 'right' }, { label: 'Duration', width: width - 400, align: 'right' }],
      engineExceedances.map(e => [dateOnly(e.flight_date), e.flight_time ?? '–', e.parameter, { text: fmt(e.value), color: COLORS.bad }, fmt(e.limit_value, 0), e.duration_seconds ? `${e.duration_seconds} s` : '–'])
    );
  }

  // ── Load factor ──
  if (loadFactorDays.length) {
    const recent = loadFactorDays.slice(0, 15);
    heading(`Load factor, estimated (${recent.length < loadFactorDays.length ? `latest ${recent.length} of ${loadFactorDays.length} days` : `${loadFactorDays.length} days`})`);
    const gCell = (g) => ({ text: `${signed(g, 2)}g`, color: g > G_POS_LIMIT || g < G_NEG_LIMIT ? COLORS.bad : COLORS.text });
    table(
      [{ label: 'Date', width: 100 }, { label: 'Peak', width: 80, align: 'right' }, { label: 'At', width: 80 }, { label: 'Lowest', width: 80, align: 'right' }, { label: 'At', width: width - 340 }],
      recent.map(d => [d.flight_date, gCell(d.peak_g), d.peak_time ?? '–', gCell(d.low_g), d.low_time ?? '–'])
    );
    const gEvents = exceedances.filter(e => e.parameter === 'G-Force');
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
      .text(`Limits +${G_POS_LIMIT}g / ${G_NEG_LIMIT}g. ${gEvents.length ? `${gEvents.length} limit exceedance(s) recorded.` : 'No limit exceedances recorded.'} Estimated from an undocumented ACMS data column — informational only.`);
  }

  // ── Fault history ──
  if (faultSummary.length) {
    const top = [...faultSummary].sort((a, b) => b.total_events - a.total_events).slice(0, 12);
    heading(`Fault history (top ${top.length} of ${faultSummary.length} codes by events)`);
    table(
      [{ label: 'Sys', width: 32 }, { label: 'Code', width: 40 }, { label: 'System', width: 90 }, { label: 'Description', width: width - 314 }, { label: 'Events', width: 50, align: 'right' }, { label: 'Active', width: 42, align: 'right' }, { label: 'Last seen', width: 60 }],
      top.map(f => [f.system_id, f.fault_code, f.system_name ?? '–', f.description ?? 'Unknown fault code', Number(f.total_events).toLocaleString('en-US'), Number(f.active_events) || '–', dateOnly(f.last_seen)])
    );
  }

  ensureSpace(40);
  doc.moveDown(1).font('Helvetica').fontSize(7.5).fillColor(COLORS.muted)
    .text('Generated from ACMS and CMC data downloaded via the Honeywell MyCMC app. For trend monitoring only — not a substitute for the approved maintenance and flight manuals.', left, doc.y, { width });
  doc.end();
}

function drawChart(doc, { x, y, w, h, records, param, regression }) {
  const vals = records.map(r => parseFloat(r[param.key]));
  const points = vals.map((v, i) => [i, v]).filter(([, v]) => !isNaN(v));
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.text).text(`${param.label} (${param.unit})`, x, y, { width: w, lineBreak: false });
  const top = y + 14, plotH = h - 26, plotX = x + 34, plotW = w - 40;
  if (points.length < 2) {
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text('Not enough data', plotX, top + plotH / 2);
    return;
  }
  let min = Math.min(...points.map(p => p[1])), max = Math.max(...points.map(p => p[1]));
  if (param.limit && param.limit > max && param.limit - max < (max - min) * 1.5 + 5) max = param.limit;
  const pad = (max - min) * 0.08 || 1; min -= pad; max += pad;
  const sx = (i) => plotX + (i / (vals.length - 1)) * plotW;
  const sy = (v) => top + plotH - ((v - min) / (max - min)) * plotH;

  doc.rect(plotX, top, plotW, plotH).lineWidth(0.5).strokeColor(COLORS.faint).stroke();
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted);
  doc.text(fmt(max, 1), x, top - 3, { width: 30, align: 'right' });
  doc.text(fmt(min, 1), x, top + plotH - 5, { width: 30, align: 'right' });
  doc.text(dateOnly(records[0].flight_date), plotX, top + plotH + 3);
  doc.text(dateOnly(records[records.length - 1].flight_date), plotX + plotW - 60, top + plotH + 3, { width: 60, align: 'right' });

  if (param.limit && param.limit <= max && param.limit >= min) {
    doc.moveTo(plotX, sy(param.limit)).lineTo(plotX + plotW, sy(param.limit)).lineWidth(0.8).dash(3, { space: 2 }).strokeColor(COLORS.limit).stroke().undash();
    doc.fontSize(6.5).fillColor(COLORS.limit).text(`limit ${param.limit}`, plotX + plotW - 40, sy(param.limit) - 8, { width: 38, align: 'right' });
  }
  doc.moveTo(sx(points[0][0]), sy(points[0][1]));
  for (const [i, v] of points.slice(1)) doc.lineTo(sx(i), sy(v));
  doc.lineWidth(1).strokeColor(COLORS.line).stroke();
  if (regression) {
    const n = vals.length - 1;
    doc.moveTo(sx(0), sy(regression.intercept)).lineTo(sx(n), sy(regression.intercept + regression.slope * n))
      .lineWidth(0.8).dash(4, { space: 3 }).strokeColor(COLORS.trend).stroke().undash();
  }
}
