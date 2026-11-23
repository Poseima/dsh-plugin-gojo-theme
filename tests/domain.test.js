import assert from "node:assert/strict";
import test from "node:test";
import { wrapDomainText } from "../lib/domain.js";

test("Canvas wrapping retains code indentation, empty lines and trailing characters", () => {
  const text = "  const id = 'abc';\n\n\treturn id;  \n";
  const lines = [...wrapDomainText(text, 40, () => 1)];
  assert.equal(lines.join("\n"), text);
});

test("long history lines render in order without breaking Unicode surrogate pairs", () => {
  const text = "甲乙🌀丙丁🧿戊己";
  const lines = [...wrapDomainText(text, 3, () => 1)];
  assert.deepEqual(lines, ["甲乙🌀", "丙丁🧿", "戊己"]);
  assert.equal(lines.join(""), text);
});
