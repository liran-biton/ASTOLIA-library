/*******************************************************
 *  ASTOLIA LIBRARY — Code.gs
 *  Backend logic: Auth, Sessions, Digital Creator, Creator Partnerships
 *******************************************************/

const USERS_SHEET        = 'Users';
const CREATORS_SHEET     = 'Digital Creator';
const BRANCHES_SHEET     = 'Spa Branches';
const BENEFITS_SHEET     = 'Benefits';
const PARTNERSHIPS_SHEET = 'Partnerships';
const LIBRARY_SHEET      = 'Library Content';

const LIBRARY_DRIVE_FOLDER_ID = '1Jrp_IGU5xi873QN1-EHo0qhkHv5r33Vw';
const MAX_IMAGES_PER_PARTNERSHIP = 5;
const MAX_VIDEOS_PER_PARTNERSHIP = 3;

const SESSION_DAYS = 30;   // session length after a successful login

const ROLES = {
  CREATOR: 'Content Creator',
  EDITOR : 'Video Editor',
  ADMIN  : 'Admin'
};

const PARTNERSHIP_STATUS = {
  PENDING  : 'Pending Approval',
  APPROVED : 'Approved',
  CANCELLED: 'Cancelled'
};

/*******************  WEB APP ENTRY  *******************/

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('ASTOLIA library')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/*******************  SHEET HELPERS  *******************/

function getSS() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet(name) {
  const sheet = getSS().getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name);
  return sheet;
}

// Converts a sheet (with header row) into an array of objects.
// Adds a hidden _row property so we can write back to the exact row later.
function sheetToObjects(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => String(h).trim());
  return values.slice(1)
    .map((row, idx) => {
      const obj = { _row: idx + 2 };
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    })
    // ignore fully empty rows
    .filter(o => Object.keys(o).some(k => k !== '_row' && String(o[k]).trim() !== ''));
}

function generateToken() {
  return Utilities.getUuid() + Utilities.getUuid();
}

/*************************  AUTH  ***********************/

function findUserByDisplayName(displayName) {
  const normalized = String(displayName).trim().toLowerCase();
  const users = sheetToObjects(getSheet(USERS_SHEET));
  return users.find(u => String(u['Display Name']).trim().toLowerCase() === normalized) || null;
}

function login(username, password) {
  username = String(username || '').trim();
  password = String(password || '');

  if (!username || !password) {
    return { success: false, message: 'Please enter username and password.' };
  }

  const user = findUserByDisplayName(username);
  if (!user) {
    return { success: false, message: 'Incorrect username or password.' };
  }
  if (String(user.Status).trim().toLowerCase() !== 'active') {
    return { success: false, message: 'Your account is not active. Please contact your administrator.' };
  }
  if (String(user.Password) !== password) {
    return { success: false, message: 'Incorrect username or password.' };
  }

  const token = generateToken();
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const session = {
    email: user.Email,
    displayName: user['Display Name'],
    role: user.Role,
    expires: expires
  };
  PropertiesService.getScriptProperties().setProperty('session_' + token, JSON.stringify(session));

  return {
    success: true,
    token: token,
    expires: expires,
    user: { email: session.email, displayName: session.displayName, role: session.role }
  };
}

function validateSession(token) {
  if (!token) return null;
  const raw = PropertiesService.getScriptProperties().getProperty('session_' + token);
  if (!raw) return null;

  let session;
  try { session = JSON.parse(raw); } catch (e) { return null; }

  if (!session.expires || Date.now() > session.expires) {
    PropertiesService.getScriptProperties().deleteProperty('session_' + token);
    return null;
  }
  return { email: session.email, displayName: session.displayName, role: session.role };
}

function logoutSession(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty('session_' + token);
  return { success: true };
}

function requireSession(token) {
  const user = validateSession(token);
  if (!user) throw new Error('SESSION_EXPIRED');
  return user;
}

function isPrivileged(user) {
  return user.role === ROLES.EDITOR || user.role === ROLES.ADMIN;
}

function requirePrivileged(token) {
  const user = requireSession(token);
  if (!isPrivileged(user)) throw new Error('You do not have permission to perform this action.');
  return user;
}

function parseBool(v) {
  return v === true || String(v).trim().toLowerCase() === 'true' || String(v).trim().toLowerCase() === 'yes';
}

/*******************  DIGITAL CREATOR  ******************/
// Digital Creator sheet columns (in this exact order):
// ProfileID | Name | Email | Phone | City | About | Instagram | Facebook | YouTube | CreatedBy | CreatedAt

