// Worker mensagemapi - chat com IA (Cloudflare Workers AI) + repasse do webhook do WhatsApp.

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const ROTAS_TUNEL = ["/health", "/webhook"];
const SYSTEM_PROMPT =
  "Você é o Chat Api, um assistente de atendimento simpático. " +
  "Responda sempre em português do Brasil, de forma curta e clara.";

const HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chat Api</title>
<style>
  :root { --bg:#f4f6f5; --card:#ffffff; --text:#1c2321; --muted:#6b7773; --user:#1fa855; --bot:#e8ecea; --border:#d9dfdc; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0e1210; --card:#161c19; --text:#e8eeea; --muted:#8d9a94; --user:#17803f; --bot:#222b27; --border:#2a3430; }
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; }
  .app { width: 100%; max-width: 720px; height: 100%; display: flex; flex-direction: column; padding: 16px; gap: 12px; }
  header h1 { margin: 0; font-size: 1.15rem; }
  header p { margin: 2px 0 0; color: var(--muted); font-size: .85rem; }
  #chat { flex: 1; overflow-y: auto; background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .msg { max-width: 82%; padding: 10px 13px; border-radius: 14px; line-height: 1.45; white-space: pre-wrap; word-wrap: break-word; }
  .user { align-self: flex-end; background: var(--user); color: #fff; border-bottom-right-radius: 4px; }
  .bot { align-self: flex-start; background: var(--bot); border-bottom-left-radius: 4px; }
  .erro { align-self: center; background: #fdecea; color: #8a1c14; font-size: .9rem; }
  .vazio { margin: auto; color: var(--muted); text-align: center; font-size: .95rem; }
  form { display: flex; gap: 8px; }
  textarea { flex: 1; resize: none; padding: 11px 13px; border-radius: 12px; border: 1px solid var(--border); background: var(--card); color: var(--text); font: inherit; max-height: 140px; }
  textarea:focus { outline: 2px solid var(--user); outline-offset: 0; }
  button { border: 0; border-radius: 12px; padding: 0 20px; background: var(--user); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
  button:disabled { opacity: .5; cursor: wait; }
  .acoes { display: flex; justify-content: flex-end; }
  .limpar { background: transparent; color: var(--muted); padding: 0; font-weight: 400; font-size: .85rem; text-decoration: underline; }
</style>
</head>
<body>
<div class="app">
  <header>
    <h1>Chat Api</h1>
    
  </header>
  <div id="chat"><div class="vazio" id="vazio">Digite uma pergunta abaixo para começar.</div></div>
  <div class="acoes"><button class="limpar" id="limpar" type="button">Limpar conversa</button></div>
  <form id="form">
    <textarea id="texto" rows="1" placeholder="Escreva sua pergunta..." autofocus></textarea>
    <button id="enviar" type="submit">Enviar</button>
  </form>
</div>
<script>
  const chat = document.getElementById("chat");
  const form = document.getElementById("form");
  const texto = document.getElementById("texto");
  const enviar = document.getElementById("enviar");
  let historico = [];

  function adicionar(classe, conteudo) {
    const vazio = document.getElementById("vazio");
    if (vazio) vazio.remove();
    const div = document.createElement("div");
    div.className = "msg " + classe;
    div.textContent = conteudo;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return div;
  }

  async function perguntar(mensagem) {
    adicionar("user", mensagem);
    const aguardando = adicionar("bot", "Pensando...");
    enviar.disabled = true;
    try {
      const r = await fetch("/perguntar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: mensagem, historico: historico })
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados.erro || "Erro desconhecido");
      aguardando.textContent = dados.resposta;
      historico.push({ role: "user", content: mensagem });
      historico.push({ role: "assistant", content: dados.resposta });
    } catch (e) {
      aguardando.className = "msg erro";
      aguardando.textContent = e.message;
    } finally {
      enviar.disabled = false;
      texto.focus();
      chat.scrollTop = chat.scrollHeight;
    }
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    const msg = texto.value.trim();
    if (!msg || enviar.disabled) return;
    texto.value = "";
    texto.style.height = "auto";
    perguntar(msg);
  });

  texto.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      form.requestSubmit();
    }
  });

  texto.addEventListener("input", function () {
    texto.style.height = "auto";
    texto.style.height = Math.min(texto.scrollHeight, 140) + "px";
  });

  document.getElementById("limpar").addEventListener("click", function () {
    historico = [];
    chat.innerHTML = '<div class="vazio" id="vazio">Digite uma pergunta abaixo para começar.</div>';
  });
