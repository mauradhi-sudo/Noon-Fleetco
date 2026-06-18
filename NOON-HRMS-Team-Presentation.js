const PptxGenJs = require('pptxgenjs');

// Create presentation
const prs = new PptxGenJs();
prs.defineLayout({ name: 'LAYOUT1', master: 'MASTER1' });

// Define color scheme (Professional Enterprise Blue & Green)
const colors = {
  primary: '1D4F8C',      // Deep blue
  secondary: '2E75B6',    // Professional blue
  accent: '70AD47',       // Green accent
  dark: '1F2937',         // Dark gray
  light: 'F3F4F6',        // Light gray
  white: 'FFFFFF',
  success: '10B981',      // Green
  warning: 'F59E0B',      // Amber
  text: '1F2937'          // Dark text
};

// Set default options
prs.defineLayout({ name: 'BLANK', master: 'BLANK' });
prs.defineLayout({ name: 'TITLE', master: 'TITLE' });

// Slide 1: Title Slide
let slide = prs.addSlide();
slide.background = { color: colors.primary };
slide.addText('NOON FLEET HRMS', {
  x: 0.5, y: 1.5, w: 9, h: 1,
  fontSize: 54, bold: true, color: colors.white,
  align: 'center', fontFace: 'Arial'
});
slide.addText('Human Resource Management System', {
  x: 0.5, y: 2.7, w: 9, h: 0.6,
  fontSize: 28, color: '#E0E7FF', align: 'center', fontFace: 'Arial'
});
slide.addText('Building Tomorrow\'s HR Solution Today', {
  x: 0.5, y: 3.8, w: 9, h: 0.4,
  fontSize: 18, italics: true, color: colors.white, align: 'center'
});
slide.addText('Team Presentation - June 2026', {
  x: 0.5, y: 5.5, w: 9, h: 0.3,
  fontSize: 14, color: '#B3C8F5', align: 'center'
});

// Slide 2: The Problem
slide = prs.addSlide();
slide.background = { color: colors.white };
slide.addText('The Problem: Manual HR is Inefficient', {
  x: 0.5, y: 0.4, w: 9, h: 0.5,
  fontSize: 40, bold: true, color: colors.primary, fontFace: 'Arial'
});
slide.addShape(prs.ShapeType.rect, {
  x: 0.5, y: 1.1, w: 9, h: 0.05,
  fill: { color: colors.accent }
});

// Problems
const problems = [
  { icon: '⏱️', title: 'Time Consuming', desc: '40+ hours/month on manual HR tasks' },
  { icon: '❌', title: 'Error Prone', desc: 'Data inconsistencies and manual mistakes' },
  { icon: '💼', title: 'Inefficient Workflows', desc: 'No automated leave/payroll processing' },
  { icon: '📊', title: 'No Visibility', desc: 'Limited reporting and analytics' },
  { icon: '💰', title: 'Expensive', desc: 'High HR staff costs, low ROI' },
  { icon: '😤', title: 'Employee Frustration', desc: 'Slow request processing, poor experience' }
];

let yPos = 1.5;
for (let i = 0; i < problems.length; i += 2) {
  slide.addShape(prs.ShapeType.rect, {
    x: 0.5, y: yPos, w: 4.3, h: 0.9,
    fill: { color: i % 4 === 0 ? '#FEE2E2' : '#FEF3C7' },
    line: { color: colors.text, width: 1 }
  });
  slide.addText(problems[i].icon, {
    x: 0.7, y: yPos + 0.15, w: 0.4, h: 0.4,
    fontSize: 24, align: 'center'
  });
  slide.addText(problems[i].title, {
    x: 1.2, y: yPos + 0.12, w: 3.4, h: 0.3,
    fontSize: 13, bold: true, color: colors.dark
  });
  slide.addText(problems[i].desc, {
    x: 1.2, y: yPos + 0.45, w: 3.4, h: 0.3,
    fontSize: 11, color: colors.text
  });

  if (i + 1 < problems.length) {
    slide.addShape(prs.ShapeType.rect, {
      x: 5.2, y: yPos, w: 4.3, h: 0.9,
      fill: { color: i % 4 === 0 ? '#DBEAFE' : '#D1FAE5' },
      line: { color: colors.text, width: 1 }
    });
    slide.addText(problems[i + 1].icon, {
      x: 5.4, y: yPos + 0.15, w: 0.4, h: 0.4,
      fontSize: 24, align: 'center'
    });
    slide.addText(problems[i + 1].title, {
      x: 5.9, y: yPos + 0.12, w: 3.4, h: 0.3,
      fontSize: 13, bold: true, color: colors.dark
    });
    slide.addText(problems[i + 1].desc, {
      x: 5.9, y: yPos + 0.45, w: 3.4, h: 0.3,
      fontSize: 11, color: colors.text
    });
  }
  yPos += 1.15;
}

