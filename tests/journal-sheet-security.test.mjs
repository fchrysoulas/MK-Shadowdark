import assert from "node:assert/strict";
import test from "node:test";

import { enrichPage } from "../scripts/journal-sheet/journal-sheet.js";

const SECRET_TEXT = "The duke is the masked traitor";
const RAW_CONTENT = `<section class="secret">${SECRET_TEXT}</section><p>Public text</p>`;
const PAGE = {
  id: "journal-page-1",
  name: "Secrets",
  type: "text",
  text: { content: RAW_CONTENT }
};

async function withFoundry(foundry, callback) {
  const hadFoundry = Object.prototype.hasOwnProperty.call(globalThis, "foundry");
  const previousFoundry = globalThis.foundry;
  globalThis.foundry = foundry;

  try {
    return await callback();
  } finally {
    if (hadFoundry) globalThis.foundry = previousFoundry;
    else delete globalThis.foundry;
  }
}

test("non-owner Journal enrichment failures fail closed without logging stored secret text", async () => {
  const originalConsoleError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args.map(String).join(" "));

  try {
    const result = await withFoundry({
      applications: {
        ux: {
          TextEditor: {
            enrichHTML: async () => {
              throw new Error(`enrichment failed near ${SECRET_TEXT}`);
            }
          }
        }
      }
    }, () => enrichPage(PAGE, { isOwner: false }));

    assert.doesNotMatch(result.content, new RegExp(SECRET_TEXT));
    assert.match(result.content, /content is unavailable/i);
    assert.equal(logs.some(log => log.includes(SECRET_TEXT)), false);
  } finally {
    console.error = originalConsoleError;
  }
});

test("non-owner Journal rendering also fails closed when TextEditor enrichment is unavailable", async () => {
  const result = await withFoundry({ applications: { ux: {} } }, () => (
    enrichPage(PAGE, { isOwner: false })
  ));

  assert.doesNotMatch(result.content, new RegExp(SECRET_TEXT));
  assert.match(result.content, /content is unavailable/i);
});

test("owners retain stored Journal HTML when enrichment fails", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    const result = await withFoundry({
      applications: {
        ux: {
          TextEditor: {
            enrichHTML: async () => {
              throw new Error("enrichment failed");
            }
          }
        }
      }
    }, () => enrichPage(PAGE, { isOwner: true }));

    assert.equal(result.content, RAW_CONTENT);
  } finally {
    console.error = originalConsoleError;
  }
});

test("successful non-owner Journal enrichment uses the enriched safe result", async () => {
  const enriched = "<p>Public text</p>";
  const result = await withFoundry({
    applications: {
      ux: {
        TextEditor: {
          enrichHTML: async (_content, options) => {
            assert.equal(options.secrets, false);
            return enriched;
          }
        }
      }
    }
  }, () => enrichPage(PAGE, { isOwner: false }));

  assert.equal(result.content, enriched);
});
