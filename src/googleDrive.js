// Client-side Google Drive upload using Google Identity Services (token model)
// + the Google Picker (to choose the destination folder). No backend.
//
// Requires two values from your Google Cloud project, supplied as Vite env vars:
//   VITE_GOOGLE_CLIENT_ID  — OAuth 2.0 Web client ID
//   VITE_GOOGLE_API_KEY    — API key (for the Picker), restricted to your domains
//
// Scope is drive.file: the app can only see/write files it creates or that you
// explicitly pick — it cannot read the rest of your Drive.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_KEY = 'basketball-tracker-drive-folder-v1';

export const driveConfigured = Boolean(CLIENT_ID && API_KEY);

let gisLoaded = null;
let gapiLoaded = null;
let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function ensureGis() {
  if (!gisLoaded) gisLoaded = loadScript('https://accounts.google.com/gsi/client');
  return gisLoaded;
}

function ensurePicker() {
  if (!gapiLoaded) {
    gapiLoaded = loadScript('https://apis.google.com/js/api.js').then(
      () =>
        new Promise((resolve) => window.gapi.load('picker', { callback: resolve }))
    );
  }
  return gapiLoaded;
}

// Returns a valid OAuth access token, prompting the user only when needed.
function getToken({ forceConsent = false } = {}) {
  return new Promise(async (resolve, reject) => {
    if (!driveConfigured)
      return reject(new Error('Google Drive is not configured.'));
    if (accessToken && Date.now() < tokenExpiry - 60_000 && !forceConsent)
      return resolve(accessToken);

    await ensureGis();
    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: () => {}, // replaced per-request below
      });
    }
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(new Error(resp.error));
      accessToken = resp.access_token;
      // expires_in is seconds; default to 50 min if absent.
      tokenExpiry = Date.now() + (resp.expires_in ? resp.expires_in * 1000 : 3000_000);
      resolve(accessToken);
    };
    tokenClient.requestAccessToken({ prompt: forceConsent ? 'consent' : '' });
  });
}

export function getSavedFolder() {
  try {
    const raw = localStorage.getItem(FOLDER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveFolder(folder) {
  try {
    localStorage.setItem(FOLDER_KEY, JSON.stringify(folder));
  } catch {
    /* ignore */
  }
}

export function clearFolder() {
  try {
    localStorage.removeItem(FOLDER_KEY);
  } catch {
    /* ignore */
  }
}

// Opens the Google Picker so the user selects a destination folder.
// Resolves to { id, name } and remembers it for next time.
export async function pickFolder() {
  const token = await getToken();
  await ensurePicker();
  return new Promise((resolve, reject) => {
    const view = new window.google.picker.DocsView(
      window.google.picker.ViewId.FOLDERS
    )
      .setSelectFolderEnabled(true)
      .setMimeTypes('application/vnd.google-apps.folder');

    const picker = new window.google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(API_KEY)
      .setTitle('Choose a folder for your stats')
      .setCallback((data) => {
        const action = data[window.google.picker.Response.ACTION];
        if (action === window.google.picker.Action.PICKED) {
          const doc = data[window.google.picker.Response.DOCUMENTS][0];
          const folder = {
            id: doc[window.google.picker.Document.ID],
            name: doc[window.google.picker.Document.NAME],
          };
          saveFolder(folder);
          resolve(folder);
        } else if (action === window.google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    picker.setVisible(true);
  });
}

// Uploads a single text file to the given folder. Returns the Drive file.
async function uploadOne({ name, mimeType, content, folderId }) {
  const token = await getToken();
  const metadata = { name, mimeType, parents: folderId ? [folderId] : undefined };
  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  form.append('file', new Blob([content], { type: mimeType }));

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Drive upload failed (${res.status}): ${text}`);
  }
  return res.json();
}

// Ensures a folder is selected (prompts the picker if not), then uploads
// the provided files. `files` is an array of { name, mimeType, content }.
export async function uploadToDrive(files) {
  let folder = getSavedFolder();
  if (!folder) {
    folder = await pickFolder();
    if (!folder) throw new Error('No folder selected.');
  }
  const results = [];
  for (const f of files) {
    results.push(await uploadOne({ ...f, folderId: folder.id }));
  }
  return { folder, results };
}
