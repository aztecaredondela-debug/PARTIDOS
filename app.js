// ===== CONFIGURACIÓN =====
// URL de tu Cloudflare Worker (ver LEEME.txt). Vacío = intentar descargar directamente de la federación.
const PROXY = "https://sar-partidos.aztecaredondela.workers.dev";

const URL_API = "https://resultadosbalonmano.isquad.es/json/partidos_equipos_consultas.php";
const ID_CLUB_SAR = "273", ID_AMBITO = "20";
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
// Mismo formato que el Excel de la federación
const COLS = ["Equipo Local", "Equipo Visitante", "Pabellón", "Competición", "Categoría", "Fecha"];
const ANCHOS = [52, 52, 52, 52, 36.4, 23.4];
const CLAVE = "sar_datos_v1";

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, "0");
const diaStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ===== descarga =====
async function descargar() {
  const hoy = diaStr();
  const r = PROXY
    ? await fetch(`${PROXY}?fecha=${hoy}`)
    : await fetch(URL_API, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
        body: new URLSearchParams({ accion: "obtener_partidos", id_ambito: ID_AMBITO, fecha_actual: hoy, consulta: "0", id_superficie: "1" }),
      });
  if (!r.ok) throw new Error("La federación respondió " + r.status);
  return r.json();
}

function aLista(js) {
  if (Array.isArray(js)) return js;
  if (js && typeof js === "object") {
    for (const k of ["data", "partidos", "aaData", "rows", "results"]) if (Array.isArray(js[k])) return js[k];
    for (const v of Object.values(js)) if (Array.isArray(v) && v.length && typeof v[0] === "object") return v;
  }
  throw new Error("No encuentro la lista de partidos en la respuesta.");
}

// ===== limpieza =====
const _ta = document.createElement("textarea");
function limpiar(v) {
  if (v == null) return "";
  _ta.innerHTML = String(v).replace(/<[^>]+>/g, " ");
  return _ta.value.replace(/\s+/g, " ").trim();
}

// Devuelve "YYYY-MM-DD HH:MM" o null. ISO tal cual; las demás con día primero.
function parsearFecha(txt) {
  let m = txt.match(/^\s*(\d{4})-(\d{2})-(\d{2})(?:[ T]+(\d{1,2}):(\d{2}))?/);
  if (!m) {
    m = txt.match(/^\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:[ T,]+(\d{1,2}):(\d{2}))?/);
    if (!m) return null;
    m = [m[0], m[3], m[2], m[1], m[4], m[5]];
  }
  const [, y, mo, d, h, mi] = m;
  const f = new Date(+y, +mo - 1, +d);
  if (f.getMonth() !== +mo - 1) return null;
  return `${y}-${pad(+mo)}-${pad(+d)} ${pad(+(h || 0))}:${mi || "00"}`;
}

function buscarClave(claves, patrones, excluir = ["id_", "escudo", "imagen", "logo"]) {
  for (const p of patrones) for (const k of claves) {
    const kl = k.toLowerCase();
    if (kl.includes(p) && !excluir.some(e => kl.includes(e))) return k;
  }
  return null;
}

function procesar(lista) {
  if (!lista.length) throw new Error("La federación no devolvió ningún partido.");
  const claves = Object.keys(lista[0]);
  const kLoc = buscarClave(claves, ["nombre_local", "local"]);
  const kVis = buscarClave(claves, ["nombre_visitante", "visitante"]);
  const kPab = buscarClave(claves, ["pabell", "lugar", "instal", "campo", "pista"]);
  const kCom = buscarClave(claves, ["competicion"]);
  const kCat = buscarClave(claves, ["categoria"]);
  const kFec = buscarClave(claves, ["fecha"]);
  const kHor = buscarClave(claves, ["hora"]);
  if (!(kLoc && kVis && kFec)) throw new Error("No reconozco local, visitante o fecha en los datos de la federación.");
  const out = [];
  for (const reg of lista) {
    const nLoc = limpiar(reg[kLoc]), nVis = limpiar(reg[kVis]);
    const idL = String(reg.id_club_local ?? "").trim(), idV = String(reg.id_club_visitante ?? "").trim();
    const sarL = idL ? idL === ID_CLUB_SAR : nLoc.startsWith("SAR ");
    const sarV = idV ? idV === ID_CLUB_SAR : nVis.startsWith("SAR ");
    if (!(sarL || sarV)) continue;
    let txt = limpiar(reg[kFec]);
    if (kHor && !/\d{1,2}:\d{2}/.test(txt)) txt = `${txt} ${limpiar(reg[kHor])}`;
    out.push({ ts: parsearFecha(txt), local: nLoc, visitante: nVis,
      pab: kPab ? limpiar(reg[kPab]) : "", comp: kCom ? limpiar(reg[kCom]) : "", cat: kCat ? limpiar(reg[kCat]) : "", sarL, sarV });
  }
  if (!out.length) throw new Error("No hay ningún partido del SAR en la respuesta.");
  const k = t => t ?? "9999", c = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return out.sort((a, b) => c(k(a.ts), k(b.ts)) || c(a.cat, b.cat) || c(a.comp, b.comp));
}