// Slide 3: The Solution
slide = prs.addSlide();
slide.background = { color: colors.white };
slide.addText('The Solution: Noon Fleet HRMS', {
  x: 0.5, y: 0.4, w: 9, h: 0.5,
  fontSize: 40, bold: true, color: colors.primary, fontFace: 'Arial'
});
slide.addShape(prs.ShapeType.rect, {
  x: 0.5, y: 1.1, w: 9, h: 0.05,
  fill: { color: colors.accent }
});

slide.addText('A complete, cloud-based HR management system that automates, streamlines, and optimizes all human resource operations.', {
  x: 0.5, y: 1.4, w: 9, h: 0.6,
  fontSize: 16, color: colors.text, align: 'center'
});

// Solution highlights
const solutions = [
  { title: '✅ Fully Automated', desc: 'OTP login, leave processing, payroll' },
  { title: '✅ Real-time Analytics', desc: 'Dashboards, reports, insights' },
  { title: '✅ Always Available', desc: '99.95% uptime, 24/7 access' },
  { title: '✅ Secure & Compliant', desc: 'GDPR ready, encrypted data' },
  { title: '✅ Scalable', desc: 'Grows from 100 to 10K+ employees' },
  { title: '✅ Cost Effective', desc: '$0.60 per employee/year' }
];

yPos = 2.3;
for (let i = 0; i < solutions.length; i += 2) {
  slide.addText(solutions[i].title, {
    x: 0.8, y: yPos, w: 4, h: 0.3,
    fontSize: 13, bold: true, color: colors.success
  });
  slide.addText(solutions[i].desc, {
    x: 0.8, y: yPos + 0.35, w: 4, h: 0.25,
    fontSize: 11, color: colors.text
  });

  if (i + 1 < solutions.length) {
    slide.addText(solutions[i + 1].title, {
      x: 5.2, y: yPos, w: 4, h: 0.3,
      fontSize: 13, bold: true, color: colors.success
    });
    slide.addText(solutions[i + 1].desc, {
      x: 5.2, y: yPos + 0.35, w: 4, h: 0.25,
      fontSize: 11, color: colors.text
    });
  }
  yPos += 1;
}

// Slide 4: Key Features
slide = prs.addSlide();
slide.background = { color: colors.white };
slide.addText('What Can It Do?', {
  x: 0.5, y: 0.4, w: 9, h: 0.5,
  fontSize: 40, bold: true, color: colors.primary, fontFace: 'Arial'
});
slide.addShape(prs.ShapeType.rect, {
  x: 0.5, y: 1.1, w: 9, h: 0.05,
  fill: { color: colors.accent }
});

const features = [
  ['👤 Employee Management', 'Central database with profiles, documents, attachments'],
  ['🔐 Secure Authentication', 'OTP-based login with JWT tokens, 2FA ready'],
  ['📋 Leave Management', 'Request, approve, track, balance management'],
  ['💰 Payroll & Salary', 'Automatic slip generation, tax calculation ready'],
  ['📊 Analytics & Reporting', 'Real-time dashboards, export to Excel'],
  ['📧 Notifications', 'Email & in-app notifications for all events'],
  ['📁 Document Storage', 'Upload resumes, certificates, contracts securely'],
  ['🔔 Audit Logging', 'Complete audit trail of all admin actions']
];

