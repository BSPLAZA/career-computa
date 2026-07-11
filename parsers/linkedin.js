// LinkedIn data export parser. Accepts a folder OR a zip file (detected by PK
// magic bytes, never by filename). Every extractor is optional: a missing or
// malformed file degrades to a status card, never a crash.
//
// Output shape (all arrays may be empty):
// {
//   statusCards: [{ file, status: 'ok'|'missing'|'error', count, note }],
//   profile: { name, headline, summary, industry, location, websites },
//   positions: [...], education: [...], skills: [...],
//   contacts: [...Contact-shaped rows minus ids...],
//   answerBank: [...AnswerBankEntry-shaped rows minus ids...],
//   goalsPrefill: { targetTitles, locations, jobTypes, dreamCompanies, remote },
//   savedJobs: [...], voiceSamples: [{ text, date, conversationTitle }],
//   shares: [...], comments: [...]
// }

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { parseCsvWithHeader } = require('./lib/csv');

const SENSITIVE_RE = /veteran|disab|gender|race|ethnic|orientation|salary|compensation|visa|sponsor|citizen|criminal|felony/i;

function isZip(p) {
  const fd = fs.openSync(p, 'r');
  try {
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    return buf[0] === 0x50 && buf[1] === 0x4b; // PK
  } finally {
    fs.closeSync(fd);
  }
}

// Resolve input to a readable folder. Zips are extracted to a temp dir.
function resolveRoot(inputPath) {
  const st = fs.statSync(inputPath);
  if (st.isDirectory()) return inputPath;
  if (st.isFile() && isZip(inputPath)) {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'li-export-'));
    execFileSync('unzip', ['-o', '-q', inputPath, '-d', dest]);
    return dest;
  }
  throw new Error('Input is neither a directory nor a zip: ' + inputPath);
}

// Find a file case-insensitively, searching root and one level of subfolders.
function findFile(root, relCandidates) {
  for (const rel of relCandidates) {
    const direct = path.join(root, rel);
    if (fs.existsSync(direct)) return direct;
  }
  const wanted = relCandidates.map((r) => path.basename(r).toLowerCase());
  const scan = (dir, depth) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const e of entries) {
      if (e.isFile() && wanted.includes(e.name.toLowerCase())) return path.join(dir, e.name);
      if (e.isDirectory() && depth > 0) {
        const hit = scan(path.join(dir, e.name), depth - 1);
        if (hit) return hit;
      }
    }
    return null;
  };
  return scan(root, 2);
}

function globFiles(root, prefix) {
  const hits = [];
  const scan = (dir, depth) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isFile() && e.name.startsWith(prefix) && e.name.endsWith('.csv')) hits.push(path.join(dir, e.name));
      else if (e.isDirectory() && depth > 0) scan(path.join(dir, e.name), depth - 1);
    }
  };
  scan(root, 2);
  return hits;
}

function readCsvFile(file, skipUntil) {
  const text = fs.readFileSync(file, 'utf8');
  return parseCsvWithHeader(text, skipUntil);
}

function wordCount(s) { return s.split(/\s+/).filter(Boolean).length; }

