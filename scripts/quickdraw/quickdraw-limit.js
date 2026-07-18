// Evaluates Quickdraw limit expressions and reports their actor and gear sources.
function getProperty(object, path) {
  if (!object || !path) return undefined;

  return String(path)
    .split(".")
    .filter(Boolean)
    .reduce((value, key) => value?.[key], object);
}

function getActorRollData(actor) {
  try {
    return actor?.getRollData?.() ?? actor?.system ?? {};
  } catch (_error) {
    return actor?.system ?? {};
  }
}

function resolveActorReference(actor, rawPath) {
  let path = String(rawPath ?? "").replace(/^@/, "").trim();
  if (!path) throw new Error("Actor references require a path after @.");

  // Short ability aliases such as @dex.mod are easier to use in settings.
  if (/^(str|dex|con|int|wis|cha)(?:\.|$)/i.test(path)) {
    path = `abilities.${path.toLowerCase()}`;
  }

  const rollData = getActorRollData(actor);
  const candidates = path.startsWith("system.")
    ? [getProperty(actor, path)]
    : [
        getProperty(rollData, path),
        getProperty(actor?.system, path),
        getProperty(actor, path)
      ];

  const value = candidates.find(candidate => candidate !== undefined && candidate !== null);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Actor reference @${rawPath} is missing or is not numeric.`);
  }

  return numeric;
}

function getCarriedGearMatches(actor, searchText) {
  const search = String(searchText ?? "").trim().toLocaleLowerCase();
  if (!search) throw new Error("gear() requires a non-empty item name.");

  const matches = [];
  for (const item of Array.from(actor?.items ?? [])) {
    if (item?.system?.stashed === true) continue;
    if (!String(item?.name ?? "").toLocaleLowerCase().includes(search)) continue;

    const quantity = Number(item?.system?.quantity);
    matches.push({
      id: item?.id ?? item?._id ?? "",
      name: String(item?.name ?? searchText),
      quantity: Number.isFinite(quantity) ? Math.max(0, quantity) : 1
    });
  }

  return {
    search,
    matches,
    quantity: matches.reduce((total, match) => total + match.quantity, 0)
  };
}

function countCarriedGear(actor, searchText) {
  return getCarriedGearMatches(actor, searchText).quantity;
}

function tokenize(expression) {
  const input = String(expression ?? "");
  const tokens = [];
  let index = 0;

  while (index < input.length) {
    const character = input[index];

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    if (/\d/.test(character) || (character === "." && /\d/.test(input[index + 1] ?? ""))) {
      const start = index;
      index += 1;
      while (/\d/.test(input[index] ?? "")) index += 1;
      if (input[index] === ".") {
        index += 1;
        while (/\d/.test(input[index] ?? "")) index += 1;
      }
      tokens.push({ type: "number", value: Number(input.slice(start, index)) });
      continue;
    }

    if (character === "@") {
      const start = ++index;
      while (/[A-Za-z0-9_.]/.test(input[index] ?? "")) index += 1;
      if (index === start) throw new Error("Actor references require a path after @.");
      tokens.push({ type: "reference", value: input.slice(start, index) });
      continue;
    }

    if (/[A-Za-z_]/.test(character)) {
      const start = index;
      index += 1;
      while (/[A-Za-z0-9_]/.test(input[index] ?? "")) index += 1;
      tokens.push({ type: "identifier", value: input.slice(start, index) });
      continue;
    }

    if (character === "\"" || character === "'") {
      const quote = character;
      let value = "";
      index += 1;

      while (index < input.length && input[index] !== quote) {
        if (input[index] === "\\" && index + 1 < input.length) index += 1;
        value += input[index];
        index += 1;
      }

      if (input[index] !== quote) throw new Error("Unterminated string in Quickdraw expression.");
      index += 1;
      tokens.push({ type: "string", value });
      continue;
    }

    if ("+-*/%^(),".includes(character)) {
      tokens.push({ type: "operator", value: character });
      index += 1;
      continue;
    }

    throw new Error(`Unsupported character "${character}" in Quickdraw expression.`);
  }

  tokens.push({ type: "eof", value: "" });
  return tokens;
}

function requireNumbers(name, args, expectedCount = null) {
  if (expectedCount !== null && args.length !== expectedCount) {
    throw new Error(`${name}() requires ${expectedCount} argument${expectedCount === 1 ? "" : "s"}.`);
  }

  const values = args.map(value => Number(value));
  if (values.some(value => !Number.isFinite(value))) {
    throw new Error(`${name}() only accepts numeric arguments.`);
  }
  return values;
}

function formatReferenceLabel(rawPath) {
  const path = String(rawPath ?? "").replace(/^@/, "").replace(/^system\./i, "");
  const ability = path.match(/^(?:abilities\.)?(str|dex|con|int|wis|cha)\.mod$/i);
  if (ability) return `${ability[1].toUpperCase()} Modifier`;

  return path
    .replace(/^abilities\./i, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[._]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Actor Value";
}

function formatGearLabel(searchText) {
  return String(searchText ?? "Gear")
    .trim()
    .replace(/\b\p{L}/gu, letter => letter.toLocaleUpperCase());
}

function recordEvaluationSource(context, source) {
  if (!context?.sources) return;

  const existing = context.sources.find(entry => entry.key === source.key);
  if (!existing) {
    context.sources.push({ ...source, occurrences: 1 });
    return;
  }

  existing.occurrences += 1;
  existing.value += source.value;
  if (source.type === "gear") existing.quantity += source.quantity;
}

function callFunction(name, args, actor, context = null) {
  const normalized = String(name).toLowerCase();

  if (normalized === "gear") {
    if (args.length < 1 || args.length > 2 || typeof args[0] !== "string") {
      throw new Error('gear() requires a quoted item name and an optional slot value, for example gear("bandolier", 2).');
    }

    const gear = getCarriedGearMatches(actor, args[0]);
    let slotsPerItem = 1;

    if (args.length === 2) {
      [slotsPerItem] = requireNumbers("gear", [args[1]], 1);
      if (slotsPerItem < 0) throw new Error("gear() slot value cannot be negative.");
    }

    const value = gear.quantity * slotsPerItem;
    recordEvaluationSource(context, {
      type: "gear",
      key: `gear:${gear.search}:${slotsPerItem}`,
      label: gear.matches.length === 1 ? gear.matches[0].name : formatGearLabel(args[0]),
      search: gear.search,
      quantity: gear.quantity,
      slotsPerItem,
      matches: gear.matches,
      value
    });
    return value;
  }

  if (normalized === "min" || normalized === "max") {
    const values = requireNumbers(normalized, args);
    if (!values.length) throw new Error(`${normalized}() requires at least one argument.`);
    return normalized === "min" ? Math.min(...values) : Math.max(...values);
  }

  if (["floor", "ceil", "round", "trunc", "abs"].includes(normalized)) {
    const [value] = requireNumbers(normalized, args, 1);
    return Math[normalized](value);
  }

  if (normalized === "clamp") {
    const [value, minimum, maximum] = requireNumbers(normalized, args, 3);
    return Math.min(Math.max(value, minimum), maximum);
  }

  throw new Error(`Unsupported Quickdraw function: ${name}().`);
}

class QuickdrawExpressionParser {
  constructor(expression, actor, context = null) {
    this.tokens = tokenize(expression);
    this.position = 0;
    this.actor = actor;
    this.context = context;
  }

  current() {
    return this.tokens[this.position];
  }

  match(value) {
    if (this.current()?.value !== value) return false;
    this.position += 1;
    return true;
  }

  expect(value) {
    if (!this.match(value)) throw new Error(`Expected "${value}" in Quickdraw expression.`);
  }

  parse() {
    const value = this.parseAdditive();
    if (this.current()?.type !== "eof") {
      throw new Error(`Unexpected token "${this.current()?.value}" in Quickdraw expression.`);
    }
    return value;
  }

  parseAdditive() {
    let value = this.parseMultiplicative();
    while (this.current()?.value === "+" || this.current()?.value === "-") {
      const operator = this.current().value;
      this.position += 1;
      const right = this.parseMultiplicative();
      value = operator === "+" ? Number(value) + Number(right) : Number(value) - Number(right);
    }
    return value;
  }

  parseMultiplicative() {
    let value = this.parsePower();
    while (["*", "/", "%"].includes(this.current()?.value)) {
      const operator = this.current().value;
      this.position += 1;
      const right = this.parsePower();
      if (operator === "*") value = Number(value) * Number(right);
      else if (operator === "/") value = Number(value) / Number(right);
      else value = Number(value) % Number(right);
    }
    return value;
  }

  parsePower() {
    let value = this.parseUnary();
    if (this.match("^")) value = Number(value) ** Number(this.parsePower());
    return value;
  }

  parseUnary() {
    if (this.match("+")) return Number(this.parseUnary());
    if (this.match("-")) return -Number(this.parseUnary());
    return this.parsePrimary();
  }

  parsePrimary() {
    const token = this.current();

    if (token?.type === "number" || token?.type === "string") {
      this.position += 1;
      return token.value;
    }

    if (token?.type === "reference") {
      this.position += 1;
      const value = resolveActorReference(this.actor, token.value);
      recordEvaluationSource(this.context, {
        type: "reference",
        key: `reference:${String(token.value).toLowerCase()}`,
        label: formatReferenceLabel(token.value),
        path: token.value,
        value
      });
      return value;
    }

    if (token?.type === "identifier") {
      this.position += 1;
      const name = token.value;
      this.expect("(");
      const args = [];
      if (!this.match(")")) {
        do {
          args.push(this.parseAdditive());
        } while (this.match(","));
        this.expect(")");
      }
      return callFunction(name, args, this.actor, this.context);
    }

    if (this.match("(")) {
      const value = this.parseAdditive();
      this.expect(")");
      return value;
    }

    throw new Error(`Unexpected token "${token?.value ?? ""}" in Quickdraw expression.`);
  }
}

function evaluateQuickdrawLimitDetails(expression, actor) {
  const source = String(expression ?? "").trim();
  if (!source) throw new Error("Quickdraw limit expression cannot be blank.");

  const context = { sources: [] };
  const result = Number(new QuickdrawExpressionParser(source, actor, context).parse());
  if (!Number.isFinite(result)) throw new Error("Quickdraw limit expression did not produce a finite number.");

  // Preserve the previous meaning of 0 (unlimited) and use whole item counts.
  const total = Math.max(0, Math.floor(result));
  if (!context.sources.length) {
    context.sources.push({
      type: "fixed",
      key: "fixed",
      label: total === 0 ? "Unlimited" : "Fixed Limit",
      value: total,
      occurrences: 1
    });
  } else {
    // Account for fixed numbers, min/max/clamp effects, multiplication, and
    // final flooring so the sidebar source rows reconcile to the shown total.
    const sourceTotal = context.sources.reduce((sum, entry) => sum + Number(entry.value ?? 0), 0);
    const adjustment = total - sourceTotal;
    if (Math.abs(adjustment) > Number.EPSILON) {
      context.sources.push({
        type: "adjustment",
        key: "expression-adjustment",
        label: "Base",
        value: adjustment,
        occurrences: 1
      });
    }
  }

  return { expression: source, total, sources: context.sources };
}

function evaluateQuickdrawLimit(expression, actor) {
  return evaluateQuickdrawLimitDetails(expression, actor).total;
}

export {
  countCarriedGear,
  evaluateQuickdrawLimit,
  evaluateQuickdrawLimitDetails,
  getCarriedGearMatches,
  resolveActorReference
};