function canCreateProfile(user) {
  if (user.role === ROLES.EDITOR || user.role === ROLES.ADMIN) return true;
  if (user.role === ROLES.CREATOR) {
    const items = sheetToObjects(getSheet(CREATORS_SHEET));
    const has = items.some(it => String(it.Email).trim().toLowerCase() === String(user.email).trim().toLowerCase());
    return !has;
  }
  return false;
}

function getDigitalCreators(token, filters) {
  const user = requireSession(token);
  filters = filters || {};

  let items = sheetToObjects(getSheet(CREATORS_SHEET));

  // Content creators only ever see their own profile
  if (user.role === ROLES.CREATOR) {
    items = items.filter(it => String(it.Email).trim().toLowerCase() === String(user.email).trim().toLowerCase());
  }

  if (filters.city) {
    items = items.filter(it => String(it.City).trim().toLowerCase() === String(filters.city).trim().toLowerCase());
  }
  if (filters.search) {
    const q = String(filters.search).trim().toLowerCase();
    items = items.filter(it => String(it.Name).toLowerCase().indexOf(q) !== -1);
  }

  items.sort((a, b) => String(a.Name).localeCompare(String(b.Name)));

  const canEditItem = (it) =>
    (user.role !== ROLES.CREATOR) ||
    (String(it.Email).trim().toLowerCase() === String(user.email).trim().toLowerCase());

  return {
    role: user.role,
    canCreate: canCreateProfile(user),
    items: items.map(it => ({
      id: it.ProfileID,
      name: it.Name || '',
      email: it.Email || '',
      phone: it.Phone || '',
      city: it.City || '',
      about: it.About || '',
      instagram: it.Instagram || '',
      facebook: it.Facebook || '',
      youtube: it.YouTube || '',
      canEdit: canEditItem(it)
    }))
  };
}

function getCitiesList(token) {
  requireSession(token);
  const items = sheetToObjects(getSheet(CREATORS_SHEET));
  const cities = Array.from(new Set(items.map(it => String(it.City || '').trim()).filter(Boolean)));
  cities.sort();
  return cities;
}

function createDigitalCreatorProfile(token, data) {
  const user = requireSession(token);
  data = data || {};

  if (user.role === ROLES.CREATOR) {
    if (!canCreateProfile(user)) {
      throw new Error('You already have a profile. Only one profile is allowed per content creator.');
    }
    data.email = user.email; // creators can only ever create their own profile
  }

  if (!data.name || !String(data.name).trim()) throw new Error('Name is required.');
  if (!data.email || !String(data.email).trim()) throw new Error('Email is required.');

  const sheet = getSheet(CREATORS_SHEET);
  const id = Utilities.getUuid();

  sheet.appendRow([
    id,
    data.name || '',
    data.email || '',
    data.phone || '',
    data.city || '',
    data.about || '',
    data.instagram || '',
    data.facebook || '',
    data.youtube || '',
    user.email,
    new Date()
  ]);

  return { success: true, id: id };
}

function updateDigitalCreatorProfile(token, id, data) {
  const user = requireSession(token);
  data = data || {};

  const sheet = getSheet(CREATORS_SHEET);
  const items = sheetToObjects(sheet);
  const target = items.find(it => it.ProfileID === id);
  if (!target) throw new Error('Profile not found.');

  const isOwner = String(target.Email).trim().toLowerCase() === String(user.email).trim().toLowerCase();
  const isPrivileged = (user.role === ROLES.EDITOR || user.role === ROLES.ADMIN);
  if (!isOwner && !isPrivileged) {
    throw new Error('You do not have permission to edit this profile.');
  }
  if (!data.name || !String(data.name).trim()) throw new Error('Name is required.');

  const row = target._row;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  function setCell(col, value) {
    const c = headers.indexOf(col) + 1;
    if (c > 0) sheet.getRange(row, c).setValue(value);
  }

  setCell('Name', data.name || '');
  if (user.role !== ROLES.CREATOR) setCell('Email', data.email || target.Email); // creators cannot change their own login email
  setCell('Phone', data.phone || '');
  setCell('City', data.city || '');
  setCell('About', data.about || '');
  setCell('Instagram', data.instagram || '');
  setCell('Facebook', data.facebook || '');
  setCell('YouTube', data.youtube || '');

  return { success: true };
}

/*******************  SPA BRANCHES  *********************/
// Spa Branches sheet columns:
// BranchID | Branch Name | Address | Operating Hours | Contact Person |
// Swedish Massage | Reflexology | Pool Area | Jacuzzi | Sauna | Status
// (Admin + Video Editor only)

