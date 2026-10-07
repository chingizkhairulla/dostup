import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAnnouncementHtml, textToHtml } from "./announcementHtml.ts";

test("text is escaped and newlines become line breaks", () => {
  assert.equal(textToHtml("<b>Привет</b>\nвсем"), "&lt;b&gt;Привет&lt;/b&gt;<br />всем");
});

test("links inside the text become clickable, trailing punctuation stays text", () => {
  assert.equal(
    textToHtml("Группа: https://t.me/dostup_group."),
    'Группа: <a href="https://t.me/dostup_group" target="_blank" rel="noopener noreferrer">https://t.me/dostup_group</a>.',
  );
  assert.equal(
    textToHtml("сайт www.example.com, заходите"),
    'сайт <a href="https://www.example.com" target="_blank" rel="noopener noreferrer">www.example.com</a>, заходите',
  );
});

test("links cannot inject markup", () => {
  assert.equal(
    textToHtml('https://x.com/?a=1&b="><img src=x>'),
    '<a href="https://x.com/?a=1&amp;b=" target="_blank" rel="noopener noreferrer">https://x.com/?a=1&amp;b=</a>' +
      "&quot;&gt;&lt;img src=x&gt;",
  );
});

test("attachments go before the text", () => {
  const html = buildAnnouncementHtml("  Добро пожаловать  ", [
    { kind: "image", url: "https://cdn/x.png" },
    { kind: "file", url: "https://cdn/plan.pdf", name: "План.pdf", size: 2048 },
  ]);
  assert.equal(
    html,
    '<p><img src="https://cdn/x.png" alt="" style="max-width:100%" /></p>' +
      '<p><a href="https://cdn/plan.pdf" data-attachment="1" data-name="План.pdf" data-size="2048" ' +
      'target="_blank" rel="noopener noreferrer">📎 План.pdf (2.0 KB)</a></p>' +
      "<p>Добро пожаловать</p>",
  );
});

test("an empty post builds to an empty string", () => {
  assert.equal(buildAnnouncementHtml("   \n ", []), "");
});
