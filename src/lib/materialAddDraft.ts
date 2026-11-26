import { scheduledMaterialDate } from './materialDraft';

export type MaterialAddType = 'file' | 'link' | 'text' | 'folder';

export interface MaterialFileDraft {
  id: string;
  file: File;
  title: string;
  allowDownload: boolean;
  scheduled: boolean;
  availableAt: string;
  uploadedUrl?: string;
}

export interface MaterialAddDraft {
  files: MaterialFileDraft[];
  link: { title: string; url: string; scheduled: boolean; availableAt: string };
  text: { title: string; content: string };
  folder: { title: string };
}

export function emptyMaterialAddDraft(): MaterialAddDraft {
  return {
    files: [],
    link: { title: '', url: '', scheduled: false, availableAt: '' },
    text: { title: '', content: '' },
    folder: { title: '' },
  };
}

interface MaterialAddition {
  draftId: string;
  file?: MaterialFileDraft;
  material: {
    title: string;
    type: MaterialAddType;
    content?: string | null;
    file_url?: string | null;
    file_size?: number;
    allow_view?: boolean;
    allow_download?: boolean;
    teacher_allow_download?: boolean;
    available_at?: string | null;
  };
}

/** Validate the whole draft before uploading anything, including hidden tabs. */
export function planMaterialAdditions(draft: MaterialAddDraft): MaterialAddition[] {
  const additions: MaterialAddition[] = draft.files.map(file => ({
    draftId: file.id,
    file,
    material: {
      title: file.title.trim() || file.file.name,
      type: 'file',
      file_size: file.file.size,
      allow_view: true,
      allow_download: file.allowDownload,
      teacher_allow_download: false,
      available_at: scheduledMaterialDate(file.scheduled, file.availableAt),
    },
  }));
  if (draft.link.title.trim() || draft.link.url.trim()) {
    const raw = draft.link.url.trim();
    if (!raw) throw new Error('Введите ссылку');
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/\//, '')}`;
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) throw new Error();
    } catch {
      throw new Error('Введите корректную ссылку');
    }
    additions.push({
      draftId: 'link',
      material: {
        title: draft.link.title.trim() || url, type: 'link', file_url: url,
        available_at: scheduledMaterialDate(draft.link.scheduled, draft.link.availableAt),
      },
    });
  }
  if (draft.text.title.trim() || draft.text.content.trim()) {
    const content = draft.text.content.trim();
    if (!content) throw new Error('Введите текст');
    additions.push({ draftId: 'text', material: { title: draft.text.title.trim() || content.slice(0, 80), type: 'text', content } });
  }
  if (draft.folder.title.trim()) {
    additions.push({ draftId: 'folder', material: { title: draft.folder.title.trim(), type: 'folder' } });
  }
  return additions;
}

export function removeSavedMaterialDraft(draft: MaterialAddDraft, draftId: string): MaterialAddDraft {
  if (draftId === 'link') return { ...draft, link: emptyMaterialAddDraft().link };
  if (draftId === 'text') return { ...draft, text: emptyMaterialAddDraft().text };
  if (draftId === 'folder') return { ...draft, folder: emptyMaterialAddDraft().folder };
  return { ...draft, files: draft.files.filter(file => file.id !== draftId) };
}