function mapBranch(it) {
  return {
    id: it.BranchID,
    name: it['Branch Name'] || '',
    address: it.Address || '',
    hours: it['Operating Hours'] || '',
    contact: it['Contact Person'] || '',
    swedishMassage: parseBool(it['Swedish Massage']),
    reflexology: parseBool(it['Reflexology']),
    poolArea: parseBool(it['Pool Area']),
    jacuzzi: parseBool(it['Jacuzzi']),
    sauna: parseBool(it['Sauna']),
    status: it.Status || 'Active'
  };
}

function getSpaBranches(token) {
  requirePrivileged(token);
  const items = sheetToObjects(getSheet(BRANCHES_SHEET));
  items.sort((a, b) => String(a['Branch Name']).localeCompare(String(b['Branch Name'])));
  return items.map(mapBranch);
}

function getActiveSpaBranchesList(token) {
  requirePrivileged(token);
  const items = sheetToObjects(getSheet(BRANCHES_SHEET))
    .filter(it => String(it.Status).trim().toLowerCase() === 'active');
  items.sort((a, b) => String(a['Branch Name']).localeCompare(String(b['Branch Name'])));
  return items.map(mapBranch);
}

function createSpaBranch(token, data) {
  requirePrivileged(token);
  data = data || {};
  if (!data.name || !String(data.name).trim()) throw new Error('Branch name is required.');

  const sheet = getSheet(BRANCHES_SHEET);
  const id = Utilities.getUuid();
  sheet.appendRow([
    id,
    data.name || '',
    data.address || '',
    data.hours || '',
    data.contact || '',
    !!data.swedishMassage,
    !!data.reflexology,
    !!data.poolArea,
    !!data.jacuzzi,
    !!data.sauna,
    data.status || 'Active'
  ]);
  return { success: true, id: id };
}

function updateSpaBranch(token, id, data) {
  requirePrivileged(token);
  data = data || {};
  if (!data.name || !String(data.name).trim()) throw new Error('Branch name is required.');

  const sheet = getSheet(BRANCHES_SHEET);
  const items = sheetToObjects(sheet);
  const target = items.find(it => it.BranchID === id);
  if (!target) throw new Error('Branch not found.');

  const row = target._row;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  function setCell(col, value) {
    const c = headers.indexOf(col) + 1;
    if (c > 0) sheet.getRange(row, c).setValue(value);
  }

  setCell('Branch Name', data.name || '');
  setCell('Address', data.address || '');
  setCell('Operating Hours', data.hours || '');
  setCell('Contact Person', data.contact || '');
  setCell('Swedish Massage', !!data.swedishMassage);
  setCell('Reflexology', !!data.reflexology);
  setCell('Pool Area', !!data.poolArea);
  setCell('Jacuzzi', !!data.jacuzzi);
  setCell('Sauna', !!data.sauna);
  setCell('Status', data.status || 'Active');

  return { success: true };
}

/*******************  BENEFITS PACKAGE  *****************/
// Benefits sheet columns: BenefitID | Treatment | Duration | Status
// (Admin + Video Editor only)

function mapBenefit(it) {
  return {
    id: it.BenefitID,
    treatment: it.Treatment || '',
    duration: it.Duration || '',
    status: it.Status || 'Active'
  };
}

function getBenefits(token) {
  requirePrivileged(token);
  const items = sheetToObjects(getSheet(BENEFITS_SHEET));
  items.sort((a, b) => String(a.Treatment).localeCompare(String(b.Treatment)));
  return items.map(mapBenefit);
}

function getActiveBenefitsList(token) {
  requirePrivileged(token);
  const items = sheetToObjects(getSheet(BENEFITS_SHEET))
    .filter(it => String(it.Status).trim().toLowerCase() === 'active');
  items.sort((a, b) => String(a.Treatment).localeCompare(String(b.Treatment)));
  return items.map(mapBenefit);
}

function createBenefit(token, data) {
  requirePrivileged(token);
  data = data || {};
  if (!data.treatment || !String(data.treatment).trim()) throw new Error('Treatment name is required.');
  if (!data.duration || !String(data.duration).trim()) throw new Error('Duration is required.');

  const sheet = getSheet(BENEFITS_SHEET);
  const id = Utilities.getUuid();
  sheet.appendRow([id, data.treatment, data.duration, data.status || 'Active']);
  return { success: true, id: id };
}

function updateBenefit(token, id, data) {
  requirePrivileged(token);
  data = data || {};
  if (!data.treatment || !String(data.treatment).trim()) throw new Error('Treatment name is required.');
  if (!data.duration || !String(data.duration).trim()) throw new Error('Duration is required.');

  const sheet = getSheet(BENEFITS_SHEET);
  const items = sheetToObjects(sheet);
  const target = items.find(it => it.BenefitID === id);
  if (!target) throw new Error('Benefit not found.');

  const row = target._row;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  function setCell(col, value) {
    const c = headers.indexOf(col) + 1;
    if (c > 0) sheet.getRange(row, c).setValue(value);
  }

  setCell('Treatment', data.treatment || '');
  setCell('Duration', data.duration || '');
  setCell('Status', data.status || 'Active');

  return { success: true };
}

