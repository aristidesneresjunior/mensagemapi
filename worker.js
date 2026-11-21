// Worker mensagemapi - Chat Api: IA (Cloudflare Workers AI), anexo de arquivo, exportação e repasse do webhook do WhatsApp.

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const ROTAS_TUNEL = ["/health", "/webhook"];
const MAX_ARQUIVO = 15000;
const SYSTEM_PROMPT =
  "Você é o Chat Api, um assistente simpático. " +
  "Responda sempre em português do Brasil, de forma clara e objetiva.";

const HTML = String.raw`<!DOCTYPE html>
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
  .app { width: 100%; max-width: 720px; height: 100%; display: flex; flex-direction: column; padding: 16px; gap: 10px; }
  header h1 { margin: 0; font-size: 1.15rem; }
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
  .barra { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .sec { background: var(--bot); color: var(--text); border: 1px solid var(--border); padding: 7px 12px; font-weight: 500; font-size: .88rem; }
  .chip { display: flex; align-items: center; gap: 8px; background: var(--bot); padding: 5px 6px 5px 12px; border-radius: 999px; font-size: .85rem; max-width: 100%; }
  .chip[hidden] { display: none; }
  .chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip button { background: transparent; color: var(--muted); padding: 0 8px; font-size: 1rem; line-height: 1; }
  .acoes { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
  .exportar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: .85rem; color: var(--muted); }
  select { padding: 6px 8px; border-radius: 10px; border: 1px solid var(--border); background: var(--card); color: var(--text); font: inherit; font-size: .85rem; }
  .limpar { background: transparent; color: var(--muted); padding: 0; font-weight: 400; font-size: .85rem; text-decoration: underline; }
</style>
</head>
<body>
<div class="app">
  <header><h1>Chat Api</h1></header>
  <div id="chat"><div class="vazio" id="vazio">Digite uma pergunta ou anexe um arquivo para começar.</div></div>
  <div class="barra">
    <button class="sec" id="anexar" type="button">Anexar arquivo</button>
    <div class="chip" id="chip" hidden><span id="nomeChip"></span><button id="removerArq" type="button" title="Remover arquivo">&times;</button></div>
    <input type="file" id="inputArq" accept=".txt,.md,.csv,.json,.xml,.html,.htm,.log,.pdf" hidden>
  </div>
  <div class="acoes">
    <div class="exportar">
      Exportar
      <select id="escopo">
        <option value="tudo">conversa inteira</option>
        <option value="ultima">última resposta</option>
      </select>
      <button class="sec" data-fmt="pdf" type="button">PDF</button>
      <button class="sec" data-fmt="xml" type="button">XML</button>
      <button class="sec" data-fmt="txt" type="button">TXT</button>
    </div>
    <button class="limpar" id="limpar" type="button">Limpar conversa</button>
  </div>
  <form id="form">
    <textarea id="texto" rows="1" placeholder="Escreva sua pergunta..." autofocus></textarea>
    <button id="enviar" type="submit">Enviar</button>
  </form>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>
  const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const MAX_ARQ = 15000;
  const MAX_BYTES = 5 * 1024 * 1024;
  const EXT_TEXTO = ["txt", "md", "csv", "json", "xml", "html", "htm", "log"];

  const chat = document.getElementById("chat");
  const form = document.getElementById("form");
  const texto = document.getElementById("texto");
  const enviar = document.getElementById("enviar");
  const btnAnexar = document.getElementById("anexar");
  const inputArq = document.getElementById("inputArq");
  const chip = document.getElementById("chip");
  const nomeChip = document.getElementById("nomeChip");
  const escopo = document.getElementById("escopo");

  let historico = [];
  let arquivo = null;
  let pdfWorkerUrl = null;

  const VAZIO_HTML = '<div class="vazio" id="vazio">Digite uma pergunta ou anexe um arquivo para começar.</div>';

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

  function atualizarChip() {
    if (arquivo) {
      chip.hidden = false;
      nomeChip.textContent = arquivo.nome + " (" + arquivo.texto.length + " caracteres" + (arquivo.cortado ? ", cortado" : "") + ")";
    } else {
      chip.hidden = true;
      nomeChip.textContent = "";
    }
  }

  async function lerPdf(file) {
    if (!window.pdfjsLib) throw new Error("O leitor de PDF não carregou. Verifique a internet e recarregue a página.");
    if (!pdfWorkerUrl) {
      try {
        const r = await fetch(PDFJS_WORKER);
        const t = await r.text();
        pdfWorkerUrl = URL.createObjectURL(new Blob([t], { type: "text/javascript" }));
      } catch (e) {
        pdfWorkerUrl = PDFJS_WORKER;
      }
    }
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const paginas = [];
    let total = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      const pag = await pdf.getPage(i);
      const conteudo = await pag.getTextContent();
      const t = conteudo.items.map(function (it) { return it.str; }).join(" ");
      paginas.push(t);
      total += t.length;
      if (total > MAX_ARQ * 1.5) break;
    }
    return paginas.join("\n\n");
  }

  btnAnexar.addEventListener("click", function () { inputArq.click(); });

  document.getElementById("removerArq").addEventListener("click", function () {
    arquivo = null;
    atualizarChip();
  });

  inputArq.addEventListener("change", async function () {
    const f = inputArq.files[0];
    inputArq.value = "";
    if (!f) return;
    if (f.size > MAX_BYTES) { adicionar("erro", "Arquivo muito grande (máximo 5 MB)."); return; }
    const nome = f.name;
    const ext = (nome.split(".").pop() || "").toLowerCase();
    const aviso = adicionar("bot", "Lendo o arquivo...");
    try {
      let txt;
      if (ext === "pdf" || f.type === "application/pdf") {
        txt = await lerPdf(f);
      } else if (f.type.indexOf("text/") === 0 || EXT_TEXTO.indexOf(ext) >= 0) {
        txt = await f.text();
      } else {
        throw new Error("Formato não suportado. Use TXT, MD, CSV, JSON, XML, HTML ou PDF.");
      }
      txt = txt.replace(/[ \t]+\n/g, "\n").trim();
      if (!txt) throw new Error("Não encontrei texto nesse arquivo. PDFs escaneados (só imagem) não funcionam.");
      const cortado = txt.length > MAX_ARQ;
      arquivo = { nome: nome, texto: txt.slice(0, MAX_ARQ), cortado: cortado };
      aviso.textContent = "Arquivo anexado: " + nome + ". Agora faça uma pergunta sobre ele, por exemplo: Resuma este arquivo." +
        (cortado ? " Atenção: só os primeiros " + MAX_ARQ + " caracteres serão usados." : "");
      atualizarChip();
    } catch (e) {
      aviso.className = "msg erro";
      aviso.textContent = e.message;
    }
  });

  async function perguntar(mensagem) {
    adicionar("user", mensagem);
    const aguardando = adicionar("bot", "Pensando...");
    enviar.disabled = true;
    try {
      const r = await fetch("/perguntar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensagem: mensagem,
          historico: historico,
          arquivo: arquivo ? { nome: arquivo.nome, texto: arquivo.texto } : null
        })
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
    arquivo = null;
    atualizarChip();
    chat.innerHTML = VAZIO_HTML;
  });

  /* ---------- Exportação ---------- */

  function carimbo() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
  }

  function rotulo(m) { return m.role === "user" ? "Você" : "Chat Api"; }

  function baixar(nomeArq, conteudo, tipo) {
    const blob = new Blob([conteudo], { type: tipo });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nomeArq;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  function itensParaExportar() {
    let itens = historico.slice();
    if (escopo.value === "ultima") {
      const ult = itens.filter(function (m) { return m.role === "assistant"; }).pop();
      itens = ult ? [ult] : [];
    }
    return itens;
  }

  function exportarTxt(itens) {
    let t = "Chat Api\nGerado em: " + new Date().toLocaleString("pt-BR") + "\n";
    if (arquivo) t += "Arquivo analisado: " + arquivo.nome + "\n";
    t += "\n";
    itens.forEach(function (m) { t += rotulo(m) + ":\n" + m.content + "\n\n"; });
    baixar("chat-api-" + carimbo() + ".txt", "\ufeff" + t, "text/plain;charset=utf-8");
  }

  function xmlEscape(s) {
    return String(s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function exportarXml(itens) {
    let x = '<?xml version="1.0" encoding="UTF-8"?>\n';
    x += '<conversa gerada_em="' + new Date().toISOString() + '"' + (arquivo ? ' arquivo="' + xmlEscape(arquivo.nome) + '"' : "") + ">\n";
    itens.forEach(function (m, i) {
      x += '  <mensagem ordem="' + (i + 1) + '" papel="' + (m.role === "user" ? "usuario" : "ia") + '">' + xmlEscape(m.content) + "</mensagem>\n";
    });
    x += "</conversa>\n";
    baixar("chat-api-" + carimbo() + ".xml", x, "application/xml;charset=utf-8");
  }

  function paraPdf(t) {
    return String(t)
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[–—]/g, "-")
      .replace(/…/g, "...")
      .replace(/•/g, "-")
      .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, "?");
  }

  function exportarPdf(itens) {
    if (!window.jspdf) {
      adicionar("erro", "O gerador de PDF não carregou. Verifique a internet e recarregue a página.");
      return;
    }
    const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
    const margem = 48;
    const largura = doc.internal.pageSize.getWidth() - margem * 2;
    const altura = doc.internal.pageSize.getHeight();
    let y = margem;

    function escrever(txt, tamanho, negrito, cinza) {
      doc.setFont("helvetica", negrito ? "bold" : "normal");
      doc.setFontSize(tamanho);
      doc.setTextColor(cinza ? 110 : 20);
      const partes = doc.splitTextToSize(paraPdf(txt), largura);
      for (let i = 0; i < partes.length; i++) {
        if (y > altura - margem) { doc.addPage(); y = margem; }
        doc.text(partes[i], margem, y);
        y += tamanho * 1.45;
      }
    }

    escrever("Chat Api", 18, true, false);
    y += 2;
    escrever("Gerado em " + new Date().toLocaleString("pt-BR"), 9, false, true);
    if (arquivo) escrever("Arquivo analisado: " + arquivo.nome, 9, false, true);
    y += 12;
    itens.forEach(function (m) {
      escrever(rotulo(m), 11, true, false);
      escrever(m.content, 11, false, false);
      y += 10;
    });
    doc.save("chat-api-" + carimbo() + ".pdf");
  }

  document.querySelectorAll("[data-fmt]").forEach(function (b) {
    b.addEventListener("click", function () {
      const itens = itensParaExportar();
      if (!itens.length) {
        adicionar("erro", "Ainda não há resposta para exportar. Faça uma pergunta primeiro.");
        return;
      }
      const fmt = b.getAttribute("data-fmt");
      if (fmt === "pdf") exportarPdf(itens);
      else if (fmt === "xml") exportarXml(itens);
      else exportarTxt(itens);
    });
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

  const mensagem = String(dados.mensagem || "").trim().slice(0, 2000);
  if (!mensagem) return json({ erro: "Escreva uma pergunta." }, 400);

  const historico = (Array.isArray(dados.historico) ? dados.historico : [])
    .slice(-10)
    .filter(function (m) {
      return m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string";
    })
    .map(function (m) {
      return { role: m.role, content: m.content.slice(0, 3000) };
    });

  let sistema = SYSTEM_PROMPT;
  const arq = dados.arquivo;
  if (arq && typeof arq.texto === "string" && arq.texto.trim()) {
    const nomeArq = String(arq.nome || "arquivo").slice(0, 120);
    sistema +=
      "\n\nO usuário anexou o arquivo \"" + nomeArq + "\". Use o conteúdo abaixo para responder. " +
      "Se a resposta não estiver no arquivo, diga isso claramente.\n\n" +
      "--- INÍCIO DO ARQUIVO ---\n" + arq.texto.slice(0, MAX_ARQUIVO) + "\n--- FIM DO ARQUIVO ---";
  }

  const messages = [{ role: "system", content: sistema }]
    .concat(historico)
    .concat([{ role: "user", content: mensagem }]);

  try {
    const modelo = env.MODELO || "@cf/meta/llama-3.2-3b-instruct";
    const res = await env.AI.run(modelo, { messages: messages, max_tokens: 800 });
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

    // Repasse para o servidor do WhatsApp no seu PC, via túnel.
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