/**
 * FutureSchool - PDF Export Service
 * Uses browser print API (window.print) for zero-dependency PDF generation.
 * Produces A4 print-optimised output for Hall Tickets and Report Cards.
 */

interface HallTicketData {
  studentName: string;
  studentId: string;
  className: string;
  section: string;
  schoolName: string;
  schoolCode: string;
  examName: string;
  academicYear: string;
  subjects: Array<{ name: string; date: string; day: string; time: string; room: string }>;
  hallTicketNo: string;
  photoUrl?: string;
}

interface ReportCardData {
  studentName: string;
  studentId: string;
  className: string;
  section: string;
  schoolName: string;
  academicYear: string;
  subjects: Array<{
    name: string;
    fa1: number; fa2: number; fa3: number; fa4: number;
    sa1: number; sa2: number;
    total: number; maxTotal: number;
    grade: string; result: string;
  }>;
  attendance: { present: number; total: number; percentage: number };
  conduct: string;
  classTeacherRemarks: string;
  classTeacherName: string;
  principalName: string;
  publishedDate: string;
  version: string;
}

export const PdfService = {
  /**
   * Generate and print Hall Ticket as PDF
   */
  printHallTicket(data: HallTicketData): void {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Hall Ticket – ${data.studentName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Arial', sans-serif; color: #1e293b; background: white; }
    @page { size: A4; margin: 15mm; }
    .header { text-align: center; border-bottom: 3px double #1e293b; padding-bottom: 12px; margin-bottom: 16px; }
    .school-name { font-size: 20px; font-weight: 900; letter-spacing: 0.5px; }
    .exam-title { font-size: 15px; font-weight: 700; margin: 6px 0 2px; color: #3730a3; }
    .academic-year { font-size: 12px; color: #64748b; }
    .ticket-no { font-size: 11px; color: #64748b; margin-top: 2px; }
    .student-block { display: flex; justify-content: space-between; align-items: flex-start; border: 2px solid #1e293b; padding: 14px; margin-bottom: 16px; border-radius: 4px; }
    .student-info table { border-collapse: collapse; }
    .student-info td { padding: 3px 8px 3px 0; font-size: 12px; }
    .student-info td:first-child { font-weight: 600; color: #475569; width: 120px; }
    .photo-box { width: 90px; height: 110px; border: 2px solid #94a3b8; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #94a3b8; border-radius: 4px; flex-shrink: 0; overflow: hidden; }
    .photo-box img { width: 100%; height: 100%; object-fit: cover; }
    table.schedule { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
    table.schedule th { background: #1e293b; color: white; padding: 8px 10px; text-align: left; font-weight: 600; }
    table.schedule td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }
    table.schedule tr:nth-child(even) td { background: #f8fafc; }
    .signatures { display: flex; justify-content: space-between; margin-top: 24px; padding-top: 12px; border-top: 1px solid #94a3b8; }
    .sig-block { text-align: center; }
    .sig-line { width: 160px; border-top: 1px solid #1e293b; margin: 40px auto 4px; }
    .sig-label { font-size: 11px; color: #475569; font-weight: 600; }
    .instructions { background: #fefce8; border: 1px solid #fbbf24; padding: 10px 14px; border-radius: 4px; margin-bottom: 16px; }
    .instructions h4 { font-size: 11px; font-weight: 700; margin-bottom: 6px; color: #92400e; }
    .instructions ol { padding-left: 16px; }
    .instructions li { font-size: 10px; color: #78350f; margin-bottom: 2px; line-height: 1.4; }
    .watermark { text-align: center; margin-top: 8px; font-size: 10px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="header">
    <div class="school-name">${data.schoolName}</div>
    <div class="exam-title">${data.examName} – Hall Ticket</div>
    <div class="academic-year">Academic Year: ${data.academicYear}</div>
    <div class="ticket-no">Hall Ticket No: ${data.hallTicketNo} &nbsp;|&nbsp; School Code: ${data.schoolCode}</div>
  </div>

  <div class="student-block">
    <div class="student-info">
      <table>
        <tr><td>Student Name</td><td><strong>${data.studentName}</strong></td></tr>
        <tr><td>Student ID</td><td>${data.studentId}</td></tr>
        <tr><td>Class &amp; Section</td><td>${data.className} – ${data.section}</td></tr>
        <tr><td>Hall Ticket No</td><td><strong>${data.hallTicketNo}</strong></td></tr>
        <tr><td>Exam</td><td>${data.examName}</td></tr>
      </table>
    </div>
    <div class="photo-box">
      ${data.photoUrl ? `<img src="${data.photoUrl}" alt="Photo" />` : 'Photo'}
    </div>
  </div>

  <div class="instructions">
    <h4>Instructions to Candidates</h4>
    <ol>
      <li>Report to the examination hall 15 minutes before the scheduled time.</li>
      <li>Carry this hall ticket and a valid school ID to every examination.</li>
      <li>Mobile phones, electronic devices, and unfair means are strictly prohibited.</li>
      <li>Write your Hall Ticket Number on every answer sheet before answering.</li>
      <li>This hall ticket must be preserved till the declaration of final results.</li>
    </ol>
  </div>

  <table class="schedule">
    <thead>
      <tr>
        <th>#</th>
        <th>Subject</th>
        <th>Date</th>
        <th>Day</th>
        <th>Time</th>
        <th>Room</th>
      </tr>
    </thead>
    <tbody>
      ${data.subjects.map((s, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${s.name}</strong></td>
          <td>${s.date}</td>
          <td>${s.day}</td>
          <td>${s.time}</td>
          <td>${s.room}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="signatures">
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-label">Candidate's Signature</div>
    </div>
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-label">Class Teacher</div>
    </div>
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-label">Principal</div>
    </div>
  </div>

  <div class="watermark">Generated by FutureSchool · ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
</body>
</html>`;

    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) return;
    printWin.document.write(html);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); }, 500);
  },

  /**
   * Generate and print Report Card as PDF
   */
  printReportCard(data: ReportCardData): void {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Report Card – ${data.studentName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Arial', sans-serif; color: #1e293b; background: white; }
    @page { size: A4; margin: 12mm; }
    .header { text-align: center; border-bottom: 3px double #1e293b; padding-bottom: 10px; margin-bottom: 14px; }
    .school-name { font-size: 20px; font-weight: 900; }
    .report-title { font-size: 14px; font-weight: 700; color: #3730a3; margin: 4px 0; }
    .student-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; border: 2px solid #1e293b; padding: 10px 14px; margin-bottom: 14px; border-radius: 4px; font-size: 12px; }
    .student-grid .label { color: #64748b; font-weight: 600; }
    table.marks { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 14px; }
    table.marks th { background: #1e293b; color: white; padding: 7px 8px; text-align: center; font-weight: 600; }
    table.marks th:first-child { text-align: left; }
    table.marks td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; }
    table.marks td:first-child { text-align: left; font-weight: 600; }
    table.marks tr:nth-child(even) td { background: #f8fafc; }
    .grade-pass { color: #16a34a; font-weight: 700; }
    .grade-fail { color: #dc2626; font-weight: 700; }
    .summary-row { background: #1e293b !important; color: white; }
    .summary-row td { color: white !important; font-weight: 700; }
    .bottom-section { display: flex; gap: 16px; margin-bottom: 14px; font-size: 12px; }
    .attendance-box { flex: 1; border: 1px solid #94a3b8; padding: 10px; border-radius: 4px; }
    .remarks-box { flex: 2; border: 1px solid #94a3b8; padding: 10px; border-radius: 4px; }
    .box-title { font-weight: 700; color: #475569; margin-bottom: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    .signatures { display: flex; justify-content: space-between; padding-top: 12px; border-top: 1px solid #94a3b8; }
    .sig-block { text-align: center; }
    .sig-line { width: 150px; border-top: 1px solid #1e293b; margin: 36px auto 4px; }
    .sig-label { font-size: 11px; color: #475569; font-weight: 600; }
    .version-badge { text-align: right; font-size: 10px; color: #94a3b8; margin-bottom: 6px; }
    .watermark { text-align: center; margin-top: 8px; font-size: 10px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="header">
    <div class="school-name">${data.schoolName}</div>
    <div class="report-title">Student Progress Report Card – ${data.academicYear}</div>
  </div>
  <div class="version-badge">Version: ${data.version} &nbsp;|&nbsp; Published: ${data.publishedDate}</div>

  <div class="student-grid">
    <div><span class="label">Name:</span> ${data.studentName}</div>
    <div><span class="label">Student ID:</span> ${data.studentId}</div>
    <div><span class="label">Class:</span> ${data.className} – ${data.section}</div>
    <div><span class="label">Academic Year:</span> ${data.academicYear}</div>
  </div>

  <table class="marks">
    <thead>
      <tr>
        <th>Subject</th>
        <th>FA-1<br/>(10)</th>
        <th>FA-2<br/>(10)</th>
        <th>FA-3<br/>(10)</th>
        <th>FA-4<br/>(10)</th>
        <th>SA-1<br/>(80)</th>
        <th>SA-2<br/>(80)</th>
        <th>Total<br/>(100)</th>
        <th>Grade</th>
        <th>Result</th>
      </tr>
    </thead>
    <tbody>
      ${data.subjects.map(s => `
        <tr>
          <td>${s.name}</td>
          <td>${s.fa1 === -1 ? 'AB' : s.fa1}</td>
          <td>${s.fa2 === -1 ? 'AB' : s.fa2}</td>
          <td>${s.fa3 === -1 ? 'AB' : s.fa3}</td>
          <td>${s.fa4 === -1 ? 'AB' : s.fa4}</td>
          <td>${s.sa1 === -1 ? 'AB' : s.sa1}</td>
          <td>${s.sa2 === -1 ? 'AB' : s.sa2}</td>
          <td><strong>${s.total}</strong></td>
          <td>${s.grade}</td>
          <td class="${s.result === 'PASS' ? 'grade-pass' : 'grade-fail'}">${s.result}</td>
        </tr>
      `).join('')}
      <tr class="summary-row">
        <td colspan="7">Grand Total</td>
        <td>${data.subjects.reduce((s, x) => s + x.total, 0)} / ${data.subjects.reduce((s, x) => s + x.maxTotal, 0)}</td>
        <td colspan="2">${((data.subjects.reduce((s, x) => s + x.total, 0) / data.subjects.reduce((s, x) => s + x.maxTotal, 0)) * 100).toFixed(1)}%</td>
      </tr>
    </tbody>
  </table>

  <div class="bottom-section">
    <div class="attendance-box">
      <div class="box-title">Attendance</div>
      <div>Days Present: <strong>${data.attendance.present}</strong></div>
      <div>Working Days: <strong>${data.attendance.total}</strong></div>
      <div>Percentage: <strong>${data.attendance.percentage}%</strong></div>
    </div>
    <div class="remarks-box">
      <div class="box-title">Conduct &amp; Remarks</div>
      <div style="margin-bottom:4px"><strong>Conduct:</strong> ${data.conduct}</div>
      <div><strong>Class Teacher's Remarks:</strong> ${data.classTeacherRemarks}</div>
    </div>
  </div>

  <div class="signatures">
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-label">Parent / Guardian</div>
    </div>
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-label">${data.classTeacherName}<br/>Class Teacher</div>
    </div>
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-label">${data.principalName}<br/>Principal</div>
    </div>
  </div>
  <div class="watermark">Generated by FutureSchool · ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
</body>
</html>`;

    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) return;
    printWin.document.write(html);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); }, 500);
  },

  /**
   * Generate and print an A4 Fee Receipt for online or office counter payments.
   */
  printFeeReceipt(data: {
    receiptNo: string;
    schoolName: string;
    schoolAddress?: string;
    studentName: string;
    studentId: string;
    classLabel?: string;
    paidAt: string;
    method: string;
    amount: number;
    providerRef?: string;
    allocations: Array<{ label: string; amount: number }>;
  }): void {
    const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
    const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Fee Receipt – ${esc(data.receiptNo)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #0f172a; background: #fff; padding: 24px; }
    @page { size: A4; margin: 16mm; }
    .box { max-width: 720px; margin: 0 auto; border: 2px solid #1e293b; border-radius: 8px; padding: 20px; }
    .header { text-align: center; border-bottom: 2px solid #cbd5e1; padding-bottom: 12px; margin-bottom: 16px; }
    .school { font-size: 20px; font-weight: 800; }
    .sub { font-size: 12px; color: #475569; margin-top: 2px; }
    .title { display: inline-block; margin-top: 8px; padding: 4px 12px; background: #1d4ed8; color: #fff; font-size: 12px; font-weight: 700; border-radius: 4px; letter-spacing: 0.6px; text-transform: uppercase; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; font-size: 13px; margin-bottom: 16px; }
    .row { display: flex; justify-content: space-between; border-bottom: 1px dashed #e2e8f0; padding: 4px 0; }
    .lbl { color: #64748b; }
    .val { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0 16px; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
    th { background: #f1f5f9; font-weight: 700; }
    .right { text-align: right; font-variant-numeric: tabular-nums; }
    .total { background: #eff6ff; font-weight: 800; font-size: 14px; }
    .foot { display: flex; justify-content: space-between; margin-top: 28px; font-size: 11px; color: #64748b; }
    .toolbar { max-width: 720px; margin: 0 auto 12px; display: flex; gap: 8px; }
    .toolbar button { min-height: 40px; padding: 0 14px; border-radius: 10px; font: inherit; font-weight: 700; font-size: 13px; cursor: pointer; }
    .toolbar .back { border: 1px solid #cbd5e1; background: #fff; color: #0f172a; }
    .toolbar .print { border: 0; background: #1d4ed8; color: #fff; }
    @media print { .toolbar { display: none; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <button type="button" class="back" onclick="if (window.opener) { window.close(); } else { history.back(); }">&larr; Back</button>
    <button type="button" class="print" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div class="box">
    <div class="header">
      <div class="school">${esc(data.schoolName || 'FutureSchool')}</div>
      ${data.schoolAddress ? `<div class="sub">${esc(data.schoolAddress)}</div>` : ''}
      <div class="title">Official Fee Receipt</div>
    </div>
    <div class="grid">
      <div class="row"><span class="lbl">Receipt No</span><span class="val">${esc(data.receiptNo)}</span></div>
      <div class="row"><span class="lbl">Date</span><span class="val">${esc(new Date(data.paidAt).toLocaleString('en-IN'))}</span></div>
      <div class="row"><span class="lbl">Student</span><span class="val">${esc(data.studentName)}</span></div>
      <div class="row"><span class="lbl">Student ID</span><span class="val">${esc(data.studentId)}</span></div>
      ${data.classLabel ? `<div class="row"><span class="lbl">Class</span><span class="val">${esc(data.classLabel)}</span></div>` : '<div></div>'}
      <div class="row"><span class="lbl">Mode</span><span class="val">${esc(data.method.replace(/_/g, ' '))}</span></div>
    </div>
    <table>
      <thead><tr><th>Particulars / Term Allocation</th><th class="right">Amount Paid</th></tr></thead>
      <tbody>
        ${(data.allocations.length ? data.allocations : [{ label: 'School fee payment', amount: data.amount }]).map(a =>
          `<tr><td>${esc(a.label)}</td><td class="right">${fmt(a.amount)}</td></tr>`
        ).join('')}
        <tr class="total"><td>Total Amount Received</td><td class="right">${fmt(data.amount)}</td></tr>
      </tbody>
    </table>
    <div class="foot">
      <span>${data.providerRef ? `Reference: ${esc(data.providerRef)}` : 'Computer-generated fee receipt'}</span>
      <span>Authorised Signatory · FutureSchool</span>
    </div>
  </div>
</body>
</html>`;
    const printWin = window.open('', '_blank', 'width=820,height=680');
    if (!printWin) return;
    printWin.document.write(html);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); }, 400);
  }
};