/*******************  CONTENT CREATORS LIST  ************/
// Used to populate the creator dropdown when building a new partnership.
// Sourced from the Digital Creator sheet (actual creator profiles), not the
// Users login sheet — a creator can have a profile without necessarily being
// a system login user, and every profile should be selectable here.

function getContentCreatorsList(token) {
  requirePrivileged(token);
  const profiles = sheetToObjects(getSheet(CREATORS_SHEET));

  const seen = {};
  const list = [];
  profiles.forEach(p => {
    const email = String(p.Email || '').trim();
    if (!email) return;
    const key = email.toLowerCase();
    if (seen[key]) return; // dedupe in case of duplicate profiles for the same email
    seen[key] = true;
    list.push({ email: email, name: p.Name || email });
  });

  list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return list;
}

/*******************  CREATOR PARTNERSHIPS  *************/
// Partnerships sheet columns:
// PartnershipID | CreatorEmail | CreatorName | BranchID | BranchName | VisitDate | VisitTime |
// PeopleCount | Benefits | Posts | Reels | Stories | UploadDeadline | Status |
// CreatedBy | CreatedAt | HealthConfirmed | PregnancyDeclaration | ApprovedAt | CancelledBy | CancelledAt

function createPartnership(token, data) {
  const user = requirePrivileged(token);
  data = data || {};

  if (!data.creatorEmail) throw new Error('Please select a content creator.');
  if (!data.branchId) throw new Error('Please select a spa branch.');
  if (!data.visitDate) throw new Error('Please select a visit date.');
  if (!data.peopleCount || Number(data.peopleCount) < 1) throw new Error('Number of people must be at least 1.');
  if (!data.uploadDeadline) throw new Error('Please select an upload deadline.');

  const creator = getContentCreatorsList(token).find(c => c.email === data.creatorEmail);
  if (!creator) throw new Error('Selected content creator was not found or is inactive.');

  const branch = getActiveSpaBranchesList(token).find(b => b.id === data.branchId);
  if (!branch) throw new Error('Selected spa branch is not available.');

  const benefitsText = Array.isArray(data.benefits) ? data.benefits.join(', ') : '';
  const visitDateObj = new Date(data.visitDate + 'T00:00:00');

  const sheet = getSheet(PARTNERSHIPS_SHEET);
  const id = Utilities.getUuid();
  sheet.appendRow([
    id,
    creator.email,
    creator.name,
    branch.id,
    branch.name,
    visitDateObj,
    data.visitTime || '',
    Number(data.peopleCount),
    benefitsText,
    Number(data.posts) || 0,
    Number(data.reels) || 0,
    Number(data.stories) || 0,
    data.uploadDeadline,
    PARTNERSHIP_STATUS.PENDING,
    user.email,
    new Date(),
    false,
    '',
    '',
    '',
    ''
  ]);

  return { success: true, id: id };
}

// Safely turns a sheet date value (Date object, ISO/US string, or blank) into
// 'yyyy-MM-dd', never throwing — a bad/blank value just becomes ''.
function safeDateStr(value) {
  if (!value) return '';
  try {
    const d = (value instanceof Date) ? value : new Date(value);
    if (isNaN(d.getTime())) return '';
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  } catch (e) {
    return '';
  }
}

// Visit time can come back from Sheets either as plain text ("12:22") or,
// if the column auto-formatted as a time/date, as a Date object — this
// normalizes either case to a clean 'HH:mm' string.
function safeTimeStr(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'HH:mm');
  }
  return String(value).trim();
}

// Builds a { PartnershipID: { images, videos } } lookup from the Library
// Content sheet in a single read, so getPartnerships doesn't re-query per row.
function getContentCountsMap() {
  const items = sheetToObjects(getSheet(LIBRARY_SHEET));
  const map = {};
  items.forEach(it => {
    const pid = String(it.PartnershipID || '');
    if (!pid) return;
    if (!map[pid]) map[pid] = { images: 0, videos: 0 };
    if (it.ContentType === 'Image') map[pid].images++;
    else if (it.ContentType === 'Video') map[pid].videos++;
  });
  return map;
}