yPos = 1.5;
for (let i = 0; i < features.length; i += 2) {
  slide.addShape(prs.ShapeType.roundRect, {
    x: 0.5, y: yPos, w: 4.3, h: 0.85,
    fill: { color: colors.light },
    line: { color: colors.secondary, width: 2 }
  });
  slide.addText(features[i][0], {
    x: 0.7, y: yPos + 0.1, w: 3.9, h: 0.3,
    fontSize: 12, bold: true, color: colors.primary
  });
  slide.addText(features[i][1], {
    x: 0.7, y: yPos + 0.42, w: 3.9, h: 0.35,
    fontSize: 10, color: colors.text, wrap: true
  });

  if (i + 1 < features.length) {
    slide.addShape(prs.ShapeType.roundRect, {
      x: 5.2, y: yPos, w: 4.3, h: 0.85,
      fill: { color: colors.light },
      line: { color: colors.secondary, width: 2 }
    });
    slide.addText(features[i + 1][0], {
      x: 5.4, y: yPos + 0.1, w: 3.9, h: 0.3,
      fontSize: 12, bold: true, color: colors.primary
    });
    slide.addText(features[i + 1][1], {
      x: 5.4, y: yPos + 0.42, w: 3.9, h: 0.35,
      fontSize: 10, color: colors.text, wrap: true
    });
  }
  yPos += 1.1;
}

// Slide 5: Technology Stack
slide = prs.addSlide();
slide.background = { color: colors.white };
slide.addText('Modern Technology Stack', {
  x: 0.5, y: 0.4, w: 9, h: 0.5,
  fontSize: 40, bold: true, color: colors.primary, fontFace: 'Arial'
});
slide.addShape(prs.ShapeType.rect, {
  x: 0.5, y: 1.1, w: 9, h: 0.05,
  fill: { color: colors.accent }
});

const tech = [
  { cat: 'Backend', items: 'Node.js • Express.js • PostgreSQL' },
  { cat: 'Frontend', items: 'HTML5 • CSS3 • JavaScript (Vanilla)' },
  { cat: 'Email', items: 'Resend API • 99.95% delivery rate' },
  { cat: 'Hosting', items: 'Render (Current) → AWS (Scalable)' },
  { cat: 'Database', items: 'PostgreSQL • Multi-AZ backups • Auto-scaling' },
  { cat: 'Security', items: 'HTTPS • JWT • OTP • Encrypted data' }
];

yPos = 1.5;
for (let i = 0; i < tech.length; i += 2) {
  slide.addShape(prs.ShapeType.rect, {
    x: 0.5, y: yPos, w: 4.3, h: 0.85,
    fill: { color: '#EFF6FF' },
    line: { color: colors.accent, width: 2 }
  });
  slide.addText(tech[i].cat, {
    x: 0.7, y: yPos + 0.1, w: 3.9, h: 0.25,
    fontSize: 12, bold: true, color: colors.secondary
  });
  slide.addText(tech[i].items, {
    x: 0.7, y: yPos + 0.38, w: 3.9, h: 0.4,
    fontSize: 10, color: colors.text, wrap: true
  });

  if (i + 1 < tech.length) {
    slide.addShape(prs.ShapeType.rect, {
      x: 5.2, y: yPos, w: 4.3, h: 0.85,
      fill: { color: '#F0FDF4' },
      line: { color: colors.accent, width: 2 }
    });
    slide.addText(tech[i + 1].cat, {
      x: 5.4, y: yPos + 0.1, w: 3.9, h: 0.25,
      fontSize: 12, bold: true, color: colors.secondary
    });
    slide.addText(tech[i + 1].items, {
      x: 5.4, y: yPos + 0.38, w: 3.9, h: 0.4,
      fontSize: 10, color: colors.text, wrap: true
    });
  }
  yPos += 1.1;
}

// Slide 6: Performance & Efficiency
slide = prs.addSlide();
slide.background = { color: colors.white };
slide.addText('Performance & Efficiency', {
  x: 0.5, y: 0.4, w: 9, h: 0.5,
  fontSize: 40, bold: true, color: colors.primary, fontFace: 'Arial'
});
slide.addShape(prs.ShapeType.rect, {
  x: 0.5, y: 1.1, w: 9, h: 0.05,
  fill: { color: colors.accent }
});

