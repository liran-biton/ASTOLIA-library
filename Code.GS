/*******************************************************
 *  ASTOLIA LIBRARY — Code.gs
 *  Backend logic: Auth (username + password), Sessions, Digital Creator
 *******************************************************/

const USERS_SHEET    = 'Users';
const CREATORS_SHEET = 'Digital Creator';

const SESSION_DAYS = 30;   // session length after a successful login

const ROLES = {
  CREATOR: 'Content Creator',
  EDITOR : 'Video Editor',
  ADMIN  : 'Admin'
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
  const headers = values[0];
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