function aFilas(rows) {
  return rows.map(r => {
    let cf, mio, riv;
    if (r.sarL && r.sarV) { cf = "Derbi interno"; mio = `${r.local} / ${r.visitante}`; riv = "(SAR vs SAR)"; }
    else if (r.sarL) { cf = "Casa"; mio = r.local; riv = r.visitante; }
    else { cf = "Fuera"; mio = r.visitante; riv = r.local; }
    let clave = null, fecha = "Por confirmar", dia = "", hora = "Por confirmar", sinHora = true;
    if (r.ts) {
      const [f, h] = r.ts.split(" "), [y, m, d] = f.split("-").map(Number);
      clave = f; fecha = `${pad(d)}/${pad(m)}/${y}`; dia = DIAS[(new Date(y, m - 1, d).getDay() + 6) % 7];
      sinHora = h === "00:00"; hora = sinHora ? "Por confirmar" : h;
    }
    const est = [];
    if (sinHora) est.push("Hora por confirmar");
    if (!r.pab) est.push("Pabellón por confirmar");
    return { clave, fecha, dia, hora, cat: r.cat, comp: r.comp, mio, riv, cf, pab: r.pab || "Por confirmar", estado: est.join(" · ") || "OK" };
  });
}

function proximos(filas, dias = 7) {
  const lim = new Date(); lim.setDate(lim.getDate() + dias);
  const h = diaStr(), l = diaStr(lim);
  return filas.filter(f => f.clave && f.clave >= h && f.clave <= l);
}

// ===== datos con caché local (5 min; si falla la red, usa lo último guardado) =====
let filas = [], crudas = [], aviso = "";
const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE)); } catch { return null; } };
async function datos(forzar) {
  const c = leer();
  if (!forzar && c && Date.now() - c.t < 300000) { aviso = ""; return c.rows; }
  try {
    const rows = procesar(aLista(await descargar()));
    try { localStorage.setItem(CLAVE, JSON.stringify({ t: Date.now(), rows })); } catch {}
    aviso = ""; return rows;
  } catch (e) {
    let msg = e.message;
    if (e instanceof TypeError) msg = PROXY ? "sin conexión" : "sin conexión o la federación bloquea el acceso directo (hace falta el Worker, mira LEEME.txt)";
    if (c) { aviso = `No se pudo actualizar (${msg}); datos del ${new Date(c.t).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}`; return c.rows; }
    throw new Error(msg);
  }
}

// ===== pantalla =====
const estado = $("estado"), tabla = $("tabla"), cuerpo = tabla.querySelector("tbody");
function celda(tr, txt, clase) { const td = document.createElement("td"); td.textContent = txt; if (clase) td.className = clase; tr.appendChild(td); }
async function cargar(refrescar) {
  estado.className = ""; estado.textContent = "Cargando partidos…"; tabla.hidden = true;
  try {
    crudas = await datos(refrescar);
    filas = aFilas(crudas);
    const prox = proximos(filas);
    cuerpo.innerHTML = "";
    prox.forEach(p => {
      const tr = document.createElement("tr");
      celda(tr, (p.dia ? p.dia + " " : "") + p.fecha);
      celda(tr, p.hora, p.hora === "Por confirmar" ? "pend" : "");
      celda(tr, p.cat); celda(tr, p.mio); celda(tr, p.riv);
      celda(tr, p.cf, p.cf === "Casa" ? "casa" : "");
      celda(tr, p.pab, p.pab === "Por confirmar" ? "pend" : "");
      cuerpo.appendChild(tr);
    });
    estado.textContent = `${prox.length} partidos en los próximos 7 días · ${filas.length} en toda la temporada (el Excel los incluye todos)` + (aviso ? " · ⚠ " + aviso : "");
    tabla.hidden = prox.length === 0;
  } catch (e) { estado.className = "error"; estado.textContent = "Error: " + e.message; }
}

// ===== Excel (ExcelJS, se carga solo al pulsar el botón) =====
function cargarExcelJS() {
  if (window.ExcelJS) return Promise.resolve();
  return new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
    s.onload = ok; s.onerror = () => ko(new Error("No se pudo cargar la librería de Excel (la primera vez hace falta conexión)."));
    document.head.appendChild(s);
  });
}
// "2026-10-24 09:45" -> "24/10/202609:45:00" (el mismo texto que usa la federación; sin fecha = vacío)
function textoFecha(ts) {
  if (!ts) return "";
  const [f, h] = ts.split(" "), [y, m, d] = f.split("-");
  return `${d}/${m}/${y}${h}:00`;
}
async function descargarExcel() {
  const b = $("descarga"), txt = b.textContent;
  b.textContent = "Generando…"; b.disabled = true;
  try {
    if (!crudas.length) await cargar(false);
    await cargarExcelJS();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.columns = COLS.map((c, j) => ({ header: c, width: ANCHOS[j] }));
    ws.getRow(1).font = { bold: true };
    crudas.forEach(r => ws.addRow([r.local, r.visitante, r.pab, r.comp, r.cat, textoFecha(r.ts)]));
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = `Partidos_SAR_${diaStr()}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) { estado.className = "error"; estado.textContent = "Error con el Excel: " + e.message; }
  b.textContent = txt; b.disabled = false;
}

// ===== arranque, instalación y modo sin conexión =====
$("actualizar").onclick = () => cargar(true);
$("descarga").onclick = descargarExcel;
let invitacion = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); invitacion = e; $("instalar").hidden = false; });
$("instalar").onclick = async () => { if (invitacion) { invitacion.prompt(); invitacion = null; $("instalar").hidden = true; } };
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
cargar(false);