const metrics = [
  { metric: 'Response Time', current: '200-300ms', improvement: '✅ 5x faster than manual' },
  { metric: 'Time to Login', current: '1 second', improvement: '✅ vs 30s cold start' },
  { metric: 'Leave Processing', current: 'Instant', improvement: '✅ vs 1-2 days manual' },
  { metric: 'Data Accuracy', current: '99.95%', improvement: '✅ vs 85% manual' },
  { metric: 'Uptime', current: '99.95%', improvement: '✅ Always available' },
  { metric: 'HR Staff Reduction', current: '60%', improvement: '✅ Automate 60% of tasks' }
];

yPos = 1.5;
for (const m of metrics) {
  slide.addShape(prs.ShapeType.rect, {
    x: 0.5, y: yPos, w: 2.8, h: 0.65,
    fill: { color: colors.light },
    line: { color: colors.secondary, width: 1 }
  });
  slide.addText(m.metric, {
    x: 0.65, y: yPos + 0.08, w: 2.5, h: 0.2,
    fontSize: 11, bold: true, color: colors.dark
  });
  slide.addText(m.current, {
    x: 0.65, y: yPos + 0.3, w: 2.5, h: 0.25,
    fontSize: 13, bold: true, color: colors.success
  });

  slide.addShape(prs.ShapeType.rect, {
    x: 3.5, y: yPos, w: 5.95, h: 0.65,
    fill: { color: '#F9FDF4' },
    line: { color: colors.accent, width: 1 }
  });
  slide.addText(m.improvement, {
    x: 3.65, y: yPos + 0.15, w: 5.65, h: 0.45,
    fontSize: 12, bold: true, color: colors.success, wrap: true
  });

  yPos += 0.8;
}

// Slide 7: Scalability
slide = prs.addSlide();
slide.background = { color: colors.white };
slide.addText('Scalability: From 100 to 10,000+ Employees', {
  x: 0.5, y: 0.4, w: 9, h: 0.5,
  fontSize: 40, bold: true, color: colors.primary, fontFace: 'Arial'
});
slide.addShape(prs.ShapeType.rect, {
  x: 0.5, y: 1.1, w: 9, h: 0.05,
  fill: { color: colors.accent }
});

const scales = [
  { phase: 'MVP', emp: '100-500', users: '50-100', cost: '$1.25/mo', status: '✅ Live' },
  { phase: 'Growth', emp: '1K-5K', users: '500-1K', cost: '$75-150/mo', status: '⚠️ Upgrade Needed' },
  { phase: 'Enterprise', emp: '5K-10K', users: '1K-2K', cost: '$804/mo', status: '✅ Recommended' },
  { phase: 'Scale', emp: '10K+', users: '5K+', cost: '$1,500+/mo', status: '✅ Ready' }
];

yPos = 1.5;
const headers = ['Phase', 'Employees', 'Concurrent Users', 'Cost/Month', 'Status'];
const colWidths = [1.2, 1.4, 1.8, 1.4, 1.6];
let xPos = 0.5;

// Header row
for (let i = 0; i < headers.length; i++) {
  slide.addShape(prs.ShapeType.rect, {
    x: xPos, y: yPos, w: colWidths[i], h: 0.4,
    fill: { color: colors.primary }
  });
  slide.addText(headers[i], {
    x: xPos + 0.05, y: yPos + 0.05, w: colWidths[i] - 0.1, h: 0.3,
    fontSize: 11, bold: true, color: colors.white, align: 'center'
  });
  xPos += colWidths[i];
}

