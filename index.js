// ============================================================
//  SeuConcierge IA — Servidor da Ponte do WhatsApp
//  Recebe mensagens do WhatsApp, consulta o Claude e responde.
// ============================================================

const express = require("express");
const app = express();
app.use(express.json());

// ---- Credenciais (lidas das variáveis de ambiente do Railway) ----
const VERIFY_TOKEN     = process.env.VERIFY_TOKEN;       // senha do webhook (você inventa)
const WHATSAPP_TOKEN   = process.env.WHATSAPP_TOKEN;     // token da Meta
const PHONE_NUMBER_ID  = process.env.PHONE_NUMBER_ID;    // 1199532673244233
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY; // chave sk-ant-...

// ---- Personalidade do concierge (system prompt) ----
const SYSTEM_PROMPT = `Você é o SeuConcierge, um atendente digital de hotelaria, cordial, prestativo e profissional.
Você atende hóspedes 24 horas por dia. Responda de forma calorosa, breve e clara.
Se não souber uma informação específica do hotel (preço, horário exato, disponibilidade),
diga que vai verificar com a recepção e oriente o hóspede com gentileza.
Responda sempre no mesmo idioma em que o hóspede escrever (português, inglês ou espanhol).`;

// ============================================================
//  1) VERIFICAÇÃO DO WEBHOOK (a Meta chama isto uma vez)
// ============================================================
app.get("/webhook", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verificado com sucesso!");
    res.status(200).send(challenge);
  } else {
    console.log("Falha na verificação do webhook.");
    res.sendStatus(403);
  }
});

// ============================================================
//  2) RECEBER MENSAGENS (a Meta chama isto a cada mensagem)
// ============================================================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // responde rápido pra Meta não reenviar

  try {
    const entry  = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value  = change?.value;
    const message = value?.messages?.[0];

    // Se não for uma mensagem de texto, ignora (status, etc.)
    if (!message || message.type !== "text") return;

    const from = message.from;             // número do hóspede
    const texto = message.text.body;       // o que o hóspede escreveu
    console.log(`Mensagem de ${from}: ${texto}`);

    // ---- Consulta o Claude ----
    const resposta = await consultarClaude(texto);

    // ---- Envia a resposta de volta no WhatsApp ----
    await enviarWhatsApp(from, resposta);

  } catch (erro) {
    console.error("Erro ao processar mensagem:", erro);
  }
});

// ============================================================
//  Função: consultar o Claude (a inteligência)
// ============================================================
async function consultarClaude(textoDoHospede) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: textoDoHospede }],
      }),
    });

    const dados = await r.json();
    if (dados.content && dados.content[0] && dados.content[0].text) {
      return dados.content[0].text;
    }
    return "Desculpe, não consegui processar agora. Vou chamar a recepção para ajudar você.";
  } catch (e) {
    console.error("Erro Claude:", e);
    return "Desculpe, tive um problema técnico. Já estou acionando a recepção.";
  }
}

// ============================================================
//  Função: enviar mensagem pelo WhatsApp (Meta Cloud API)
// ============================================================
async function enviarWhatsApp(para, texto) {
  try {
    await fetch(`https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: para,
        text: { body: texto },
      }),
    });
    console.log(`Resposta enviada para ${para}`);
  } catch (e) {
    console.error("Erro ao enviar WhatsApp:", e);
  }
}

// ============================================================
//  Rota inicial (só pra confirmar que o servidor está no ar)
// ============================================================
app.get("/", (req, res) => {
  res.send("SeuConcierge IA está no ar! 🔑");
});

// ============================================================
//  Liga o servidor
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SeuConcierge rodando na porta ${PORT}`);
});
