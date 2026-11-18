/**
 * World Anvil MCP Server - Utility Functions
 *
 * Markdown to BBCode conversion and field processing utilities.
 */

/**
 * Convert Markdown to World Anvil BBCode
 *
 * Handles common markdown patterns and converts them to BBCode format
 * that World Anvil expects for article content.
 *
 * @param {string} text - Markdown text to convert
 * @returns {string} BBCode formatted text
 */
export function markdownToBBCode(text) {
  if (!text || typeof text !== "string") return text;

  let result = text;

  // Code blocks (must be done before other processing)
  // Fenced code blocks: ```code``` or ```lang\ncode\n```
  result = result.replace(/```[\w]*\n?([\s\S]*?)```/g, "[code]$1[/code]");

  // Inline code: `code`
  result = result.replace(/`([^`]+)`/g, "[code]$1[/code]");

  // Headers (h1-h4) - must process before bold since # could appear in text
  result = result.replace(/^#### (.+)$/gm, "[h4]$1[/h4]");
  result = result.replace(/^### (.+)$/gm, "[h3]$1[/h3]");
  result = result.replace(/^## (.+)$/gm, "[h2]$1[/h2]");
  result = result.replace(/^# (.+)$/gm, "[h1]$1[/h1]");

  // Bold: **text** or __text__
  result = result.replace(/\*\*([^*]+)\*\*/g, "[b]$1[/b]");
  result = result.replace(/__([^_]+)__/g, "[b]$1[/b]");

  // Italic: *text* or _text_ (but not inside words)
  result = result.replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, "[i]$1[/i]");
  result = result.replace(/(?<!\w)_([^_]+)_(?!\w)/g, "[i]$1[/i]");

  // Strikethrough: ~~text~~
  result = result.replace(/~~([^~]+)~~/g, "[s]$1[/s]");

  // Links: [text](url) — but NOT @[text](type:uuid) which is a WA article mention
  result = result.replace(/(?<!@)\[([^\]]+)\]\(([^)]+)\)/g, "[url=$2]$1[/url]");

  // Horizontal rules: --- or *** or ___
  result = result.replace(/^[-*_]{3,}$/gm, "[hr]");

  // Blockquotes: > text (can be multi-line)
  result = result.replace(/^> (.+)$/gm, "[quote]$1[/quote]");
  // Merge adjacent quotes
  result = result.replace(/\[\/quote\]\n\[quote\]/g, "\n");

  // Lists: unordered (- item or * item) and ordered (1. item, 2. item)
  // First, identify list blocks and wrap them
  const lines = result.split("\n");
  const processedLines = [];
  let inList = false;
  let listType = null; // 'ul' for unordered, 'ol' for ordered

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isUnorderedItem = /^[-*] (.+)$/.test(line);
    const isOrderedItem = /^\d+\. (.+)$/.test(line);
    const isListItem = isUnorderedItem || isOrderedItem;
    const currentType = isUnorderedItem ? "ul" : isOrderedItem ? "ol" : null;

    if (isListItem && !inList) {
      // Start of a new list
      inList = true;
      listType = currentType;
      processedLines.push(listType === "ol" ? "[ol]" : "[ul]");
      const content = isUnorderedItem
        ? line.replace(/^[-*] (.+)$/, "$1")
        : line.replace(/^\d+\. (.+)$/, "$1");
      processedLines.push("[li]" + content + "[/li]");
    } else if (isListItem && inList && currentType === listType) {
      // Continue same type of list
      const content = isUnorderedItem
        ? line.replace(/^[-*] (.+)$/, "$1")
        : line.replace(/^\d+\. (.+)$/, "$1");
      processedLines.push("[li]" + content + "[/li]");
    } else if (isListItem && inList && currentType !== listType) {
      // Different list type - close current, start new
      processedLines.push(listType === "ol" ? "[/ol]" : "[/ul]");
      listType = currentType;
      processedLines.push(listType === "ol" ? "[ol]" : "[ul]");
      const content = isUnorderedItem
        ? line.replace(/^[-*] (.+)$/, "$1")
        : line.replace(/^\d+\. (.+)$/, "$1");
      processedLines.push("[li]" + content + "[/li]");
    } else if (!isListItem && inList) {
      // End of list
      processedLines.push(listType === "ol" ? "[/ol]" : "[/ul]");
      inList = false;
      listType = null;
      processedLines.push(line);
    } else {
      processedLines.push(line);
    }
  }

  // Close list if we ended while still in one
  if (inList) {
    processedLines.push(listType === "ol" ? "[/ol]" : "[/ul]");
  }

  result = processedLines.join("\n");

  // Tables: | col1 | col2 | -> [table][tr][td]col1[/td][td]col2[/td][/tr][/table]
  // This is more complex - handle basic tables
  const tableLines = result.split("\n");
  let inTable = false;
  let tableResult = [];

  for (let i = 0; i < tableLines.length; i++) {
    const line = tableLines[i];
    const isTableRow = /^\|(.+)\|$/.test(line);
    const isSeparator = /^\|[-:\s|]+\|$/.test(line);

    if (isTableRow && !inTable) {
      // Start of table
      inTable = true;
      tableResult.push("[table]");
      if (!isSeparator) {
        const cells = line
          .slice(1, -1)
          .split("|")
          .map((c) => c.trim());
        tableResult.push(
          "[tr]" + cells.map((c) => "[th]" + c + "[/th]").join("") + "[/tr]",
        );
      }
    } else if (isTableRow && inTable) {
      if (!isSeparator) {
        const cells = line
          .slice(1, -1)
          .split("|")
          .map((c) => c.trim());
        tableResult.push(
          "[tr]" + cells.map((c) => "[td]" + c + "[/td]").join("") + "[/tr]",
        );
      }
      // Skip separator rows (|---|---|)
    } else if (!isTableRow && inTable) {
      // End of table
      inTable = false;
      tableResult.push("[/table]");
      tableResult.push(line);
    } else {
      tableResult.push(line);
    }
  }

  if (inTable) {
    tableResult.push("[/table]");
  }

  result = tableResult.join("\n");

  return result;
}

/**
 * Field names whose values are code or identifiers, never prose.
 * Running Markdown conversion on them corrupts them: `/* a *b* *\/` in CSS
 * becomes `/[i] a [/i]...`, and `my_class_name` loses its underscores.
 * Matches displayCss, displayPanelCss, cssClasses, displayJs, prepareJs, ...
 */
