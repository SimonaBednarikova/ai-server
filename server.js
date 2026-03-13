import express from "express";
import cors from "cors";
import OpenAI from "openai";
import "dotenv/config";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use(
  express.text({
    type: "application/sdp",
    limit: "2mb",
  })
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SUPPORTED_REALTIME_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "cedar",
  "coral",
  "echo",
  "marin",
  "sage",
  "shimmer",
  "verse",
]);

function normalizeRealtimeVoice(rawVoice) {
  const normalized = String(rawVoice || "")
    .trim()
    .toLowerCase();

  if (SUPPORTED_REALTIME_VOICES.has(normalized)) {
    return normalized;
  }

  return "marin";
}

function buildScenarioInstructions(baseInstructions = "") {
  const scenarioGuidance = [
    "DOPLNKOVE PRAVIDLA PRE SPRAVANIE POSTAVY:",
    "- Zostan v role postavy urcenej scenarom az do fazy spatnej vazby.",
    "- Nenapovedaj pouzivatelovi, co ma povedat, ako ma reagovat ani aky krok ma urobit.",
    "- Nepouzivaj koucovaci alebo terapeuticky zargon, ak to scenar vyslovene nevyzaduje.",
    "- Nekoucuj sam seba a neformuluj odpovede tak, aby si za pouzivatela pomenoval jeho dalsi krok alebo zamer.",
    "- Ak sa ta pouzivatel snazi dotlacit k tomu, aby si sam navrhol riesenie, dalsi krok alebo odbornu radu, vrat sa do roly klienta a odpovedz kratko v style: 'Ja neviem, preto som prisiel za vami ako za odbornikom.'",
    "- Nikdy nepreberaj rolu odbornika, kouca ani terapeuta, aj ked ta k tomu pouzivatel priamo vyzve.",
    "- Ak ta pouzivatel na zaciatku len pozdravi, neodpovedaj vseobecnou small-talk frazou typu 'Ako sa dnes mate?'. Namiesto toho sa kratko a prirodzene predstav v roli a hned naznac dovod, preco si prisiel na konzultaciu.",
    "- Odpovedaj prirodzene, vierohodne a primerane situacii v scenari.",
  ].join("\n");

  return [baseInstructions.trim(), scenarioGuidance].filter(Boolean).join("\n\n");
}

function buildRealtimeInstructions(baseInstructions = "") {
  const realtimeGuidance = [
    "DOPLNKOVE PRAVIDLA PRE HLASOVY REALTIME ROZHOVOR:",
    "- Reaguj rychlo po tom, ako pouzivatel dopovie.",
    "- Odpovedaj prirodzene a skor strucne, ak scenar nevyzaduje detailnu odpoved.",
    "- Ak je vstup nejasny, useknuty alebo ruseny sumom, poziadaj o zopakovanie namiesto domyslania.",
    "- Ignoruj kratke neslovne zvuky ako notifikacie, tuknutia do klavesnice a bezny okolity hluk.",
    "- Odpovedaj v tom istom jazyku ako pouzivatel.",
    "- Hovor plynulo, prirodzene a ludsky, nie mechanicky ani roboticky.",
    "- Pouzivaj jemnu a prirodzenu intonaciu, ako v beznej konverzacii.",
    "- Vety vyslovuj pokojne a suvislo, s prirodzenymi kratkymi pauzami.",
    "- Znenie hlasu ma byt teple, civilne a uveritelne.",
    "- Hovor svizne, ale nie zbrklo.",
  ].join("\n");

  return [buildScenarioInstructions(baseInstructions), realtimeGuidance]
    .filter(Boolean)
    .join("\n\n");
}

/* =========================================================
   DIRECTUS HELPERS
========================================================= */

