import fetch from "node-fetch";

const URL = "http://localhost:3001/chat";
const SCENARIO_ID = "evening_eating";

async function send(messages) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scenario_id: SCENARIO_ID,
      messages,
    }),
  });

  const data = await res.json();
  console.log("\n🤖 AI:\n", data.reply);
  return data.reply;
}

async function runConversation() {
  let messages = [];

  // 1️⃣ Začiatok
  messages.push({
    role: "user",
    content: "Dobrý deň. Čo vás dnes priviedlo na konzultáciu?",
  });
  messages.push({
    role: "assistant",
    content: await send(messages),
  });

  // 2️⃣ Skúmanie večerného jedenia
  messages.push({
    role: "user",
    content: "Kedy si to večerné jedenie všímate najviac?",
  });
  messages.push({
    role: "assistant",
    content: await send(messages),
  });

  // 3️⃣ Pocity / situácie
  messages.push({
    role: "user",
    content:
      "Čo sa v tých chvíľach zvyčajne deje? Skôr myšlienky, pocity, alebo situácie okolo vás?",
  });
  messages.push({
    role: "assistant",
    content: await send(messages),
  });

  // 4️⃣ Prehlbovanie
  messages.push({
    role: "user",
    content:
      "Keď hovoríte o tichu a náročnom dni, čo z toho je pre vás večer najsilnejšie?",
  });
  messages.push({
    role: "assistant",
    content: await send(messages),
  });

  // 5️⃣ Druhý spúšťač
  messages.push({
    role: "user",
    content:
      "Je ešte niečo iné, okrem únavy a samoty, čo vás večer ťahá k jedlu?",
  });
  messages.push({
    role: "assistant",
    content: await send(messages),
  });

  // 6️⃣ Overenie cieľa
  messages.push({
    role: "user",
    content:
      "Ak by ste to mali zhrnúť jednou vetou – čo sú tie hlavné veci, ktoré vás večer k jedlu najviac tlačia?",
  });
  messages.push({
    role: "assistant",
    content: await send(messages),
  });

  // 7️⃣ UKONČENIE – toto je kľúčové
  messages.push({
    role: "user",
    content: "konzultácia ukončená",
  });

  console.log("\n==============================");
  console.log("🧠 SPÄTNÁ VÄZBA (FÁZA 2)");
  console.log("==============================");

  await send(messages);
}

runConversation();