function mapPartnership(it, user, contentCounts) {
  const privileged = isPrivileged(user);
  const status = String(it.Status || '').trim();
  const creatorEmail = String(it.CreatorEmail || '').trim().toLowerCase();
  const isOwner = creatorEmail === String(user.email || '').trim().toLowerCase();
  const counts = contentCounts || { images: 0, videos: 0 };

  return {
    id: String(it.PartnershipID || ''),
    creatorEmail: String(it.CreatorEmail || ''),
    creatorName: String(it.CreatorName || ''),
    branchName: String(it.BranchName || ''),
    visitDate: safeDateStr(it.VisitDate),
    visitTime: safeTimeStr(it.VisitTime),
    peopleCount: Number(it.PeopleCount) || 0,
    benefits: String(it.Benefits || ''),
    posts: Number(it.Posts) || 0,
    reels: Number(it.Reels) || 0,
    stories: Number(it.Stories) || 0,
    uploadDeadline: String(it.UploadDeadline || ''),
    status: status,
    healthConfirmed: parseBool(it.HealthConfirmed),
    pregnancyDeclaration: String(it.PregnancyDeclaration || ''),
    approvedAt: safeDateStr(it.ApprovedAt),
    cancelledBy: String(it.CancelledBy || ''),
    canCancel: privileged && status !== PARTNERSHIP_STATUS.CANCELLED,
    canApprove: !privileged && isOwner && status === PARTNERSHIP_STATUS.PENDING,
    canUploadContent: !privileged && isOwner && status === PARTNERSHIP_STATUS.APPROVED,
    contentImages: counts.images,
    contentVideos: counts.videos,
    maxImages: MAX_IMAGES_PER_PARTNERSHIP,
    maxVideos: MAX_VIDEOS_PER_PARTNERSHIP
  };
}

function getPartnerships(token, filters) {
  const user = requireSession(token);
  filters = filters || {};

  let items = sheetToObjects(getSheet(PARTNERSHIPS_SHEET));

  if (user.role === ROLES.CREATOR) {
    items = items.filter(it => String(it.CreatorEmail || '').trim().toLowerCase() === String(user.email || '').trim().toLowerCase());
  }

  if (filters.date) {
    // a specific date was picked — this takes priority over the status filter
    items = items.filter(it => safeDateStr(it.VisitDate) === filters.date);
  } else {
    const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const statusFilter = filters.statusFilter || 'upcoming';

    if (statusFilter === 'upcoming') {
      items = items.filter(it => safeDateStr(it.VisitDate) >= todayStr && String(it.Status || '').trim() !== PARTNERSHIP_STATUS.CANCELLED);
    } else if (statusFilter === 'past') {
      items = items.filter(it => safeDateStr(it.VisitDate) < todayStr && String(it.Status || '').trim() !== PARTNERSHIP_STATUS.CANCELLED);
    } else if (statusFilter === 'cancelled') {
      items = items.filter(it => String(it.Status || '').trim() === PARTNERSHIP_STATUS.CANCELLED);
    }
    // statusFilter === 'all' -> no extra filtering
  }

  items.sort((a, b) => safeDateStr(a.VisitDate).localeCompare(safeDateStr(b.VisitDate)));

  const countsMap = getContentCountsMap();
  return items.map(it => mapPartnership(it, user, countsMap[String(it.PartnershipID || '')]));
}

function approvePartnership(token, id, data) {
  const user = requireSession(token);
  data = data || {};

  if (user.role !== ROLES.CREATOR) throw new Error('Only content creators can approve a partnership.');
  if (!data.healthConfirmed) throw new Error('Please confirm both declarations to continue.');
  if (data.pregnancyDeclaration !== 'Yes' && data.pregnancyDeclaration !== 'No') {
    throw new Error('Please indicate the pregnancy declaration.');
  }

  const sheet = getSheet(PARTNERSHIPS_SHEET);
  const items = sheetToObjects(sheet);
  const target = items.find(it => it.PartnershipID === id);
  if (!target) throw new Error('Partnership not found.');

  if (String(target.CreatorEmail).trim().toLowerCase() !== String(user.email).trim().toLowerCase()) {
    throw new Error('You do not have permission to approve this partnership.');
  }
  if (target.Status !== PARTNERSHIP_STATUS.PENDING) {
    throw new Error('This partnership can no longer be approved.');
  }

  const row = target._row;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  function setCell(col, value) {
    const c = headers.indexOf(col) + 1;
    if (c > 0) sheet.getRange(row, c).setValue(value);
  }

  setCell('Status', PARTNERSHIP_STATUS.APPROVED);
  setCell('HealthConfirmed', true);
  setCell('PregnancyDeclaration', data.pregnancyDeclaration);
  setCell('ApprovedAt', new Date());

  return { success: true };
}

