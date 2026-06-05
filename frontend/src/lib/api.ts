const API_BASE = 'http://localhost:8000/api';

let authToken: string | null = null;

export function setToken(token: string) {
  authToken = token;
  if (typeof window !== 'undefined') localStorage.setItem('token', token);
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  if (!authToken) {
    authToken = localStorage.getItem('token');
  }
  return authToken;
}

export function clearToken() {
  authToken = null;
  if (typeof window !== 'undefined') localStorage.removeItem('token');
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // Don't set Content-Type for FormData (browser sets boundary automatically)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    // Don't clear token on initial load race condition
    if (getToken()) {
      clearToken();
      window.location.reload();
    }
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || 'Request failed');
  }

  return res;
}

// Auth
export async function register(email: string, password: string) {
  const res = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  setToken(data.access_token);
  return data;
}

export async function login(email: string, password: string) {
  const res = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  setToken(data.access_token);
  return data;
}

export async function getMe() {
  const res = await request('/auth/me');
  return res.json();
}

export async function updateProfile(data: { display_name?: string }) {
  const res = await request('/auth/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function uploadAvatar(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await request('/auth/profile/avatar', {
    method: 'POST',
    body: formData,
  });
  return res.json();
}

// Files
export async function uploadFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await request('/files/upload', {
    method: 'POST',
    body: formData,
  });
  return res.json();
}

export function uploadFileWithProgress(
  file: File,
  onProgress: (percent: number) => void
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed')));

    xhr.open('POST', `${API_BASE}/files/upload`);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
  });
}

export async function listFiles() {
  const res = await request('/files/');
  return res.json();
}

export async function deleteFile(fileId: number) {
  await request(`/files/${fileId}`, { method: 'DELETE' });
}

export async function getFileContent(fileId: number) {
  const res = await request(`/files/${fileId}/content`);
  return res.json();
}

// Sessions
export async function createSession(title?: string) {
  const res = await request('/chat/sessions', {
    method: 'POST',
    body: JSON.stringify({ title: title || 'New Chat' }),
  });
  return res.json();
}

export async function listSessions() {
  const res = await request('/chat/sessions');
  return res.json();
}

export async function deleteSession(sessionId: number) {
  await request(`/chat/sessions/${sessionId}`, { method: 'DELETE' });
}

export async function getMessages(sessionId: number) {
  const res = await request(`/chat/sessions/${sessionId}/messages`);
  return res.json();
}

export async function sendMessage(
  sessionId: number,
  message: string,
  fileIds: number[],
  model?: string
): Promise<ReadableStream<Uint8Array> | null> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ message, file_ids: fileIds, model }),
  });

  if (!res.ok) throw new Error('Failed to send message');
  return res.body;
}

export type StreamEvent =
  | { type: 'progress'; stage: string; message: string }
  | { type: 'content'; text: string }
  | { type: 'done' };

/**
 * Parse NDJSON stream into typed events.
 */
export async function* parseMessageStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<StreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as StreamEvent;
        yield event;
      } catch {
        // Fallback: treat as raw content (backward compat)
        yield { type: 'content', text: line };
      }
    }
  }

  // Process any remaining buffer
  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer) as StreamEvent;
    } catch {
      yield { type: 'content', text: buffer };
    }
  }
}

// Settings
export async function getSettings() {
  const res = await request('/settings/');
  return res.json();
}

export async function updateSettings(settings: Record<string, boolean>) {
  await request('/settings/', { method: 'PATCH', body: JSON.stringify(settings) });
}

export async function listProviders() {
  const res = await request('/settings/providers');
  return res.json();
}

export async function addProvider(providerName: string, apiKey: string, models: string[] = []) {
  const res = await request('/settings/providers', {
    method: 'POST',
    body: JSON.stringify({ provider_name: providerName, api_key: apiKey, models }),
  });
  return res.json();
}

export async function deleteProvider(providerId: number) {
  await request(`/settings/providers/${providerId}`, { method: 'DELETE' });
}

export async function getMemory() {
  const res = await request('/settings/memory');
  return res.json();
}

export async function deleteMemoryItem(itemId: number) {
  await request(`/settings/memory/${itemId}`, { method: 'DELETE' });
}
