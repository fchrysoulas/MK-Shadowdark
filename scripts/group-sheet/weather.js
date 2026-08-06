import {
  GROUP_SETTING_WEATHER_TEMPERATURE_TABLE,
  GROUP_SETTING_WEATHER_WIND_SPEED_TABLE,
} from "./constants.js";
import { getSettingValue } from "./group-settings.js";
import { escapeHtml } from "./utils.js";

function stripHtml(value) {
  const element = document.createElement("div");
  element.innerHTML = String(value ?? "");
  return String(element.textContent ?? element.innerText ?? "").replace(/\s+/g, " ").trim();
}

function resultText(result) {
  const directText = result?.text ?? result?.name;
  if (directText) return stripHtml(directText);

  if (typeof result?.getChatText === "function") {
    try {
      const chatText = result.getChatText();
      if (chatText) return stripHtml(chatText);
    } catch (_error) {
      // A plain RollTable result is still supported below.
    }
  }

  return stripHtml(result?.document?.name ?? "");
}

async function resolveWeatherTable(uuid, label) {
  if (!uuid) throw new Error(`${label} Rollable Table is not configured.`);

  let table = null;
  try {
    table = await fromUuid(uuid);
  } catch (_error) {
    throw new Error(`${label} Rollable Table could not be resolved.`);
  }

  if (table?.documentName !== "RollTable") {
    throw new Error(`${label} setting does not reference a Rollable Table.`);
  }

  return table;
}

async function drawWeatherTable(table, label) {
  const draw = typeof table.roll === "function"
    ? await table.roll({ recursive: false })
    : await table.draw({ displayChat: false, recursive: false });
  const result = Array.from(draw?.results ?? [])[0] ?? null;
  const text = resultText(result);

  if (!text) throw new Error(`${label} Rollable Table returned no result.`);

  return {
    text,
    roll: draw?.roll ?? null,
    tableUuid: table.uuid,
    tableName: table.name,
    formula: draw?.roll?.formula ?? "RollTable",
    total: Number.isFinite(Number(draw?.roll?.total)) ? Number(draw.roll.total) : null,
  };
}

function getWeatherLabel(travel = {}) {
  const temperature = String(travel.weatherTemperature ?? "").trim();
  const windSpeed = String(travel.weatherWindSpeed ?? "").trim();
  const temperatureSummary = summaryText(temperature);
  const windSpeedSummary = summaryText(windSpeed);

  if (temperatureSummary && windSpeedSummary) return `Temperature: ${temperatureSummary} · Wind Speed: ${windSpeedSummary}`;
  if (temperatureSummary) return `Temperature: ${temperatureSummary}`;
  if (windSpeedSummary) return `Wind Speed: ${windSpeedSummary}`;
  return String(travel.weather ?? "Not rolled");
}

function getWeatherSummaries(travel = {}) {
  const temperature = summaryText(travel.weatherTemperature);
  const windSpeed = summaryText(travel.weatherWindSpeed);

  return {
    temperature,
    windSpeed,
    hasResults: Boolean(temperature || windSpeed),
  };
}

function summaryText(text) {
  const fullText = String(text ?? "").trim();
  const periodIndex = fullText.indexOf(".");
  return periodIndex < 0 ? fullText : fullText.slice(0, periodIndex).trim();
}

function detailedResult(label, text, roll) {
  const formula = String(roll?.formula ?? "").trim();
  const total = Number(roll?.total);
  const rollDetail = Number.isFinite(total)
    ? ` [${formula || "RollTable"}: ${total}]`
    : "";
  return `${label}: ${text}${rollDetail}`;
}

function getWeatherTooltip(travel = {}) {
  const temperature = String(travel.weatherTemperature ?? "").trim();
  const windSpeed = String(travel.weatherWindSpeed ?? "").trim();

  if (temperature && windSpeed) {
    return [
      detailedResult("Temperature", temperature, travel.weatherTemperatureRoll),
      detailedResult("Wind Speed", windSpeed, travel.weatherWindSpeedRoll),
    ].join("\n");
  }
  if (temperature) return detailedResult("Temperature", temperature, travel.weatherTemperatureRoll);
  if (windSpeed) return detailedResult("Wind Speed", windSpeed, travel.weatherWindSpeedRoll);
  return "Roll weather to see the current conditions.";
}

async function rollWeather() {
  const temperatureUuid = String(getSettingValue(GROUP_SETTING_WEATHER_TEMPERATURE_TABLE, "") ?? "");
  const windSpeedUuid = String(getSettingValue(GROUP_SETTING_WEATHER_WIND_SPEED_TABLE, "") ?? "");
  const [temperatureTable, windSpeedTable] = await Promise.all([
    resolveWeatherTable(temperatureUuid, "Temperature"),
    resolveWeatherTable(windSpeedUuid, "Wind Speed"),
  ]);
  const [temperature, windSpeed] = await Promise.all([
    drawWeatherTable(temperatureTable, "Temperature"),
    drawWeatherTable(windSpeedTable, "Wind Speed"),
  ]);

  return { temperature, windSpeed };
}

async function showWeatherDice(weather) {
  if (typeof game.dice3d?.showForRoll !== "function") return;

  for (const [label, result] of [["Temperature", weather.temperature], ["Wind Speed", weather.windSpeed]]) {
    if (!result.roll) continue;

    try {
      await game.dice3d.showForRoll(result.roll, game.user, true);
    } catch (error) {
      console.warn(`MK-Shadowdark | Could not show ${label} weather roll with Dice So Nice.`, error);
    }
  }
}

function weatherChatRow(label, result) {
  const formula = String(result.formula ?? "RollTable");
  const total = Number.isFinite(Number(result.total)) ? Number(result.total) : "—";
  return `
    <div class="mk-weather-roll-row">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(result.text)}</span>
      <small>${escapeHtml(`${formula}: ${total}`)}</small>
    </div>
  `;
}

async function showWeatherChat(weather, groupActor = null) {
  const content = `
    <section class="mk-weather-roll-card">
      <h3><i class="fas fa-cloud-sun-rain"></i> Weather</h3>
      ${weatherChatRow("Temperature", weather.temperature)}
      ${weatherChatRow("Wind Speed", weather.windSpeed)}
    </section>
  `;

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: groupActor }),
    style: globalThis.CONST?.CHAT_MESSAGE_STYLES?.OTHER ?? globalThis.CONST?.CHAT_MESSAGE_TYPES?.OTHER ?? 0,
    content,
  });
}

async function showWeatherRolls(weather, groupActor = null) {
  await showWeatherDice(weather);
  return showWeatherChat(weather, groupActor);
}

export { getWeatherLabel, getWeatherSummaries, getWeatherTooltip, rollWeather, showWeatherRolls };
