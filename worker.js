// Cloudflare Worker: pide los datos a la federación y se los pasa a la app (resuelve el bloqueo CORS).
const URL_API = "https://resultadosbalonmano.isquad.es/json/partidos_equipos_consultas.php";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };

export default {
  async fetch(req) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const fecha = new URL(req.url).searchParams.get("fecha") || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha))
      return new Response('{"error":"fecha no valida"}', { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    const r = await fetch(URL_API, {
      method: "POST",
      headers: {
        "accept": "application/json, text/javascript, */*; q=0.01",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "origin": "https://resultadosbalonmano.isquad.es",
        "referer": "https://resultadosbalonmano.isquad.es/partidos_equipos.php?seleccion=0&id_ambito=0&id_territorial=20&id_superficie=1&iframe=0",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
        "x-requested-with": "XMLHttpRequest",
      },
      body: new URLSearchParams({ accion: "obtener_partidos", id_ambito: "20", fecha_actual: fecha, consulta: "0", id_superficie: "1" }),
    });
    return new Response(await r.text(), {
      status: r.status,
      headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" },
    });
  },
};
