/**
 * WA_MARKDOWN, raw on every converting tool, timeline CSS, variable titles,
 * and the copyright/displayFak world fields.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { handleToolCall } from "../src/handlers.js";
import { getToolDefinitions, RAW_CAPABLE_TOOLS } from "../src/tools.js";

const stub = () => vi.fn(async () => ({}));
const client = () => ({
  updateCategory: stub(),
  updateHistory: stub(),
  updateWorld: stub(),
  updateTimeline: stub(),
  createVariable: stub(),
  updateVariable: stub(),
});

afterEach(() => {
  delete process.env.WA_MARKDOWN;
});

describe("raw on other converting tools", () => {
  it("converts by default", async () => {
    const c = client();
    await handleToolCall("worldanvil_update_category", { category_id: "x", content: "*x*" }, c);
    expect(c.updateCategory.mock.calls[0][1].custom1).toBe("[i]x[/i]");
  });

  it("raw: true skips conversion", async () => {
    const c = client();
    await handleToolCall(
      "worldanvil_update_history",
      { history_id: "h", fullcontent: "*x*", raw: true },
      c,
    );
    expect(c.updateHistory.mock.calls[0][1].fullcontent).toBe("*x*");
  });

  it("WA_MARKDOWN=off makes raw the default", async () => {
    process.env.WA_MARKDOWN = "off";
    const c = client();
    await handleToolCall("worldanvil_update_category", { category_id: "x", content: "*x*" }, c);
    expect(c.updateCategory.mock.calls[0][1].custom1).toBe("*x*");
  });

  it("every converting tool advertises raw", () => {
    const tools = getToolDefinitions();
    for (const name of RAW_CAPABLE_TOOLS) {
      const t = tools.find((x) => x.name === name);
      expect(t, name).toBeTruthy();
      expect(t.inputSchema.properties.raw.type, name).toBe("boolean");
    }
  });
});

describe("world, timeline and variable styling fields", () => {
  it("update_world sends copyright and displayFak", async () => {
    const c = client();
    await handleToolCall(
      "worldanvil_update_world",
      { world_id: "w", copyright: "[b]C[/b]", displayFak: "abc_123_x" },
      c,
    );
    expect(c.updateWorld.mock.calls[0][1]).toEqual({
      copyright: "[b]C[/b]",
      displayFak: "abc_123_x",
    });
  });

  it("update_timeline sends displayCss verbatim", async () => {
    const c = client();
    const css = ".horae-pin-wrapper-Major\\/Global * { color: red; } /* a *b* */";
    await handleToolCall("worldanvil_update_timeline", { timeline_id: "t", displayCss: css }, c);
    expect(c.updateTimeline.mock.calls[0][1].displayCss).toBe(css);
  });

  it("create_variable and update_variable send title", async () => {
    const c = client();
    await handleToolCall(
      "worldanvil_create_variable",
      { collection_id: "c", world_id: "w", k: "k", type: "string", v: "", title: "[b]T[/b]" },
      c,
    );
    expect(c.createVariable.mock.calls[0][0].title).toBe("[b]T[/b]");
    await handleToolCall("worldanvil_update_variable", { variable_id: "v", title: "U" }, c);
    expect(c.updateVariable.mock.calls[0][1]).toEqual({ title: "U" });
  });

  it("variable types are limited to the three that exist", () => {
    const t = getToolDefinitions().find((x) => x.name === "worldanvil_create_variable");
    expect(t.inputSchema.properties.type.enum).toEqual(["string", "text", "number"]);
  });
});