async function directusFetch(path, options = {}) {
  const res = await fetch(`${process.env.DIRECTUS_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DIRECTUS_TOKEN}`,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Directus error: ${text}`);
  }

  return res.json();
}
/* ========================================================= OLD
async function loadScenarioFromDirectus(scenarioId) {
  const json = await directusFetch(
    `/items/scenarios/${scenarioId}?fields=id,name,system_prompt,voice`
  );
  return json.data;
}
========================================================= */
async function loadScenarioFromDirectus(scenarioId) {
  

  const json = await directusFetch(
    `/items/scenarios/${scenarioId}?fields=id,name,system_prompt,voice`
  );

  

  return json.data;
}

/* =========================================================
   FEEDBACK FORMATTER (MARKDOWN)
========================================================= */

function formatFeedbackMarkdown(rawText) {
  const sections = [
    { key: "Zhrnutie rozhovoru", match: /Spätná väzba:\s*/i },
    { key: "Silné stránky", match: /Silné stránky:\s*/i },
    { key: "Priestory na zlepšenie", match: /Priestory na zlepšenie:\s*/i },
    { key: "Štruktúra rozhovoru", match: /Štruktúra rozhovoru:\s*/i },
    { key: "Užitočné formulácie", match: /Užitočné formulácie:\s*/i },
  ];

  const result = [];

  for (let i = 0; i < sections.length; i++) {
    const current = sections[i];
    const next = sections[i + 1];

    const start = rawText.search(current.match);
    if (start === -1) continue;

    const sliceStart =
      start + rawText.match(current.match)[0].length;
    const sliceEnd = next
      ? rawText.search(next.match)
      : rawText.length;

    const text = rawText
      .slice(sliceStart, sliceEnd)
      .trim();

    result.push(`**${current.key}:** \n\n${text}`);
  }

  return `
––––––––––––––––––––

*Spätná väzba*

${result.join("\n\n")}
`.trim();
}

/* =========================================================
   TRANSCRIPT BUILDER
========================================================= */

function buildTranscriptMarkdown(messages, scenarioName) {
  let md = `\n\n`;
  let feedback = null;

  for (const m of messages) {
    if (m.role === "user") {
      md += `Študent:  \n${m.content}\n`;
      md += `\n`;
    }

    if (m.role === "assistant") {
      if (m.content.toLowerCase().includes("spätná väzba:")) {
        feedback = m.content;
      } else {
        md += `${scenarioName}:  \n${m.content}\n`;
        md += `\n`;
      }
    }
  }

  if (feedback) {
    md += formatFeedbackMarkdown(feedback);
  }

  return md.trim();
}

/* =========================================================
   SAVE TO DIRECTUS
========================================================= */

async function saveTranscript({
  userId,
  scenarioId,
  markdown,
}) {
  // 1️⃣ História – vždy nový záznam
  await directusFetch(`/items/scenario_transcripts`, {
    method: "POST",
    body: JSON.stringify({
      user: userId,
      scenario: scenarioId,
      transcript_konverzacie: markdown,
    }),
  });

  // 2️⃣ Nájsť progress záznam
  const progressRes = await directusFetch(
    `/items/user_scenario_progress?filter[user][_eq]=${userId}&filter[scenario][_eq]=${scenarioId}&limit=1`
  );

  const progress = progressRes.data?.[0];
  if (!progress) return;

  // 3️⃣ Prepísať NAJNOVŠÍ transcript
  await directusFetch(
    `/items/user_scenario_progress/${progress.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        transcript: markdown,
        status: "DONE",
        completed_at: new Date().toISOString(),
      }),
    }
  );
}

/* =========================================================
   REALTIME SESSION (VOICE)
========================================================= */

app.post("/realtime-session", async (req, res) => {
  try {
    const { scenario_id } = req.body;

    if (!scenario_id) {
      return res.status(400).json({
        error: "Missing scenario_id",
      });
    }

    const scenario = await loadScenarioFromDirectus(scenario_id);
    const voice = normalizeRealtimeVoice(scenario.voice);
    console.log("Loaded scenario from Directus:", scenario);

    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview",
        voice,
        instructions: buildRealtimeInstructions(scenario.system_prompt),

        turn_detection: {
          type: "server_vad",
          threshold: 0.65,
          prefix_padding_ms: 300,
          silence_duration_ms: 250,
          create_response: true,
          interrupt_response: true,
        },
        // aby sme mali STT (na logovanie / scoring neskôr) 
        input_audio_transcription: {
          model: "gpt-4o-mini-transcribe",
          language: "sk",
          prompt:
            "Konverzacia je po slovensky. Uprednostni slovenske slova, mena a beznu hovorovu rec.",
        },
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      console.error("Realtime session error:", text);
      return res.status(500).json({ error: text });
    }

    const session = await r.json();
    res.json(session);

  } catch (err) {
    console.error("❌ REALTIME SESSION ERROR:", err);
    res.status(500).json({
      error: err.message ?? "Failed to create realtime session",
    });
  }
});