</script>
</body>
</html>`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status: status, headers: JSON_HEADERS });
}

function getTunnelBase(env) {
  const base = (env.TUNNEL_URL || "").trim().replace(/\/+$/, "");
  return base || null;
}

async function responderComIA(request, env) {
  if (request.method !== "POST") return json({ erro: "Use POST." }, 405);

  let dados;
  try {
    dados = await request.json();
  } catch (e) {
    return json({ erro: "Pedido inválido." }, 400);
  }

  const mensagem = String(dados.mensagem || "").trim().slice(0, 1000);
  if (!mensagem) return json({ erro: "Escreva uma pergunta." }, 400);

  const historico = (Array.isArray(dados.historico) ? dados.historico : [])
    .slice(-10)
    .filter(function (m) {
      return m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string";
    })
    .map(function (m) {
      return { role: m.role, content: m.content.slice(0, 2000) };
    });

  const messages = [{ role: "system", content: SYSTEM_PROMPT }]
    .concat(historico)
    .concat([{ role: "user", content: mensagem }]);

  try {
    const modelo = env.MODELO || "@cf/meta/llama-3.2-3b-instruct";
    const res = await env.AI.run(modelo, { messages: messages, max_tokens: 512 });
    const resposta = (res && (res.response || (res.result && res.result.response))) || "";
    if (!resposta) return json({ erro: "A IA não devolveu resposta. Tente de novo." }, 502);
    return json({ resposta: resposta });
  } catch (err) {
    return json({ erro: "Falha ao chamar a IA: " + String((err && err.message) || err) }, 502);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/" || path === "") {
      return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    if (path === "/status") {
      return json({
        status: "ok",
        service: "Chat Api",
        worker: "mensagemapi",
        ai_configured: Boolean(env.AI),
        tunnel_configured: Boolean(getTunnelBase(env)),
        routes: ["/", "/status", "/perguntar"].concat(ROTAS_TUNEL),
      });
    }

    if (path === "/perguntar") {
      return responderComIA(request, env);
    }

    if (!ROTAS_TUNEL.includes(path)) {
      return json({ detail: "Not Found" }, 404);
    }

    // A partir daqui: repasse para o servidor do WhatsApp no seu PC, via túnel.
    const tunnel = getTunnelBase(env);
    if (!tunnel) {
      return json({ erro: "O túnel ainda não foi configurado (TUNNEL_URL)." }, 503);
    }

    const target = tunnel + path + url.search;

    const headers = new Headers();
    for (const name of ["content-type", "x-hub-signature-256", "user-agent"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    if (request.method === "POST" && path === "/webhook") {
      const body = await request.text();
      ctx.waitUntil(
        fetch(target, { method: "POST", headers: headers, body: body }).catch(function (err) {
          console.log("Falha ao repassar para o tunel:", String(err));
        })
      );
      return new Response("EVENT_RECEIVED", { status: 200 });
    }

    try {
      const upstream = await fetch(target, { method: request.method, headers: headers });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "content-type": upstream.headers.get("content-type") || "text/plain; charset=utf-8",
        },
      });
    } catch (err) {
      return json({ erro: "Não consegui falar com o seu computador. Confira o servidor, o túnel e a TUNNEL_URL." }, 502);
    }
  },
};