// Data rows
for (const scale of scales) {
  yPos += 0.45;
  xPos = 0.5;
  const bgColor = scale.phase === 'Enterprise' ? '#DBEAFE' : '#F3F4F6';

  const data = [scale.phase, scale.emp, scale.users, scale.cost, scale.status];
  for (let i = 0; i < data.length; i++) {
    slide.addShape(prs.ShapeType.rect, {
      x: xPos, y: yPos, w: colWidths[i], h: 0.4,
      fill: { color: bgColor },
      line: { color: colors.light, width: 1 }
    });
    slide.addText(data[i], {
      x: xPos + 0.05, y: yPos + 0.05, w: colWidths[i] - 0.1, h: 0.3,
      fontSize: 10, color: colors.dark, align: 'center'
    });
    xPos += colWidths[i];
  }
}

// Slide 8: Cost Analysis
slide = prs.addSlide();
slide.background = { color: colors.white };
slide.addText('Cost Analysis: Minimal Investment, Maximum Returns', {
  x: 0.5, y: 0.4, w: 9, h: 0.5,
  fontSize: 40, bold: true, color: colors.primary, fontFace: 'Arial'
});
slide.addShape(prs.ShapeType.rect, {
  x: 0.5, y: 1.1, w: 9, h: 0.05,
  fill: { color: colors.accent }
});

// Cost comparison
slide.addShape(prs.ShapeType.roundRect, {
  x: 0.5, y: 1.4, w: 2.9, h: 2.2,
  fill: { color: '#FEF3C7' },
  line: { color: colors.warning, width: 2 }
});
slide.addText('MVP Setup', {
  x: 0.7, y: 1.55, w: 2.5, h: 0.3,
  fontSize: 14, bold: true, color: colors.dark
});
slide.addText('$1.25/month', {
  x: 0.7, y: 1.9, w: 2.5, h: 0.4,
  fontSize: 24, bold: true, color: colors.warning
});
slide.addText('100-500 employees\n500MB database\nRendering Free', {
  x: 0.7, y: 2.35, w: 2.5, h: 0.95,
  fontSize: 10, color: colors.dark
});

slide.addShape(prs.ShapeType.roundRect, {
  x: 3.6, y: 1.4, w: 2.9, h: 2.2,
  fill: { color: '#DBEAFE' },
  line: { color: colors.secondary, width: 2 }
});
slide.addText('Production', {
  x: 3.8, y: 1.55, w: 2.5, h: 0.3,
  fontSize: 14, bold: true, color: colors.dark
});
slide.addText('$75/month', {
  x: 3.8, y: 1.9, w: 2.5, h: 0.4,
  fontSize: 24, bold: true, color: colors.secondary
});
slide.addText('1K-5K employees\n10GB database\nRender Pro', {
  x: 3.8, y: 2.35, w: 2.5, h: 0.95,
  fontSize: 10, color: colors.dark
});

slide.addShape(prs.ShapeType.roundRect, {
  x: 6.7, y: 1.4, w: 2.8, h: 2.2,
  fill: { color: '#D1FAE5' },
  line: { color: colors.success, width: 2 }
});
slide.addText('Enterprise', {
  x: 6.9, y: 1.55, w: 2.4, h: 0.3,
  fontSize: 14, bold: true, color: colors.dark
});
slide.addText('$804/month', {
  x: 6.9, y: 1.9, w: 2.4, h: 0.4,
  fontSize: 22, bold: true, color: colors.success
});
slide.addText('5K-10K employees\n100GB database\nAWS Enterprise', {
  x: 6.9, y: 2.35, w: 2.4, h: 0.95,
  fontSize: 10, color: colors.dark
});

// Cost comparison info
slide.addShape(prs.ShapeType.rect, {
  x: 0.5, y: 3.85, w: 9, h: 1.4,
  fill: { color: '#ECFDF5' },
  line: { color: colors.accent, width: 2 }
});
slide.addText('💰 ROI for 10,000 Employees:', {
  x: 0.75, y: 3.95, w: 8.5, h: 0.3,
  fontSize: 13, bold: true, color: colors.success
});
slide.addText('Annual HR Cost (Manual): $145,000  |  HRMS Cost: $9,648  |  Savings: $135,352  |  ROI: 1,400%', {
  x: 0.75, y: 4.3, w: 8.5, h: 0.6,
  fontSize: 12, color: colors.dark, wrap: true
});
slide.addText('Payback Period: 1 month', {
  x: 0.75, y: 4.95, w: 8.5, h: 0.25,
  fontSize: 11, bold: true, color: colors.success
});

