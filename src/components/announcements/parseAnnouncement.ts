import DOMPurify from "dompurify";

export interface ParsedAnnouncement {
  media: { kind: "image" | "video"; url: string }[];
  files: { url: string; name: string; size?: number }[];
  /** Sanitized HTML of everything except attachments (older posts may contain formatting). */
  bodyHtml: string;
  /** Plain text of the body, with line breaks kept — used to edit a post. */
  text: string;
}

const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "PRE"]);

const blockText = (root: Node): string => {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.tagName === "BR") {
      out += "\n";
      return;
    }
    node.childNodes.forEach(walk);
    if (BLOCK_TAGS.has(node.tagName)) out += "\n";
  };
  root.childNodes.forEach(walk);
  return out.replace(/\n{3,}/g, "\n\n").trim();
};

export function parseAnnouncement(html: string): ParsedAnnouncement {
  const root = DOMPurify.sanitize(html || "", {
    ADD_TAGS: ["video", "source"],
    ADD_ATTR: ["controls", "target", "poster"],
    RETURN_DOM_FRAGMENT: true,
  });

  const media: ParsedAnnouncement["media"] = [];
  const files: ParsedAnnouncement["files"] = [];

  root.querySelectorAll("img, video, a[data-attachment]").forEach((el) => {
    if (el.tagName === "IMG") {
      const src = el.getAttribute("src");
      if (src) media.push({ kind: "image", url: src });
    } else if (el.tagName === "VIDEO") {
      const src = el.getAttribute("src") || el.querySelector("source")?.getAttribute("src");
      if (src) media.push({ kind: "video", url: src });
    } else {
      const href = el.getAttribute("href");
      const size = Number(el.getAttribute("data-size"));
      if (href) {
        files.push({
          url: href,
          name: el.getAttribute("data-name") || el.textContent?.replace(/^📎\s*/, "") || "file",
          size: Number.isFinite(size) && el.hasAttribute("data-size") ? size : undefined,
        });
      }
    }
    el.remove();
  });

  // Drop paragraphs that only held an attachment.
  root.querySelectorAll("p").forEach((p) => {
    if (!p.textContent?.trim() && !p.querySelector("img, video, br")) p.remove();
  });
  root.querySelectorAll("a[href]").forEach((a) => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  });

  const holder = document.createElement("div");
  holder.appendChild(root);
  const text = blockText(holder);
  return { media, files, bodyHtml: text ? holder.innerHTML : "", text };
}
