import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyMaterialAddDraft, planMaterialAdditions, removeSavedMaterialDraft } from './materialAddDraft.ts';

test('one submission includes all populated types with independent titles and permissions', () => {
  const draft = emptyMaterialAddDraft();
  draft.files = [{ id: 'file-1', file: new File(['abc'], 'original.txt'), title: 'File title', allowDownload: false, scheduled: false, availableAt: '' }];
  draft.link = { title: 'Link title', url: 'example.com/course', scheduled: true, availableAt: '2026-12-01T10:30' };
  draft.text = { title: 'Text title', content: 'Actual text' };
  draft.folder.title = 'Folder title';
  const plan = planMaterialAdditions(draft);
  assert.deepEqual(plan.map(item => [item.material.type, item.material.title]), [
    ['file', 'File title'], ['link', 'Link title'], ['text', 'Text title'], ['folder', 'Folder title'],
  ]);
  assert.equal(plan[0].material.allow_download, false);
  assert.equal(plan[0].material.file_size, 3);
  assert.equal(plan[1].material.file_url, 'https://example.com/course');
  assert.equal(plan[1].material.available_at, new Date('2026-12-01T10:30').toISOString());
  assert.equal(plan[3].file, undefined);
});

test('an invalid hidden tab is rejected before any work, and blank tabs are skipped', () => {
  const draft = emptyMaterialAddDraft();
  assert.equal(planMaterialAdditions(draft).length, 0);
  draft.folder.title = 'Folder';
  draft.link.title = 'Incomplete link';
  assert.throws(() => planMaterialAdditions(draft), /Введите ссылку/);
  draft.link.url = 'https://example.com';
  draft.link.scheduled = true;
  assert.throws(() => planMaterialAdditions(draft), /Выберите дату и время/);
  draft.link.scheduled = false;
  draft.text.title = 'Incomplete text';
  assert.throws(() => planMaterialAdditions(draft), /Введите текст/);
});

test('partial success removes only saved items; a retry keeps the remaining file URL and other tabs', () => {
  const draft = emptyMaterialAddDraft();
  draft.files = ['first', 'second'].map(id => ({
    id, file: new File([id], `${id}.txt`), title: '', allowDownload: true,
    scheduled: false, availableAt: '', uploadedUrl: `s3://bucket/product/${id}.txt`,
  }));
  draft.link.url = 'https://example.com';
  draft.text.content = 'Keep me';
  let remaining = removeSavedMaterialDraft(draft, 'first');
  const retry = planMaterialAdditions(remaining);
  assert.deepEqual(retry.map(item => item.draftId), ['second', 'link', 'text']);
  assert.equal(retry[0].file?.uploadedUrl, 's3://bucket/product/second.txt');
  remaining = removeSavedMaterialDraft(remaining, 'link');
  assert.equal(remaining.text.content, 'Keep me');
  assert.equal(remaining.link.url, '');
  assert.equal(draft.files.length, 2);
});
