import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

export function parseMarkdownToHtml(md: string): string {
  if (!md) return "<p></p>";

  const lines = md.split("\n");
  const result: string[] = [];
  let inBulletList = false;
  let inOrderedList = false;

  const closeLists = () => {
    if (inBulletList) {
      result.push("</ul>");
      inBulletList = false;
    }
    if (inOrderedList) {
      result.push("</ol>");
      inOrderedList = false;
    }
  };

  const formatInline = (text: string) => {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.*?)__/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/_(.*?)_/g, "<em>$1</em>")
      .replace(/~~(.*?)~~/g, "<s>$1</s>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      closeLists();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeLists();
      const level = Math.min(3, Math.max(2, headingMatch[1].length));
      result.push(`<h${level}>${formatInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    const bulletMatch = line.match(/^(\s*)[-*+•]\s+(.*)$/);
    if (bulletMatch) {
      if (inOrderedList) closeLists();
      if (!inBulletList) {
        result.push("<ul>");
        inBulletList = true;
      }
      result.push(`<li>${formatInline(bulletMatch[2])}</li>`);
      continue;
    }

    const orderedMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (orderedMatch) {
      if (inBulletList) closeLists();
      if (!inOrderedList) {
        result.push("<ol>");
        inOrderedList = true;
      }
      result.push(`<li>${formatInline(orderedMatch[2])}</li>`);
      continue;
    }

    closeLists();
    result.push(`<p>${formatInline(trimmed)}</p>`);
  }

  closeLists();
  return result.length > 0 ? result.join("") : "<p></p>";
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  maxHeight?: string;
  className?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder: placeholderProp,
  minHeight = "70px",
  maxHeight = "200px",
  className,
}: RichTextEditorProps) {
  const { l } = useLanguage();
  const placeholder = placeholderProp ?? l({ ru: "Введите текст описания...", kk: "Введите текст описания...", en: "Enter the description..." });
  const formatInitial = (val: string) => {
    if (!val) return "<p></p>";
    if (/<[a-z][\s\S]*>/i.test(val)) return val;
    return parseMarkdownToHtml(val);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
          class: "text-primary underline",
        },
      }),
    ],
    content: formatInitial(value),
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-base max-w-none text-foreground text-base focus:outline-none px-3.5 py-2.5",
          "[&_p]:mb-2 [&_p]:text-base [&_p]:leading-relaxed",
          "[&_strong]:font-bold [&_strong]:text-foreground",
          "[&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-foreground",
          "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-foreground",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ul]:space-y-1",
          "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_ol]:space-y-1",
          "[&_li]:text-base [&_li]:leading-relaxed"
        ),
      },
      handlePaste(view, event) {
        const html = event.clipboardData?.getData("text/html");
        // If raw plain text or Markdown was pasted without HTML:
        if (!html) {
          const text = event.clipboardData?.getData("text/plain");
          if (text && (/[*_#`~>-]|\d+\.\s|\n\n/.test(text) || text.includes("\n"))) {
            event.preventDefault();
            const converted = parseMarkdownToHtml(text);
            editor?.commands.insertContent(converted);
            return true;
          }
        }
        // Let TipTap naturally parse standard rich text (ChatGPT, Notion, Google Docs, Word)
        return false;
      },
    },
    onUpdate({ editor: currentEditor }) {
      const html = currentEditor.getHTML();
      const text = currentEditor.getText().trim();
      if (!text || html === "<p></p>" || html === "<p><br></p>" || html === "<p><br class=\"ProseMirror-trailingBreak\"></p>") {
        onChange("");
      } else {
        onChange(html);
      }
    },
  });

  // Keep editor synchronized with external value changes (e.g. form reset or switching products)
  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    const formattedVal = formatInitial(value);
    if (value === "" && currentHtml !== "<p></p>") {
      editor.commands.setContent("<p></p>");
    } else if (value && currentHtml !== formattedVal && currentHtml !== value) {
      editor.commands.setContent(formattedVal);
    }
  }, [value, editor]);

  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  if (!editor) return null;

  return (
    <div
      className={cn(
        "rounded-xl border border-input bg-card shadow-xs focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all overflow-hidden",
        className
      )}
    >
      {/* Editor Content Area with vertical scroll */}
      <div
        className="relative overflow-y-auto"
        style={{ minHeight, maxHeight }}
      >
        {editor.isEmpty && (
          <div className="pointer-events-none absolute left-3.5 top-2.5 text-sm text-muted-foreground select-none">
            {placeholder}
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
