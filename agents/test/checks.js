// checks.js: unit-style checks for the code-enforced gates. Run: node agents/test/checks.js
import { hasEmDash, stripEmDashes, enforceNoteCap, lintArtifact, NOTE_CHAR_CAP } from '../lint.js';
import { applyHardFilters, titleRelevance } from '../intake.js';

let pass = 0; let fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`ok   ${name}`); }
  else { fail++; console.log(`FAIL ${name} ${detail}`); }
}

// em-dash lint
const emDash = String.fromCodePoint(0x2014);
const enDash = String.fromCodePoint(0x2013);
check('detects em dash', hasEmDash(`hello ${emDash} world`));
check('clean text passes', !hasEmDash('hello - world, fine'));
const swept = stripEmDashes(`fast${emDash}moving team`);
check('strips em dash', !hasEmDash(swept), JSON.stringify(swept));
const range = stripEmDashes(`$150${enDash}200K`);
check('en dash range becomes hyphen', range === '$150-200K', JSON.stringify(range));
const linted = lintArtifact(`one ${emDash} two`);
check('lintArtifact gate passes after sweep', linted.gate.pass && !hasEmDash(linted.text));
check('lintArtifact leaves clean text alone', lintArtifact('clean text').text === 'clean text');

// 300-char cap
const short = enforceNoteCap('short note');
check('short note untouched', short.text === 'short note' && !short.truncated);
const long = enforceNoteCap('word '.repeat(100));
check(`long note capped at ${NOTE_CHAR_CAP}`, long.text.length <= NOTE_CHAR_CAP && long.truncated, `len=${long.text.length}`);
const exact = enforceNoteCap('x'.repeat(NOTE_CHAR_CAP));
check('exactly 300 passes untruncated', exact.text.length === NOTE_CHAR_CAP && !exact.truncated);
const overByOne = enforceNoteCap('y'.repeat(NOTE_CHAR_CAP + 1));
check('301 gets cut', overByOne.text.length <= NOTE_CHAR_CAP && overByOne.truncated);

// hard filters
const job = { title: 'Software Engineering Intern', location: 'Tokyo, Japan', isRemote: false, compRange: '$60K - $80K' };
check('title_excludes rejects', applyHardFilters(job, ['title_excludes:intern']).rejected);
check('reject carries reason', /intern/.test(applyHardFilters(job, ['title_excludes:intern']).reason || ''));
check('location_excludes rejects', applyHardFilters(job, ['location_excludes:tokyo']).rejected);
check('remote_required rejects onsite', applyHardFilters(job, ['remote_required']).rejected);
check('remote_required passes unknown', !applyHardFilters({ title: 'PM' }, ['remote_required']).rejected);
check('comp_floor rejects below floor', applyHardFilters(job, ['comp_floor:150000']).rejected);
check('comp_floor passes above floor', !applyHardFilters({ title: 'PM', compRange: '$180K - $220K' }, ['comp_floor:150000']).rejected);
check('title_requires rejects mismatch', applyHardFilters({ title: 'Account Executive' }, ['title_requires:product']).rejected);
check('clean job survives', !applyHardFilters({ title: 'Senior Product Manager', location: 'SF' }, ['title_excludes:intern', 'location_excludes:tokyo']).rejected);
check('keyword fallback rejects', applyHardFilters({ title: 'Contract Recruiter' }, ['recruiter']).rejected);

// title relevance ranking
check('relevance ranks PM over sales', titleRelevance('Senior Product Manager', ['Product Manager']) > titleRelevance('Sales Development Rep', ['Product Manager']));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