function cancelPartnership(token, id) {
  const user = requirePrivileged(token);

  const sheet = getSheet(PARTNERSHIPS_SHEET);
  const items = sheetToObjects(sheet);
  const target = items.find(it => it.PartnershipID === id);
  if (!target) throw new Error('Partnership not found.');
  if (target.Status === PARTNERSHIP_STATUS.CANCELLED) throw new Error('This partnership is already cancelled.');

  const row = target._row;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  function setCell(col, value) {
    const c = headers.indexOf(col) + 1;
    if (c > 0) sheet.getRange(row, c).setValue(value);
  }

  setCell('Status', PARTNERSHIP_STATUS.CANCELLED);
  setCell('CancelledBy', user.email);
  setCell('CancelledAt', new Date());

  return { success: true };
}

function getPendingApprovalCount(token) {
  const user = requireSession(token);
  if (user.role !== ROLES.CREATOR) return 0;
  const items = sheetToObjects(getSheet(PARTNERSHIPS_SHEET));
  return items.filter(it =>
    String(it.CreatorEmail).trim().toLowerCase() === String(user.email).trim().toLowerCase() &&
    it.Status === PARTNERSHIP_STATUS.PENDING
  ).length;
}

/*******************  AI CONTENT ANALYSIS  **************/
// Calls Claude (Anthropic Messages API) to analyze an uploaded photo — or,
// for a video, 3 frames captured client-side — and returns a structured
// set of fields for the Library Content sheet. The API key lives in
// Script Properties as ANTHROPIC_API_KEY (never in code).

const AI_SCENE_TYPES = ['Massage', 'Pool', 'Jacuzzi', 'Sauna', 'Reception', 'Treatment', 'Other'];
const AI_MOOD_TAGS = ['Relaxing', 'Luxurious', 'Energetic', 'Cozy', 'Bright', 'Romantic', 'Natural'];

function buildAiAnalysisPrompt_() {
  return 'You are analyzing marketing content for a spa business. ' +
    'The image(s) attached show a single piece of content — for a video these are several frames sampled from the same clip, so treat them together as one item. ' +
    'Return ONLY a valid JSON object, with no extra text before or after it and no markdown code fences, in exactly this shape:\n' +
    '{\n' +
    '  "sceneType": one value from ' + JSON.stringify(AI_SCENE_TYPES) + ',\n' +
    '  "qualityScore": integer from 1 to 5 rating technical quality (focus, lighting, framing),\n' +
    '  "moodTags": array of 1 to 3 values from ' + JSON.stringify(AI_MOOD_TAGS) + ',\n' +
    '  "description": a short factual 1-2 sentence description in English,\n' +
    '  "suggestedCaption": a short marketing-ready caption in English,\n' +
    '  "keywords": array of 4 to 6 short search keywords in English\n' +
    '}';
}

function parseAiAnalysisJson_(text) {
  let clean = String(text || '').trim();
  clean = clean.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const parsed = JSON.parse(clean);

  return {
    sceneType: AI_SCENE_TYPES.indexOf(parsed.sceneType) !== -1 ? parsed.sceneType : String(parsed.sceneType || ''),
    qualityScore: Number(parsed.qualityScore) || '',
    moodTags: Array.isArray(parsed.moodTags) ? parsed.moodTags.join(', ') : '',
    description: String(parsed.description || ''),
    suggestedCaption: String(parsed.suggestedCaption || ''),
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.join(', ') : ''
  };
}

function callClaudeVision_(imageBlocks) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY in Script Properties.');

  const content = imageBlocks.concat([{ type: 'text', text: buildAiAnalysisPrompt_() }]);

  const payload = {
    model: 'claude-sonnet-4-6',
    max_tokens: 700,
    messages: [{ role: 'user', content: content }]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
  const code = response.getResponseCode();
  const body = JSON.parse(response.getContentText());

  if (code !== 200) {
    const msg = (body && body.error && body.error.message) ? body.error.message : ('HTTP ' + code);
    throw new Error('Claude API error: ' + msg);
  }

  const text = (body.content && body.content[0] && body.content[0].text) ? body.content[0].text : '';
  return parseAiAnalysisJson_(text);
}

// f: { mimeType, base64 (the file itself), frames: [base64,...] (video only), contentType }
function analyzeContentWithAI_(f) {
  let imageBlocks;

  if (f.contentType === 'Video' && Array.isArray(f.frames) && f.frames.length) {
    imageBlocks = f.frames.map(b64 => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: b64 }
    }));
  } else {
    imageBlocks = [{
      type: 'image',
      source: { type: 'base64', media_type: f.mimeType || 'image/jpeg', data: f.base64 }
    }];
  }

  return callClaudeVision_(imageBlocks);
}

