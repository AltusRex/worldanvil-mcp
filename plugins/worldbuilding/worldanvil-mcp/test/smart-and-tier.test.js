/**
 * Smart conversion (auto mode) and the membership tier check for CSS.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { handleToolCall, resetTierCache } from "../src/handlers.js";
import { detectFormat, toBBCode, conversionMode } from "../src/utils.js";

afterEach(() => {
  delete process.env.WA_MARKDOWN;
  delete process.env.WA_TIER;
});

describe("detectFormat", () => {
  it.each([
    ["**bold** and _it_", "markdown"],
    ["A list:\n- a\n- b", "markdown"],
    ["Plain sentence, with {braces}.", "markdown"],
    ["Use a {value: 3} here", "markdown"],
    ["See @[Kara](person:1) **now**", "markdown"],
    ["[b]x[/b] **y**", "bbcode"],
    ["[container:wk-x]C[/container]", "bbcode"],
    ["[h3|anchor]T[/h3]", "bbcode"],
    ["[row][col8]a[/col8][/row]", "bbcode"],
    ["<div class=a>x</div>", "html"],
    [".a .b { color: red; }", "css"],
    [":root {\n  --wk-ink: #fff;\n}", "css"],
    ["@media (max-width: 600px) { .a { b: c } }", "css"],
    ["h1, h2 { font-family: x }", "css"],
  ])("%j is %s", (text, format) => {
    expect(detectFormat(text)).toBe(format);
  });
});

describe("auto mode", () => {
  it("converts Markdown", () => {
    expect(toBBCode("**x**")).toBe("[b]x[/b]");
  });
  it("keeps BBCode, HTML and CSS as given", () => {
    for (const t of ["[b]x[/b] *keep*", "<p>*keep*</p>", ".a * { b: c } /* *x* */"]) {
      expect(toBBCode(t)).toBe(t);
    }
  });
  it("raw: false forces conversion, raw: true forces none", () => {
    expect(conversionMode({ raw: false })).toBe("convert");
    expect(conversionMode({ raw: true })).toBe("raw");
    expect(toBBCode("[b]x[/b] **y**", "convert")).toBe("[b]x[/b] [b]y[/b]");
  });
  it("WA_MARKDOWN sets the default", () => {
    process.env.WA_MARKDOWN = "on";
    expect(conversionMode({})).toBe("convert");
    process.env.WA_MARKDOWN = "off";
    expect(conversionMode({})).toBe("raw");
    process.env.WA_MARKDOWN = "auto";
    expect(conversionMode({})).toBe("auto");
  });
  it("update_article keeps BBCode content and converts Markdown fields", async () => {
    const client = { updateArticle: vi.fn(async () => ({})) };
    await handleToolCall(
      "worldanvil_update_article",
      {
        article_id: "a",
        content: "[container:x]*keep*[/container]",
        fields: { sidebarcontent: "**side**" },
      },
      client,
    );
    const data = client.updateArticle.mock.calls[0][1];
    expect(data.content).toBe("[container:x]*keep*[/container]");
    expect(data.sidebarcontent).toBe("[b]side[/b]");
  });
});

describe("tier check", () => {
  let client;
  const world = (tier) => vi.fn(async () => ({ id: "w", ownerMembershipPrototype: tier }));
  beforeEach(() => {
    resetTierCache();
    client = {
      getWorld: world("master"),
      getArticle: vi.fn(async () => ({ id: "a", world: { id: "w" } })),
      getTimeline: vi.fn(async () => ({ id: "t", world: { id: "w" } })),
      updateWorld: vi.fn(async () => ({})),
      updateArticle: vi.fn(async () => ({})),
      createArticle: vi.fn(async () => ({})),
      updateTimeline: vi.fn(async () => ({})),
    };
  });

  it("refuses world CSS below Grandmaster and saves nothing", async () => {
    const res = await handleToolCall(
      "worldanvil_update_world",
      { world_id: "w", displayCss: ".a { b: c }", globalFooter: "x" },
      client,
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Grandmaster/);
    expect(client.updateWorld).not.toHaveBeenCalled();
  });

  it("looks up the article's world, once", async () => {
    for (let i = 0; i < 2; i++) {
      const res = await handleToolCall(
        "worldanvil_update_article",
        { article_id: "a", fields: { displayCss: ".a { b: c }" } },
        client,
      );
      expect(res.isError).toBe(true);
    }
    expect(client.getArticle).toHaveBeenCalledTimes(1);
    expect(client.getWorld).toHaveBeenCalledTimes(1);
  });

  it("refuses timeline CSS below Grandmaster", async () => {
    const res = await handleToolCall(
      "worldanvil_update_timeline",
      { timeline_id: "t", displayCss: ".horae-container { b: c }" },
      client,
    );
    expect(res.isError).toBe(true);
    expect(client.updateTimeline).not.toHaveBeenCalled();
  });

  it("allows CSS for Grandmaster and Sage", async () => {
    for (const tier of ["grandmaster", "Sage"]) {
      resetTierCache();
      client.getWorld = world(tier);
      const res = await handleToolCall(
        "worldanvil_update_world",
        { world_id: "w", displayCss: ".a { b: c }" },
        client,
      );
      expect(res.isError).toBeUndefined();
    }
    expect(client.updateWorld).toHaveBeenCalledTimes(2);
  });

  it("allows writes without CSS, and clearing CSS, on any tier", async () => {
    await handleToolCall("worldanvil_update_world", { world_id: "w", globalFooter: "x" }, client);
    await handleToolCall("worldanvil_update_world", { world_id: "w", displayCss: "" }, client);
    expect(client.updateWorld).toHaveBeenCalledTimes(2);
    expect(client.getWorld).not.toHaveBeenCalled();
  });

  it("fails open when the tier can't be read", async () => {
    client.getWorld = vi.fn(async () => {
      throw new Error("down");
    });
    const res = await handleToolCall(
      "worldanvil_update_world",
      { world_id: "w", displayCss: ".a { b: c }" },
      client,
    );
    expect(res.isError).toBeUndefined();
  });

  it("WA_TIER forces a tier without a lookup, and off disables the check", async () => {
    client.getWorld = world("grandmaster");
    process.env.WA_TIER = "journeyman";
    let res = await handleToolCall(
      "worldanvil_create_article",
      { world_id: "w", title: "T", fields: { displayCss: ".a { b: c }" } },
      client,
    );
    expect(res.isError).toBe(true);
    expect(client.getWorld).not.toHaveBeenCalled();

    process.env.WA_TIER = "off";
    client.getWorld = world("master");
    res = await handleToolCall(
      "worldanvil_create_article",
      { world_id: "w", title: "T", fields: { displayCss: ".a { b: c }" } },
      client,
    );
    expect(res.isError).toBeUndefined();
  });
});
