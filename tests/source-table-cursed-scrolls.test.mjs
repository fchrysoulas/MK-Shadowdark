import assert from "node:assert/strict";
import test from "node:test";

import {
  CURSED_SCROLL_BOOKS,
  detectCursedScrollBook,
  parseSupportedSourceTables,
} from "../scripts/source-tables/source-parser.js";
import {
  filePickerContent,
  sourceFolderName,
  supportedSourceTitles,
} from "../scripts/source-tables/source-table-importer.js";

function syntheticSource(book, number) {
  return `
# ${book.title}
<!-- PDF page ${20 + number} -->
# Synthetic Section
### SYNTHETIC TABLE
| d6 | Details |
| --- | --- |
| 1-3 | First result |
| 4-6 | Second result |
`;
}

for (const [numberText, book] of Object.entries(CURSED_SCROLL_BOOKS)) {
  const number = Number(numberText);

  test(`Cursed Scroll ${number} is detected and receives stable source metadata`, () => {
    const filename = `shadowdark-cursed-scroll-${number}.md`;
    const source = syntheticSource(book, number);

    assert.equal(detectCursedScrollBook(source, filename)?.id, book.id);

    const first = parseSupportedSourceTables(source, { filename });
    const second = parseSupportedSourceTables(source, { filename });

    assert.equal(first.book.id, book.id);
    assert.equal(first.book.title, book.title);
    assert.equal(first.tables.length, 1);
    assert.equal(first.tables[0].bookId, book.id);
    assert.equal(first.tables[0].bookTitle, book.title);
    assert.match(first.tables[0].key, new RegExp(`^${book.id}:`));
    assert.equal(first.tables[0].key, second.tables[0].key);
    assert.equal(first.tables[0].formula, "1d6");
    assert.equal(first.tables[0].importable, true);
    assert.deepEqual(first.tables[0].results.map(result => [result.low, result.high]), [
      [1, 3],
      [4, 6],
    ]);
    assert.equal(sourceFolderName(book.id), book.title);
  });
}

test("source importer advertises Core, Western Reaches, and every Cursed Scroll 1 through 6", () => {
  const titles = supportedSourceTitles();
  const picker = filePickerContent();

  assert.match(titles[0], /Shadowdark RPG Core Rulebook v4\.9/);
  assert.match(titles[1], /Player's Guide to the Western Reaches V1/);
  assert.equal(titles.length, 8);

  for (const book of Object.values(CURSED_SCROLL_BOOKS)) {
    assert.ok(titles.includes(book.title));
    assert.ok(picker.includes(book.title));
  }
});