/*******************  LIBRARY CONTENT (UPLOADS)  ********/
// Library Content sheet columns:
// ContentID | PartnershipID | CreatorEmail | CreatorName | BranchID | BranchName |
// VisitDate | ContentType | FileName | DriveFileId | FileUrl | UploadedAt | UploadedBy |
// AI Scene Type | AI Quality Score | AI Mood Tags | AI Description | AI Suggested Caption |
// AI Keywords | AI Analysis Status | AI Analyzed At
//
// Files are uploaded by the content creator (after approving the partnership),
// stored in a per-partnership subfolder inside LIBRARY_DRIVE_FOLDER_ID, and
// indexed here so The Library tab can filter/browse them without touching Drive.

function sanitizeFolderName(name) {
  return String(name || 'Untitled').replace(/[\/\\:*?"<>|]/g, '-').trim().slice(0, 120) || 'Untitled';
}

function getOrCreatePartnershipFolder(partnership) {
  const parent = DriveApp.getFolderById(LIBRARY_DRIVE_FOLDER_ID);
  const folderName = sanitizeFolderName(
    (partnership.CreatorName || 'Creator') + ' - ' +
    safeDateStr(partnership.VisitDate) + ' - ' +
    (partnership.BranchName || 'Branch')
  );
  const existing = parent.getFoldersByName(folderName);
  if (existing.hasNext()) return existing.next();
  return parent.createFolder(folderName);
}

function getPartnershipContentSummary(token, partnershipId) {
  requireSession(token);
  const items = sheetToObjects(getSheet(LIBRARY_SHEET)).filter(it => String(it.PartnershipID) === String(partnershipId));
  return {
    images: items.filter(it => it.ContentType === 'Image').length,
    videos: items.filter(it => it.ContentType === 'Video').length,
    maxImages: MAX_IMAGES_PER_PARTNERSHIP,
    maxVideos: MAX_VIDEOS_PER_PARTNERSHIP
  };
}

// files: [{ name, mimeType, base64, contentType: 'Image'|'Video' }, ...]
function uploadPartnershipContent(token, partnershipId, files) {
  const user = requireSession(token);
  if (user.role !== ROLES.CREATOR) throw new Error('Only content creators can upload content.');

  files = Array.isArray(files) ? files : [];
  if (!files.length) throw new Error('Please select at least one file to upload.');

  const badType = files.find(f => f.contentType !== 'Image' && f.contentType !== 'Video');
  if (badType) throw new Error('Unknown content type for file: ' + badType.name);

  const partnerships = sheetToObjects(getSheet(PARTNERSHIPS_SHEET));
  const partnership = partnerships.find(it => String(it.PartnershipID) === String(partnershipId));
  if (!partnership) throw new Error('Partnership not found.');

  if (String(partnership.CreatorEmail || '').trim().toLowerCase() !== String(user.email || '').trim().toLowerCase()) {
    throw new Error('You do not have permission to upload content for this partnership.');
  }
  if (String(partnership.Status || '').trim() !== PARTNERSHIP_STATUS.APPROVED) {
    throw new Error('You can upload content only after approving the partnership.');
  }

  const librarySheet = getSheet(LIBRARY_SHEET);
  const existing = sheetToObjects(librarySheet).filter(it => String(it.PartnershipID) === String(partnershipId));
  const existingImages = existing.filter(it => it.ContentType === 'Image').length;
  const existingVideos = existing.filter(it => it.ContentType === 'Video').length;

  const newImages = files.filter(f => f.contentType === 'Image').length;
  const newVideos = files.filter(f => f.contentType === 'Video').length;

  if (existingImages + newImages > MAX_IMAGES_PER_PARTNERSHIP) {
    throw new Error('You can upload up to ' + MAX_IMAGES_PER_PARTNERSHIP + ' photos per partnership (' + existingImages + ' already uploaded).');
  }
  if (existingVideos + newVideos > MAX_VIDEOS_PER_PARTNERSHIP) {
    throw new Error('You can upload up to ' + MAX_VIDEOS_PER_PARTNERSHIP + ' videos per partnership (' + existingVideos + ' already uploaded).');
  }

  const folder = getOrCreatePartnershipFolder(partnership);

  files.forEach(f => {
    if (!f.base64 || !f.name) return;
    const bytes = Utilities.base64Decode(f.base64);
    const blob = Utilities.newBlob(bytes, f.mimeType || 'application/octet-stream', f.name);
    const file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* sharing restricted by domain policy — file still saved */ }

    librarySheet.appendRow([
      Utilities.getUuid(),
      partnershipId,
      partnership.CreatorEmail,
      partnership.CreatorName,
      partnership.BranchID,
      partnership.BranchName,
      partnership.VisitDate,
      f.contentType,
      f.name,
      file.getId(),
      file.getUrl(),
      new Date(),
      user.email,
      '', '', '', '', '', '', // AI Scene Type..AI Keywords — filled in below
      'Pending',
      ''
    ]);

    const rowNum = librarySheet.getLastRow();

    try {
      const analysis = analyzeContentWithAI_(f);
      librarySheet.getRange(rowNum, 14, 1, 8).setValues([[
        analysis.sceneType,
        analysis.qualityScore,
        analysis.moodTags,
        analysis.description,
        analysis.suggestedCaption,
        analysis.keywords,
        'Completed',
        new Date()
      ]]);
    } catch (aiError) {
      const errMsg = 'ERROR: ' + ((aiError && aiError.message) ? aiError.message : String(aiError));
      librarySheet.getRange(rowNum, 14, 1, 8).setValues([[
        '', '', '', errMsg, '', '', 'Failed', new Date()
      ]]);
    }
  });

  return getPartnershipContentSummary(token, partnershipId);
}

/*******************  THE LIBRARY (browse/filter)  ******/
// (Admin + Video Editor only)

function getLibraryFilterOptions(token) {
  requirePrivileged(token);
  const items = sheetToObjects(getSheet(LIBRARY_SHEET));

  const creators = {};
  const branches = {};
  items.forEach(it => {
    const email = String(it.CreatorEmail || '').trim();
    if (email) creators[email] = it.CreatorName || email;
    const bId = String(it.BranchID || '').trim();
    if (bId) branches[bId] = it.BranchName || bId;
  });

  return {
    creators: Object.keys(creators).map(email => ({ email: email, name: creators[email] })).sort((a, b) => a.name.localeCompare(b.name)),
    branches: Object.keys(branches).map(id => ({ id: id, name: branches[id] })).sort((a, b) => a.name.localeCompare(b.name)),
    sceneTypes: AI_SCENE_TYPES,
    moodTags: AI_MOOD_TAGS
  };
}

function getLibraryContent(token, filters) {
  requirePrivileged(token);
  filters = filters || {};

  let items = sheetToObjects(getSheet(LIBRARY_SHEET));

  if (filters.creatorEmail) {
    items = items.filter(it => String(it.CreatorEmail || '').trim().toLowerCase() === String(filters.creatorEmail).trim().toLowerCase());
  }
  if (filters.contentType) {
    items = items.filter(it => it.ContentType === filters.contentType);
  }
  if (filters.branchId) {
    items = items.filter(it => String(it.BranchID) === String(filters.branchId));
  }
  if (filters.date) {
    items = items.filter(it => safeDateStr(it.VisitDate) === filters.date);
  }
  if (filters.sceneType) {
    items = items.filter(it => it['AI Scene Type'] === filters.sceneType);
  }
  if (Array.isArray(filters.qualityScores) && filters.qualityScores.length) {
    const scoreSet = filters.qualityScores.map(String);
    items = items.filter(it => scoreSet.indexOf(String(it['AI Quality Score'])) !== -1);
  }
  if (Array.isArray(filters.moodTags) && filters.moodTags.length) {
    items = items.filter(it => {
      const tags = String(it['AI Mood Tags'] || '').split(',').map(t => t.trim());
      return filters.moodTags.some(mt => tags.indexOf(mt) !== -1);
    });
  }
  if (filters.keywords) {
    const q = String(filters.keywords).trim().toLowerCase();
    items = items.filter(it => String(it['AI Keywords'] || '').toLowerCase().indexOf(q) !== -1);
  }

  items.sort((a, b) => new Date(b.UploadedAt) - new Date(a.UploadedAt));

  return items.map(it => ({
    id: String(it.ContentID || ''),
    creatorName: String(it.CreatorName || ''),
    branchName: String(it.BranchName || ''),
    visitDate: safeDateStr(it.VisitDate),
    contentType: String(it.ContentType || ''),
    fileName: String(it.FileName || ''),
    fileUrl: String(it.FileUrl || ''),
    thumbUrl: it.DriveFileId ? ('https://drive.google.com/thumbnail?id=' + it.DriveFileId + '&sz=w500') : '',
    uploadedAt: it.UploadedAt ? Utilities.formatDate(new Date(it.UploadedAt), Session.getScriptTimeZone(), 'yyyy-MM-dd') : '',
    aiSceneType: String(it['AI Scene Type'] || ''),
    aiQualityScore: it['AI Quality Score'] || '',
    aiMoodTags: String(it['AI Mood Tags'] || ''),
    aiDescription: String(it['AI Description'] || ''),
    aiSuggestedCaption: String(it['AI Suggested Caption'] || ''),
    aiKeywords: String(it['AI Keywords'] || ''),
    aiStatus: String(it['AI Analysis Status'] || '')
  }));
}