const RAW_FIELD_PATTERN = /css|classes|js$/i;

/**
 * Whether a field must always be sent verbatim (never Markdown-converted).
 *
 * @param {string} key - Field name
 * @returns {boolean}
 */
export function isRawField(key) {
  return typeof key === "string" && RAW_FIELD_PATTERN.test(key);
}

/**
 * Signals that text is already in a format World Anvil stores as-is, so
 * Markdown conversion would only damage it. @-mentions and --Key::Value--
 * are left out on purpose: the converter already preserves them, and
 * Markdown written by an assistant often contains them.
 */
const BBCODE_TAG =
  /\[\/?(?:b|i|u|s|h[1-6]|p|br|hr|url|img|container|section|row|col\\d*|quote|ul|ol|li|table|tr|td|th|center|left|right|justify|code|spoiler|aloud|sup|sub|small|large|mark|redacted|tooltip|var|history|timeline|secret|map|block|article|category|indent|youtube|vimeo|nocode|sidebar|dice|dc|color|in|noparse|articleblock|blocklink|world|familytree|manuscript|diplomacy|book)(?=[\]:=|\s])/i;
const HTML_TAG = /<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>/i;
// A rule: a selector (with . # : @ * or [ in it, or a bare tag list) at the
// start of a line or after a block, then { property: ...
const CSS_RULE =
  /(?:^|[{};])\s*(?:[^{};\n]*[.#:@*[][^{};\n]*|[a-z][a-z0-9-]*(?:\s*,\s*[a-z][a-z0-9-]*)*)\s*\{\s*(?:--)?[-a-z]+\s*:/im;

/**
 * Guess what kind of text this is.
 *
 * @param {string} text
 * @returns {"bbcode"|"html"|"css"|"markdown"} "markdown" also covers plain text
 */
export function detectFormat(text) {
  if (typeof text !== "string" || text === "") return "markdown";
  if (BBCODE_TAG.test(text)) return "bbcode";
  if (HTML_TAG.test(text)) return "html";
  if (CSS_RULE.test(text)) return "css";
  return "markdown";
}

/**
 * Conversion modes:
 *  - "auto"    (default) convert Markdown and plain text; keep text that
 *              already contains BBCode, HTML or CSS exactly as given
 *  - "convert" always convert (the original behaviour)
 *  - "raw"     never convert
 *
 * @param {Object} args - Tool arguments (raw: true → raw, raw: false → convert)
 * @returns {"auto"|"convert"|"raw"}
 */
export function conversionMode(args) {
  if (args && args.raw === true) return "raw";
  if (args && args.raw === false) return "convert";
  const env = String(process.env.WA_MARKDOWN || "auto").toLowerCase();
  if (env === "off" || env === "raw") return "raw";
  if (env === "on" || env === "always" || env === "convert") return "convert";
  return "auto";
}

/**
 * Convert a text value according to the mode.
 *
 * @param {string} text - Markdown, BBCode, HTML or CSS
 * @param {"auto"|"convert"|"raw"|boolean} [mode="auto"] - true means raw,
 *   false means convert (kept for callers that pass a boolean)
 * @returns {string}
 */
export function toBBCode(text, mode = "auto") {
  if (mode === true) mode = "raw";
  if (mode === false) mode = "convert";
  if (mode === "raw" || typeof text !== "string") return text;
  if (mode === "auto" && detectFormat(text) !== "markdown") return text;
  return markdownToBBCode(text);
}

/**
 * Convert all text fields in an object from Markdown to BBCode.
 * CSS / class / JS fields (see isRawField) are always passed through
 * verbatim; with raw=true nothing is converted.
 *
 * @param {Object} data - Object with string fields to convert
 * @param {Object} [options]
 * @param {boolean} [options.raw=false] - Skip conversion for every field
 * @param {string} [options.mode] - "auto", "convert" or "raw" (overrides raw)
 * @returns {Object} New object with converted string fields
 */
export function convertFieldsToBBCode(data, { raw = false, mode } = {}) {
  if (!data || typeof data !== "object") return data;

  const effective = mode || (raw ? "raw" : "auto");
  const converted = { ...data };

  for (const [key, value] of Object.entries(converted)) {
    if (typeof value === "string" && !isRawField(key)) {
      converted[key] = toBBCode(value, effective);
    }
  }

  return converted;
}