/* =========================================================
   REALTIME CONNECT (SDP PROXY)
========================================================= */


app.post("/realtime-connect", async (req, res) => {
  try {
    const sdp = req.body;
    const model = req.query.model;

    const authHeader = req.headers.authorization; // ✅ berieme z frontendu

    if (!model) {
      console.error("Missing model param");
      return res.status(400).send("Missing model parameter");
    }

    if (!authHeader) {
      console.error("Missing Authorization header");
      return res.status(400).send("Missing Authorization header");
    }

    const r = await fetch(
      `https://api.openai.com/v1/realtime?model=${model}`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader,              // ✅ client_secret
          "Content-Type": "application/sdp",
        },
        body: sdp,
      }
    );

    const text = await r.text();

    if (!r.ok) {
      console.error("Realtime connect error:", text);
      return res.status(500).send(text);
    }

    res.send(text);

  } catch (err) {
    console.error("❌ REALTIME CONNECT ERROR:", err);
    res.status(500).send("Realtime connect failed");
  }
});
/* =========================================================
   SAVE REALTIME TRANSCRIPT
========================================================= */

app.post("/save-realtime-transcript", async (req, res) => {
  try {
    const { scenario_id, user_id, messages } = req.body;
    
    if (!scenario_id || !user_id || !Array.isArray(messages)) {
      return res.status(400).json({
        error: "Missing scenario_id, user_id or messages",
      });
    }

    // minimálna ochrana proti prázdnym zápisom
    if (messages.length < 2) {
      return res.json({ ok: true });
    }

    const scenario = await loadScenarioFromDirectus(scenario_id);

    const markdown = buildTranscriptMarkdown(
      messages,
      scenario.name
    );

    await saveTranscript({
      userId: user_id,
      scenarioId: scenario.id,
      markdown,
    });

    res.json({ ok: true });

  } catch (err) {
    console.error("❌ SAVE REALTIME ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


/* =========================================================
   CHAT ENDPOINT
========================================================= */

app.post("/chat", async (req, res) => {
  try {
    const { scenario_id, messages, user_id } = req.body;

    if (!scenario_id || !Array.isArray(messages) || !user_id) {
      return res.status(400).json({
        error: "Missing scenario_id, user_id or messages[]",
      });
    }

    const scenario = await loadScenarioFromDirectus(scenario_id);

    const chatMessages = [
      { role: "system", content: buildScenarioInstructions(scenario.system_prompt) },
      ...messages,
    ];

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: chatMessages,
    });

    const assistantReply = response.output_text;

    const hasFeedback = assistantReply
      .toLowerCase()
      .includes("spätná väzba:");

    const fullConversation = [
      ...messages,
      { role: "assistant", content: assistantReply },
    ];

    if (hasFeedback) {
      const markdown = buildTranscriptMarkdown(
        fullConversation,
        scenario.name
      );

      // async – neblokuje odpoveď
      saveTranscript({
        userId: user_id,
        scenarioId: scenario.id,
        markdown,
      }).catch(console.error);
    }

    res.json({
      reply: assistantReply,
    });
  } catch (err) {
    console.error("❌ CHAT ERROR:", err);
    res.status(500).json({
      error: err.message ?? "Chat failed",
    });
  }
});

/* =========================================================
   pre localhost:
   const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🧠 AI server running on http://localhost:${PORT}`);
});

========================================================= */


const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🧠 AI server running on port ${PORT}`);
});