function parseLinkedInExport(inputPath) {
  const root = resolveRoot(inputPath);
  const statusCards = [];
  const out = {
    statusCards,
    profile: null,
    positions: [],
    education: [],
    skills: [],
    contacts: [],
    answerBank: [],
    goalsPrefill: null,
    savedJobs: [],
    voiceSamples: [],
    shares: [],
    comments: [],
  };

  const run = (label, candidates, fn, opts = {}) => {
    const file = findFile(root, candidates);
    if (!file) { statusCards.push({ file: label, status: 'missing', count: 0, note: 'not found in export' }); return; }
    try {
      const count = fn(file);
      statusCards.push({ file: label, status: 'ok', count, note: opts.note || '' });
    } catch (err) {
      statusCards.push({ file: label, status: 'error', count: 0, note: String(err.message || err).slice(0, 200) });
    }
  };

  // Profile.csv
  run('Profile.csv', ['Profile.csv'], (file) => {
    const { records } = readCsvFile(file);
    if (!records.length) return 0;
    const r = records[0];
    out.profile = {
      name: [r['First Name'], r['Last Name']].filter(Boolean).join(' '),
      headline: r['Headline'] || '',
      summary: r['Summary'] || '',
      industry: r['Industry'] || '',
      location: r['Geo Location'] || '',
      websites: r['Websites'] || '',
    };
    return 1;
  });

  // Positions.csv
  run('Positions.csv', ['Positions.csv'], (file) => {
    const { records } = readCsvFile(file);
    out.positions = records.map((r) => ({
      company: r['Company Name'], title: r['Title'], description: r['Description'],
      location: r['Location'], startedOn: r['Started On'], finishedOn: r['Finished On'],
    })).filter((p) => p.company || p.title);
    return out.positions.length;
  });

  // Education.csv
  run('Education.csv', ['Education.csv'], (file) => {
    const { records } = readCsvFile(file);
    out.education = records.map((r) => ({
      school: r['School Name'], degree: r['Degree Name'], notes: r['Notes'],
      startDate: r['Start Date'], endDate: r['End Date'],
    })).filter((e) => e.school);
    return out.education.length;
  });

  // Skills.csv
  run('Skills.csv', ['Skills.csv'], (file) => {
    const { records } = readCsvFile(file);
    out.skills = records.map((r) => r['Name']).filter(Boolean);
    return out.skills.length;
  });

  // Connections.csv: 3-line Notes preamble; header starts "First Name".
  run('Connections.csv', ['Connections.csv'], (file) => {
    const { records } = readCsvFile(file, (row) => row[0] && row[0].trim() === 'First Name');
    out.contacts = records
      .filter((r) => r['First Name'] || r['Last Name'])
      .map((r) => ({
        firstName: r['First Name'] || '',
        lastName: r['Last Name'] || '',
        profileUrl: r['URL'] || undefined,
        email: r['Email Address'] || undefined,
        company: r['Company'] || '',
        position: r['Position'] || '',
        connectedOn: r['Connected On'] || undefined,
        warmth: 'first_degree',
      }));
    return out.contacts.length;
  });

  // Jobs/Job Applications.csv: Question And Answers column feeds AnswerBank.
  run('Jobs/Job Applications.csv', ['Jobs/Job Applications.csv', 'Job Applications.csv'], (file) => {
    const { records } = readCsvFile(file);
    let added = 0;
    for (const r of records) {
      const qa = r['Question And Answers'];
      if (!qa) continue;
      // Format: "Question:Answer | Question:Answer | ..."
      for (const pair of qa.split(' | ')) {
        const idx = pair.indexOf(':');
        if (idx <= 0) continue;
        const question = pair.slice(0, idx).trim();
        const answer = pair.slice(idx + 1).trim();
        if (!question || !answer || /resume|linkedin profile/i.test(question)) continue;
        out.answerBank.push({ question, answer, source: 'linkedin_export', sensitive: SENSITIVE_RE.test(question) });
        added++;
      }
    }
    return added;
  }, { note: 'Q&A pairs extracted to AnswerBank' });

  // Saved answers + screening responses, both simple Question,Answer files.
  for (const [label, cands] of [
    ['Job Applicant Saved Answers.csv', ['Jobs/Job Applicant Saved Answers.csv', 'Job Applicant Saved Answers.csv']],
    ['Job Applicant Saved Screening Question Responses.csv', ['Job Applicant Saved Screening Question Responses.csv', 'Jobs/Job Applicant Saved Screening Question Responses.csv']],
  ]) {
    run(label, cands, (file) => {
      const { records } = readCsvFile(file);
      let added = 0;
      for (const r of records) {
        if (!r['Question'] || !r['Answer']) continue;
        out.answerBank.push({ question: r['Question'], answer: r['Answer'], source: 'linkedin_export', sensitive: SENSITIVE_RE.test(r['Question']) });
        added++;
      }
      return added;
    });
  }

  // Jobs/Job Seeker Preferences.csv -> goals prefill.
  run('Jobs/Job Seeker Preferences.csv', ['Jobs/Job Seeker Preferences.csv', 'Job Seeker Preferences.csv'], (file) => {
    const { records } = readCsvFile(file);
    if (!records.length) return 0;
    const r = records[0];
    const splitPipes = (s) => (s || '').split('|').map((x) => x.trim()).filter(Boolean);
    out.goalsPrefill = {
      targetTitles: splitPipes(r['Job Titles']),
      locations: splitPipes(r['Locations']),
      jobTypes: splitPipes(r['Preferred Job Types']),
      dreamCompanies: splitPipes(r['Dream Companies']),
      openToRecruiters: r['Open To Recruiters'] === 'Yes',
      urgency: r['Job Seeking Urgency Level'] || '',
      remote: 'flexible',
    };
    return 1;
  });

  // Jobs/Saved Jobs.csv
  run('Jobs/Saved Jobs.csv', ['Jobs/Saved Jobs.csv', 'Saved Jobs.csv'], (file) => {
    const { records } = readCsvFile(file);
    out.savedJobs = records.map((r) => ({
      savedDate: r['Saved Date'], jobUrl: r['Job Url'], title: r['Job Title'], company: r['Company Name'],
    })).filter((j) => j.jobUrl || j.title);
    return out.savedJobs.length;
  });

  // messages.csv: rows FROM the user with CONTENT > 50 words are voice samples.
  run('messages.csv', ['messages.csv'], (file) => {
    const userName = out.profile ? out.profile.name.toLowerCase() : null;
    const { records } = readCsvFile(file);
    for (const r of records) {
      const from = (r['FROM'] || '').trim();
      const content = (r['CONTENT'] || '').trim();
      if (!from || !content) continue;
      const isUser = userName ? from.toLowerCase() === userName : false;
      if (!isUser) continue;
      if (wordCount(content) <= 50) continue;
      out.voiceSamples.push({ text: content, date: r['DATE'] || '', conversationTitle: r['CONVERSATION TITLE'] || '' });
    }
    return out.voiceSamples.length;
  }, { note: 'sent messages over 50 words, used as writing-voice samples' });

  // Shares_*.csv and Comments_*.csv (numeric suffix varies per account).
  for (const [prefix, key] of [['Shares_', 'shares'], ['Comments_', 'comments']]) {
    const files = globFiles(root, prefix);
    if (!files.length) { statusCards.push({ file: prefix + '*.csv', status: 'missing', count: 0, note: 'not found in export' }); continue; }
    for (const file of files) {
      try {
        const { records } = readCsvFile(file);
        for (const r of records) {
          const text = r['ShareCommentary'] || r['Message'] || r['Comment'] || '';
          if (!text.trim()) continue;
          out[key].push({ date: r['Date'] || '', text: text.trim(), link: r['ShareLink'] || r['Link'] || '' });
        }
        statusCards.push({ file: path.basename(file), status: 'ok', count: out[key].length, note: '' });
      } catch (err) {
        statusCards.push({ file: path.basename(file), status: 'error', count: 0, note: String(err.message || err).slice(0, 200) });
      }
    }
  }

  return out;
}

module.exports = { parseLinkedInExport, isZip };
