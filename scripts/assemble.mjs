import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const partsDir = resolve('src/app-parts')
const files = (await readdir(partsDir)).filter(f => f.endsWith('.txt')).sort()
const chunks = await Promise.all(files.map(f => readFile(resolve(partsDir, f), 'utf8')))
let app = chunks.join('')

// Strengthen the visual-analysis instructions. A single photo cannot provide true depth,
// so the model must infer vessel geometry and return uncertainty instead of fake precision.
const enhancedPrompt = `אתה מנתח ארוחות מתמונה עבור אפליקציית eatit. המטרה היא הערכה שימושית ושמרנית של כמות וקלוריות מתמונה אחת, לא דיוק מעבדתי.

בצע ניתוח חזותי בשלבים:
1. זהה את סוג הכלי: צלחת שטוחה / צלחת עמוקה / קערה / קופסה / כוס / ללא כלי.
2. הערך את קוטר/רוחב הכלי בס״מ לפי פרופורציות נפוצות והפרספקטיבה בתמונה. אם לא ניתן — ציין null.
3. הערך עומק שימושי של הכלי וגובה ערימת המזון לפי שוליים, דפנות, צללים, חפיפות ופרספקטיבה.
4. לכל רכיב הערך שטח יחסי מתוך הכלי, עובי/גובה, נפח משוער במ״ל ומשקל בגרמים לפי צפיפות מזון טיפוסית.
5. חשב קלוריות ומאקרו לפי USDA FoodData Central / ערכים תזונתיים מקובלים.
6. אם שמן, רוטב, טחינה, גבינה או מרכיב סמוי לא ניתנים לזיהוי בוודאות — אל תמציא. הוסף אותם רק אם יש סימן חזותי סביר, והרחב את טווח אי-הוודאות.
7. מתמונה יחידה אין מדידת עומק אמיתית. לכן החזר גם טווח נמוך/גבוה, ובחר midpoint סביר לשדות kcal/protein/carbs/fat.

החזר JSON בלבד, בלי markdown ובלי טקסט לפני/אחרי:
{
  "is_food": true,
  "dish": "שם המנה בעברית",
  "confidence": "high" | "medium" | "low",
  "container": {
    "type": "plate|deep_plate|bowl|box|cup|none",
    "estimated_width_cm": 0,
    "estimated_depth_cm": 0,
    "basis": "הסבר קצר על קנה המידה החזותי"
  },
  "items": [{
    "name":"שם המרכיב בעברית",
    "grams":0,
    "estimated_volume_ml":0,
    "kcal":0,
    "kcal_low":0,
    "kcal_high":0,
    "protein":0,
    "carbs":0,
    "fat":0,
    "basis":"איך הוערכה הכמות בתמונה"
  }],
  "kcal_low":0,
  "kcal_high":0,
  "note":"הערה קצרה בעברית על מקור אי-הוודאות"
}

אם בתמונה אין אוכל, החזר {"is_food":false,"note":"מה כן רואים בתמונה"}.
כל המספרים עגולים וסבירים. סכום ערכי האמצע של הרכיבים צריך להיות קרוב לערכי המנה.`

app = app.replace(/const PROMPT = `[\\s\\S]*?`;\n\nasync function callAPI/, `const PROMPT = ${JSON.stringify(enhancedPrompt)};\n\nasync function callAPI`)

// Replace the browser-direct Anthropic request with a configurable backend endpoint.
// The endpoint keeps provider credentials off GitHub and out of the browser bundle.
app = app.replace(/async function callAPI\(body\) \{[\\s\\S]*?\n\}\n\nasync function analyzePhoto/, `async function callAPI(body) {
  const endpoint = window.EATIT_AI_ENDPOINT || localStorage.getItem("eatit:ai-endpoint");
  if (!endpoint) throw new Error("backend");
  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch { throw new Error("net"); }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("EATit AI backend error", res.status, detail);
    throw new Error(res.status >= 500 ? "net" : "backend");
  }
  return res.json();
}

function extractJsonLoose(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const txt = String(value || "").replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  if (!txt) throw new Error("parse");
  try { return JSON.parse(txt); } catch {}
  const start = txt.indexOf("{");
  if (start < 0) throw new Error("parse");
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < txt.length; i++) {
    const ch = txt[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === "\\\\") escaped = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(txt.slice(start, i + 1));
    }
  }
  throw new Error("parse");
}

async function analyzePhoto`)

// Accept either a normalized backend response ({result}) or an Anthropic-style content array.
app = app.replace(/async function analyzePhoto\(dataUrl, hint\) \{[\\s\\S]*?\n\}\n\n\/\* --------------------------- advice chat/, `async function analyzePhoto(dataUrl, hint) {
  const payload = {
    task: "meal_vision",
    image: { media_type: "image/jpeg", base64: dataUrl.split(",")[1] },
    prompt: PROMPT + (hint ? `\\n\\nהמשתמש הוסיף: "${hint}" — קח את זה בחשבון.` : "")
  };
  const data = await callAPI(payload);
  if (data?.result) return extractJsonLoose(data.result);
  if (data?.is_food !== undefined) return data;
  const txt = (data?.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  return extractJsonLoose(txt);
}

/* --------------------------- advice chat`)

await writeFile(resolve('src/App.jsx'), app, 'utf8')
console.log(`Assembled src/App.jsx from ${files.length} parts with hardened vision analysis`)
