import { describe, expect, it } from "vitest";
import Linkify from "./Linkify";
import type { ReactElement } from "react";

// Rendered without a DOM: Linkify returns an array of strings and anchor
// elements, so the pieces can be inspected directly.
function parts(text: string) {
  const out = Linkify({ text }) as unknown as (string | ReactElement)[];
  return out.map((p) => (typeof p === "string" ? p : { href: (p.props as { href: string }).href }));
}

describe("Linkify", () => {
  it("leaves text with no URL alone", () => {
    expect(parts("Go to Account Security and upload MFA")).toEqual([
      "Go to Account Security and upload MFA",
    ]);
  });

  it("links an http(s) URL and keeps the surrounding text", () => {
    expect(parts("Link: https://percipio.com/x here")).toEqual([
      "Link: ",
      { href: "https://percipio.com/x" },
      " here",
    ]);
  });

  it("leaves a sentence's full stop out of the link", () => {
    expect(parts("see https://x.com.")).toEqual(["see ", { href: "https://x.com" }, "."]);
  });

  it("keeps a bracket that opened inside the URL", () => {
    expect(parts("https://en.wikipedia.org/wiki/A_(b)")).toEqual([
      { href: "https://en.wikipedia.org/wiki/A_(b)" },
    ]);
  });

  it("drops an unbalanced closing bracket", () => {
    expect(parts("(see https://x.com)")).toEqual(["(see ", { href: "https://x.com" }, ")"]);
  });

  it("gives a bare www. link a scheme", () => {
    expect(parts("www.unisys.com")).toEqual([{ href: "https://www.unisys.com" }]);
  });

  it("does NOT link a javascript: URL", () => {
    // eslint-disable-next-line no-script-url
    expect(parts("javascript:alert(1)")).toEqual(["javascript:alert(1)"]);
  });

  it("does NOT link a data: URL", () => {
    expect(parts("data:text/html;base64,abcd")).toEqual(["data:text/html;base64,abcd"]);
  });

  it("handles several links in one description", () => {
    expect(parts("a https://one.com b https://two.com")).toEqual([
      "a ",
      { href: "https://one.com" },
      " b ",
      { href: "https://two.com" },
    ]);
  });

  it("survives a very long query string, as safelinks produces", () => {
    const long = "https://nam12.safelinks.protection.outlook.com/?url=https%3A%2F%2Fx&data=05%7C02%7C";
    expect(parts(`Link: ${long}`)).toEqual(["Link: ", { href: long }]);
  });
});
