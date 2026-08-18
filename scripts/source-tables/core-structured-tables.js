const CORE_BOOK_ID = "shadowdark-core-v4.9";

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value).toLowerCase();
}

function contextIncludes(table, value) {
  const needle = normalize(value);
  return (table?.context ?? []).some(entry => normalize(entry) === needle);
}

function labelFields(headers, values) {
  if (headers.length !== values.length) return null;
  return headers.map((header, index) => `${header}: ${values[index]}`).join(" | ");
}

function splitCapitalPhrases(text, expectedCount) {
  const words = clean(text).split(" ").filter(Boolean);
  if (!words.length) return null;
  const starts = [];
  words.forEach((word, index) => {
    if (/^[A-ZÀ-ÖØ-Þ]/u.test(word)) starts.push(index);
  });
  if (starts[0] !== 0 || starts.length !== expectedCount) return null;
  const values = starts.map((start, index) => (
    words.slice(start, starts[index + 1] ?? words.length).join(" ")
  ));
  return values.every(Boolean) ? values : null;
}

function splitMatrixPhrases(text, expectedCount) {
  const words = clean(text).split(" ").filter(Boolean);
  if (!words.length) return null;
  const starts = [];
  words.forEach((word, index) => {
    if (/^[A-ZÀ-ÖØ-Þ]/u.test(word) || /^\d+d\d+/iu.test(word)) starts.push(index);
  });
  if (starts[0] !== 0 || starts.length !== expectedCount) return null;
  const values = starts.map((start, index) => (
    words.slice(start, starts[index + 1] ?? words.length).join(" ")
  ));
  return values.every(Boolean) ? values : null;
}

function splitPossessiveProperNames(text, expectedCount) {
  const words = clean(text).split(" ").filter(Boolean);
  const values = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (/['’]s$/iu.test(word) && index + 1 < words.length) {
      values.push(`${word} ${words[index + 1]}`);
      index += 1;
    } else {
      values.push(word);
    }
  }
  return values.length === expectedCount ? values : null;
}

function splitFixedTokens(text, expectedCount) {
  const values = clean(text).split(/\s+/).filter(Boolean);
  return values.length === expectedCount ? values : null;
}

function splitSettlementType(text) {
  const match = /^(.*?)\s+(\d+d\d+)$/iu.exec(clean(text));
  if (!match) return null;
  return [clean(match[1]), clean(match[2])];
}

function splitGeneratorNameKnownFor(text) {
  const words = clean(text).split(" ").filter(Boolean);
  if (words.length < 3) return null;

  let nameLength = 2;
  if (normalize(words[0]) === "the") {
    nameLength = words[2] === "&" ? 4 : 3;
  } else if (words[1] === "&") {
    nameLength = 3;
  }

  if (words.length <= nameLength) return null;
  const name = words.slice(0, nameLength).join(" ");
  const knownFor = words.slice(nameLength).join(" ");
  if (!name || !knownFor || !/^[A-ZÀ-ÖØ-Þ]/u.test(knownFor)) return null;
  return [name, knownFor];
}

function coreDenseSchema(table) {
  const title = normalize(table?.title);

  if (title === "settlement name") {
    return {
      headers: ["Village", "Town", "City/Metropolis"],
      split: text => splitPossessiveProperNames(text, 3),
    };
  }

  if (title === "type" && contextIncludes(table, "Settlement Maps")) {
    return {
      headers: ["Settlement Type", "Dice"],
      split: splitSettlementType,
    };
  }

  if (title === "npc qualities") {
    return {
      headers: ["Appearance", "Does", "Secret"],
      split: text => splitCapitalPhrases(text, 3),
    };
  }

  if (title === "occupation" && contextIncludes(table, "NPCs")) {
    return {
      headers: ["1", "2", "3", "4"],
      split: text => splitCapitalPhrases(text, 4),
    };
  }

  if (title === "npc names by ancestry") {
    return {
      headers: ["Dwarf", "Elf", "Goblin", "Halfling", "Half-Orc", "Human"],
      split: text => splitFixedTokens(text, 6),
    };
  }

  if (title === "tavern generator" && contextIncludes(table, "Taverns")) {
    return {
      headers: ["Name", "Known For"],
      split: splitGeneratorNameKnownFor,
    };
  }

  if (title === "food" && contextIncludes(table, "Taverns")) {
    return {
      headers: ["Poor (1d4 cp)", "Standard (1d6 sp)", "Wealthy (1d8 gp)"],
      split: text => splitCapitalPhrases(text, 3),
    };
  }

  if (title === "shop generator" && contextIncludes(table, "Shops")) {
    return {
      headers: ["Name", "Known For"],
      split: splitGeneratorNameKnownFor,
    };
  }

  if (title === "interesting customer" && contextIncludes(table, "Shops")) {
    return {
      headers: ["1", "2", "3", "4"],
      split: text => splitMatrixPhrases(text, 4),
    };
  }

  return null;
}

function structureCoreDenseTable(table) {
  if (String(table?.bookId ?? "") !== CORE_BOOK_ID) return table;
  const schema = coreDenseSchema(table);
  if (!schema) return table;

  const warnings = [...(table.warnings ?? [])];
  const results = (table.results ?? []).map(result => {
    const values = schema.split(result.text);
    if (!values) {
      warnings.push(`Could not split source row ${result.raw} into ${schema.headers.length} structured columns for ${table.title}; preserved original text.`);
      return { ...result };
    }
    return {
      ...result,
      text: labelFields(schema.headers, values),
    };
  });

  return {
    ...table,
    columns: [table.formulaRaw, ...schema.headers],
    results,
    warnings: [...new Set(warnings)],
  };
}

function structureCoreDenseTables(tables = []) {
  return tables.map(structureCoreDenseTable);
}

export {
  CORE_BOOK_ID,
  clean,
  normalize,
  contextIncludes,
  labelFields,
  splitCapitalPhrases,
  splitMatrixPhrases,
  splitPossessiveProperNames,
  splitFixedTokens,
  splitSettlementType,
  splitGeneratorNameKnownFor,
  coreDenseSchema,
  structureCoreDenseTable,
  structureCoreDenseTables,
};