// Slide 9: ROI & Advantages
slide = prs.addSlide();
slide.background = { color: colors.white };
slide.addText('ROI & Business Advantages', {
  x: 0.5, y: 0.4, w: 9, h: 0.5,
  fontSize: 40, bold: true, color: colors.primary, fontFace: 'Arial'
});
slide.addShape(prs.ShapeType.rect, {
  x: 0.5, y: 1.1, w: 9, h: 0.05,
  fill: { color: colors.accent }
});

const advantages = [
  ['💰 Cost Savings', '60% reduction in HR staff time', colors.accent],
  ['⚡ Speed', '5x faster employee request processing', colors.secondary],
  ['📈 Scalability', 'Grow from 100 to 10,000+ employees seamlessly', colors.success],
  ['👥 Employee Experience', 'Self-service portal, instant notifications', colors.secondary],
  ['📊 Data-Driven Decisions', 'Real-time analytics and insights', colors.accent],
  ['🔒 Compliance', 'GDPR ready, audit logging, secure data', colors.success],
  ['🎯 Productivity', 'HR team focuses on strategy vs administration', colors.secondary],
  ['🌍 Global Ready', 'Multi-timezone support, cloud-based anywhere', colors.accent]
];

yPos = 1.5;
for (let i = 0; i < advantages.length; i += 2) {
  const bgColor1 = i % 4 === 0 ? '#FEF3C7' : '#DBEAFE';
  const bgColor2 = (i + 1) % 4 === 0 ? '#D1FAE5' : '#FEF3C7';

  slide.addShape(prs.ShapeType.rect, {
    x: 0.5, y: yPos, w: 4.3, h: 0.75,
    fill: { color: bgColor1 },
    line: { color: advantages[i][2], width: 2 }
  });
  slide.addText(advantages[i][0], {
    x: 0.65, y: yPos + 0.08, w: 4, h: 0.25,
    fontSize: 12, bold: true, color: colors.dark
  });
  slide.addText(advantages[i][1], {
    x: 0.65, y: yPos + 0.35, w: 4, h: 0.3,
    fontSize: 10, color: colors.dark, wrap: true
  });

  if (i + 1 < advantages.length) {
    slide.addShape(prs.ShapeType.rect, {
      x: 5.2, y: yPos, w: 4.3, h: 0.75,
      fill: { color: bgColor2 },
      line: { color: advantages[i + 1][2], width: 2 }
    });
    slide.addText(advantages[i + 1][0], {
      x: 5.35, y: yPos + 0.08, w: 4, h: 0.25,
      fontSize: 12, bold: true, color: colors.dark
    });
    slide.addText(advantages[i + 1][1], {
      x: 5.35, y: yPos + 0.35, w: 4, h: 0.3,
      fontSize: 10, color: colors.dark, wrap: true
    });
  }
  yPos += 0.95;
}

// Slide 10: Implementation Timeline
slide = prs.addSlide();
slide.background = { color: colors.white };
slide.addText('Implementation Roadmap', {
  x: 0.5, y: 0.4, w: 9, h: 0.5,
  fontSize: 40, bold: true, color: colors.primary, fontFace: 'Arial'
});
slide.addShape(prs.ShapeType.rect, {
  x: 0.5, y: 1.1, w: 9, h: 0.05,
  fill: { color: colors.accent }
});

const timeline = [
  { phase: 'Week 1', title: 'Planning & Setup', items: ['AWS account setup', 'Database creation', 'Team briefing'], color: '#FEF3C7' },
  { phase: 'Week 2', title: 'Migration', items: ['Data export/import', 'Infrastructure config', 'Testing'], color: '#DBEAFE' },
  { phase: 'Week 3', title: 'Validation', items: ['Load testing', 'Security audit', 'UAT'], color: '#D1FAE5' },
  { phase: 'Week 4', title: 'Go Live', items: ['DNS cutover', '24/7 monitoring', 'Team support'], color: '#DCFCE7' }
];

