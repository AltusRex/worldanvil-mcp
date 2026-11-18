/**
 * Styling field tests
 *
 * Covers the verbatim (no Markdown conversion) path for CSS / class / raw
 * BBCode content, and the presentation fields on worldanvil_update_world.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleToolCall, WORLD_UPDATE_FIELDS } from "../src/handlers.js";
import { convertFieldsToBBCode, isRawField, toBBCode } from "../src/utils.js";
import { getToolDefinitions } from "../src/tools.js";

// CSS that the old converter corrupted: `*` pairs became [i]...[/i].
const CSS =
  ".user-css .pz-card * , .user-css .pz_hero { color: #123456; } /* a_b *c* */";
const BBCODE = "[container:pz-hero]\n**Title** _sub_\n[/container]";

function makeMockClient() {
  const stub = (name) =>
    vi.fn(async (...args) => ({ _called: name, _args: args }));
  return {
    createArticle: stub("createArticle"),
    updateArticle: stub("updateArticle"),
    updateWorld: stub("updateWorld"),
  };
}

describe("isRawField", () => {
  it("matches CSS, class and JS fields", () => {
    for (const key of [
      "displayCss",
      "displayPanelCss",
      "cssClasses",
      "displayJs",
      "prepareJs",
    ]) {
      expect(isRawField(key)).toBe(true);
    }
  });

  it("does not match prose fields", () => {
    for (const key of ["content", "sidebarcontent", "footnotes", "subheading"]) {
      expect(isRawField(key)).toBe(false);
    }
  });
});

describe("toBBCode", () => {
  it("converts by default and passes through when raw", () => {
    expect(toBBCode("**x**")).toBe("[b]x[/b]");
    expect(toBBCode("**x**", true)).toBe("**x**");
  });
});

describe("convertFieldsToBBCode", () => {
  it("never converts CSS or class fields", () => {
    const out = convertFieldsToBBCode({
      displayCss: CSS,
      cssClasses: "pz-recipe pz_v1",
      sidebarcontent: "**side**",
    });
    expect(out.displayCss).toBe(CSS);
    expect(out.cssClasses).toBe("pz-recipe pz_v1");
    expect(out.sidebarcontent).toBe("[b]side[/b]");
  });

  it("converts nothing when raw is set", () => {
    const out = convertFieldsToBBCode({ sidebarcontent: "**side**" }, { raw: true });
    expect(out.sidebarcontent).toBe("**side**");
  });

  it("keeps the old single-argument behaviour", () => {
    expect(convertFieldsToBBCode({ a: "**b**" })).toEqual({ a: "[b]b[/b]" });
  });
});

describe("article handlers", () => {
  let client;
  beforeEach(() => {
    client = makeMockClient();
  });

  it("update_article sends CSS fields verbatim without raw", async () => {
    await handleToolCall(
      "worldanvil_update_article",
      {
        article_id: "art-1",
        content: "**hi**",
        fields: { displayCss: CSS, cssClasses: "pz-recipe" },
      },
      client,
    );
    const [, payload] = client.updateArticle.mock.calls[0];
    expect(payload.content).toBe("[b]hi[/b]");
    expect(payload.displayCss).toBe(CSS);
    expect(payload.cssClasses).toBe("pz-recipe");
  });

  it("update_article with raw sends content and fields verbatim", async () => {
    await handleToolCall(
      "worldanvil_update_article",
      {
        article_id: "art-1",
        content: BBCODE,
        fields: { sidebarcontent: "**s**" },
        raw: true,
      },
      client,
    );
    const [, payload] = client.updateArticle.mock.calls[0];
    expect(payload.content).toBe(BBCODE);
    expect(payload.sidebarcontent).toBe("**s**");
    expect(payload.raw).toBeUndefined();
  });

  it("create_article honours raw", async () => {
    await handleToolCall(
      "worldanvil_create_article",
      { title: "T", world_id: "w-1", content: BBCODE, raw: true },
      client,
    );
    const [payload] = client.createArticle.mock.calls[0];
    expect(payload.content).toBe(BBCODE);
  });
});

describe("worldanvil_update_world", () => {
  let client;
  beforeEach(() => {
    client = makeMockClient();
  });

  it("sends only the fields passed", async () => {
    await handleToolCall(
      "worldanvil_update_world",
      { world_id: "w-1", title: "Terminus" },
      client,
    );
    const [id, payload] = client.updateWorld.mock.calls[0];
    expect(id).toBe("w-1");
    expect(payload).toEqual({ title: "Terminus" });
  });

  it("sends CSS verbatim and converts BBCode fields", async () => {
    await handleToolCall(
      "worldanvil_update_world",
      {
        world_id: "w-1",
        displayCss: CSS,
        displayPanelCss: "a * b {}",
        globalFooter: "**footer**",
        subtitle: "_plain_",
      },
      client,
    );
    const [, payload] = client.updateWorld.mock.calls[0];
    expect(payload.displayCss).toBe(CSS);
    expect(payload.displayPanelCss).toBe("a * b {}");
    expect(payload.globalFooter).toBe("[b]footer[/b]");
    expect(payload.subtitle).toBe("_plain_");
  });

  it("raw sends BBCode fields verbatim", async () => {
    await handleToolCall(
      "worldanvil_update_world",
      { world_id: "w-1", globalHeader: BBCODE, raw: true },
      client,
    );
    const [, payload] = client.updateWorld.mock.calls[0];
    expect(payload.globalHeader).toBe(BBCODE);
    expect(payload.raw).toBeUndefined();
  });

  it("ignores fields that are not on the allow-list", async () => {
    await handleToolCall(
      "worldanvil_update_world",
      { world_id: "w-1", webhookGlobal: "https://example.invalid" },
      client,
    );
    const [, payload] = client.updateWorld.mock.calls[0];
    expect(payload).toEqual({});
  });

  it("schema declares every handled field", () => {
    const tool = getToolDefinitions().find((t) => t.name === "worldanvil_update_world");
    for (const key of WORLD_UPDATE_FIELDS) {
      expect(tool.inputSchema.properties).toHaveProperty(key);
    }
    expect(tool.inputSchema.properties).toHaveProperty("raw");
  });
});