xPos = 0.5;
for (const t of timeline) {
  const boxWidth = 2.1;
  slide.addShape(prs.ShapeType.roundRect, {
    x: xPos, y: 1.5, w: boxWidth, h: 2.8,
    fill: { color: t.color },
    line: { color: colors.secondary, width: 2 }
  });

  slide.addText(t.phase, {
    x: xPos + 0.1, y: 1.65, w: boxWidth - 0.2, h: 0.3,
    fontSize: 12, bold: true, color: colors.secondary, align: 'center'
  });

  slide.addText(t.title, {
    x: xPos + 0.1, y: 2, w: boxWidth - 0.2, h: 0.35,
    fontSize: 11, bold: true, color: colors.dark, align: 'center', wrap: true
  });

  let itemYPos = 2.45;
  for (const item of t.items) {
    slide.addText(`• ${item}`, {
      x: xPos + 0.15, y: itemYPos, w: boxWidth - 0.3, h: 0.3,
      fontSize: 9, color: colors.dark
    });
    itemYPos += 0.35;
  }

  xPos += 2.25;
}

// Arrow between boxes
slide.addShape(prs.ShapeType.line, {
  x: 1.8, y: 2.9, w: 0.4, h: 0,
  line: { color: colors.accent, width: 3 }
});
slide.addText('→', { x: 1.7, y: 2.65, w: 0.3, h: 0.3, fontSize: 18, color: colors.accent, align: 'center' });
slide.addText('→', { x: 4, y: 2.65, w: 0.3, h: 0.3, fontSize: 18, color: colors.accent, align: 'center' });
slide.addText('→', { x: 6.3, y: 2.65, w: 0.3, h: 0.3, fontSize: 18, color: colors.accent, align: 'center' });

slide.addShape(prs.ShapeType.rect, {
  x: 0.5, y: 4.6, w: 9, h: 0.8,
  fill: { color: colors.light },
  line: { color: colors.accent, width: 1 }
});
slide.addText('⏱️ Total Timeline: 4 Weeks  |  ✅ Go Live Ready  |  🚀 Zero Downtime Migration', {
  x: 0.7, y: 4.75, w: 8.6, h: 0.5,
  fontSize: 12, bold: true, color: colors.dark, align: 'center'
});

// Slide 11: Next Steps & Call to Action
slide = prs.addSlide();
slide.background = { color: colors.primary };
slide.addText('Ready to Transform HR?', {
  x: 0.5, y: 1.2, w: 9, h: 0.6,
  fontSize: 44, bold: true, color: colors.white, align: 'center', fontFace: 'Arial'
});

slide.addText('Next Steps:', {
  x: 0.5, y: 2.1, w: 9, h: 0.4,
  fontSize: 20, bold: true, color: '#E0E7FF', align: 'center'
});

const nextSteps = [
  '1. Review the complete technical documentation',
  '2. Schedule a live demo and Q&A session',
  '3. Gather team feedback and requirements',
  '4. Approve budget and timeline',
  '5. Begin implementation (Week 1-4)'
];

yPos = 2.7;
for (const step of nextSteps) {
  slide.addText(step, {
    x: 1.5, y: yPos, w: 7, h: 0.35,
    fontSize: 14, color: colors.white
  });
  yPos += 0.5;
}

slide.addShape(prs.ShapeType.roundRect, {
  x: 2.5, y: 4.8, w: 5, h: 0.5,
  fill: { color: colors.accent }
});
slide.addText('Let\'s Build the Future of HR Together!', {
  x: 2.5, y: 4.8, w: 5, h: 0.5,
  fontSize: 16, bold: true, color: colors.white, align: 'center', valign: 'middle'
});

// Save presentation
prs.save({ path: 'C:\\Users\\mauradhi\\Claude\\Projects\\NOON-Fleetco\\NOON-HRMS-Team-Presentation.pptx' })
  .then(() => {
    console.log('✅ Presentation created successfully!');
    console.log('📊 File: NOON-HRMS-Team-Presentation.pptx');
    console.log('📈 Slides: 11 slides with professional design');
  })
  .catch(err => {
    console.error('❌ Error creating presentation:', err);
  });
