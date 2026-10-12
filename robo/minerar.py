"""Robô do servidor do Garimpo: pede o plano de buscas à API, abre a Biblioteca de Anúncios pública da Meta
num Chromium headless, lê o JSON dos anúncios, mede a escala de cada anunciante e manda tudo para a API.

Uso:  ROBOT_KEY=... python robo/minerar.py --conta demo   (ou --conta owner)
Opcionais: GARIMPO_API (padrão https://garimpo-ads.vercel.app), ROBO_MINUTOS (orçamento), ROBO_CHANNEL=chrome
"""
import os, re, sys, json, time, random, argparse, datetime, urllib.parse, urllib.request
from playwright.sync_api import sync_playwright

API = os.environ.get("GARIMPO_API", "https://garimpo-ads.vercel.app").rstrip("/")
KEY = os.environ.get("ROBOT_KEY", "")
INICIO = time.time()


def api(path, body=None):
    url = f"{API}{path}{'&' if '?' in path else '?'}key={urllib.parse.quote(KEY)}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json", "User-Agent": "garimpo-robo"},
                                 method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())


def url_busca(q, pais, media="all"):
    return ("https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=" + pais +
            "&is_targeted_country=false&media_type=" + media + "&q=" + urllib.parse.quote(q) +
            "&search_type=keyword_unordered&sort_data[direction]=desc&sort_data[mode]=total_impressions")


def url_pagina(pid):
    return ("https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL"
            "&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=" + pid)


def achar(o, ads, totais):
    if isinstance(o, dict):
        if "ad_archive_id" in o and "snapshot" in o:
            ads.append(o)
            return
        c = o.get("search_results_connection")
        if isinstance(c, dict) and isinstance(c.get("count"), int):
            totais.append(c["count"])
        for v in o.values():
            achar(v, ads, totais)
    elif isinstance(o, list):
        for v in o:
            achar(v, ads, totais)


def carregar(textos, ads, totais):
    for t in textos:
        t = t.strip()
        if t.startswith("for (;;);"):
            t = t[9:]
        for parte in t.split("\n"):
            parte = parte.strip()
            if parte and parte[0] in "{[":
                try:
                    achar(json.loads(parte), ads, totais)
                except Exception:
                    pass


class Nav:
    def __init__(self, p):
        kw = {"headless": True, "args": ["--disable-blink-features=AutomationControlled"]}
        if os.environ.get("ROBO_CHANNEL"):
            kw["channel"] = os.environ["ROBO_CHANNEL"]
        self.b = p.chromium.launch(**kw)
        self.ctx = self.b.new_context(locale="pt-BR", viewport={"width": 1366, "height": 900},
                                      user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")

    def abrir(self, url, rolagens=2):
        pg = self.ctx.new_page()
        resp = []
        pg.on("response", lambda r: resp.append(r) if "/api/graphql" in r.url else None)
        ads, totais = [], []
        try:
            pg.goto(url, wait_until="domcontentloaded", timeout=60000)
            pg.wait_for_timeout(4500 + random.randint(0, 1500))
            for _ in range(rolagens):
                pg.mouse.wheel(0, 7000)
                pg.wait_for_timeout(2300 + random.randint(0, 1400))
            carregar(re.findall(r'<script type="application/json"[^>]*>(.*?)</script>', pg.content(), re.S), ads, totais)
            textos = []
            for r in resp:
                try:
                    textos.append(r.text())
                except Exception:
                    pass
            carregar(textos, ads, totais)
            if not totais:
                m = re.search(r"~?([\d.,]+)\s+(?:resultado|result)", pg.inner_text("body"))
                if m:
                    totais.append(int(re.sub(r"[.,]", "", m.group(1))))
        except Exception as e:
            print("   erro:", str(e)[:120])
        finally:
            pg.close()
        return ads, (totais[0] if totais else None)

    def fechar(self):
        self.b.close()


def para_garimpo(a, pais, termo):
    s = a.get("snapshot") or {}
    cards = s.get("cards") or []
    body = (s.get("body") or {}).get("text") or ""
    if (not body or "{{" in body) and cards:
        body = cards[0].get("body") or body
    vids = list(s.get("videos") or []) + [c for c in cards if c.get("video_hd_url") or c.get("video_sd_url")]
    imgs = list(s.get("images") or []) + [c for c in cards if c.get("original_image_url") or c.get("resized_image_url")]
    link = s.get("link_url") or (cards[0].get("link_url") if cards else "") or ""
    cta = s.get("cta_type") or ""
    ini, fim = a.get("start_date"), a.get("end_date")
    dom = ""
    try:
        dom = urllib.parse.urlparse(link).hostname or ""
    except Exception:
        pass
    destino = "whatsapp" if cta == "WHATSAPP_MESSAGE" or re.search(r"wa\.me|whatsapp\.com", link, re.I) else (
        "site" if link else ("mensagem" if cta in ("MESSAGE_PAGE", "SEND_MESSAGE", "INSTAGRAM_MESSAGE") else "sem link"))
    return {
        "id": str(a.get("ad_archive_id")), "platform": "meta", "pageId": str(a.get("page_id") or ""),
        "pageName": a.get("page_name") or s.get("page_name") or "", "pageUrl": s.get("page_profile_uri") or "",
        "avatar": s.get("page_profile_picture_url") or "", "text": body[:6000], "headline": s.get("title") or (cards[0].get("title") if cards else "") or "",
        "description": s.get("link_description") or "", "cta": s.get("cta_text") or "", "ctaType": cta, "linkUrl": link,
        "domain": dom.replace("www.", ""), "destino": destino,
        "videos": [{"src": v.get("video_hd_url") or v.get("video_sd_url"), "sd": v.get("video_sd_url"), "poster": v.get("video_preview_image_url")} for v in vids][:6],
        "images": [i.get("original_image_url") or i.get("resized_image_url") for i in imgs][:10],
        "format": "vídeo" if vids else ("carrossel" if len(imgs) > 1 else "imagem" if imgs else "texto"),
        "startDate": datetime.datetime.fromtimestamp(ini, datetime.timezone.utc).isoformat() if isinstance(ini, int) else None,
        "endDate": datetime.datetime.fromtimestamp(fim, datetime.timezone.utc).isoformat() if isinstance(fim, int) and not a.get("is_active") else None,
        "active": bool(a.get("is_active", True)),
        "days": (datetime.date.today() - datetime.date.fromtimestamp(ini)).days if isinstance(ini, int) else None,
        "copies": a.get("collation_count") or 1, "platforms": a.get("publisher_platform") or [],
        "country": pais, "query": termo, "libraryUrl": f"https://www.facebook.com/ads/library/?id={a.get('ad_archive_id')}",
        "likes": s.get("page_like_count"), "categories": s.get("page_categories") or [],
        "euReach": a.get("eu_total_reach") or s.get("eu_total_reach") or 0,
    }


LOCAL = re.compile(r"cl[ií]nica|imobili|advoca|odonto|restaurante|pizzaria|supermercado|igreja|prefeitura|farm[aá]cia|"
                   r"concession|banco|governo|partido|deputad|vereador|senador|jornal|news|r[aá]dio", re.I)


PLATS = {"hotmart": r"pay\.hotmart\.com|go\.hotmart\.com", "kiwify": r"pay\.kiwify\.com\.br|kiwify\.app", "cakto": r"pay\.cakto\.com\.br",
         "kirvano": r"pay\.kirvano\.com", "eduzz": r"sun\.eduzz\.com|chk\.eduzz\.com", "hubla": r"pay\.hub\.la", "greenn": r"payfast\.greenn",
         "perfectpay": r"checkout\.perfectpay", "ticto": r"checkout\.ticto|payment\.ticto", "monetizze": r"monetizze\.com\.br", "lastlink": r"lastlink\.com",
         "braip": r"ev\.braip\.com", "payt": r"checkout\.payt\.com\.br", "yampi": r"yampi", "cartpanda": r"cartpanda", "shopify": r"myshopify\.com|/cart/\d+:\d+|/checkouts/",
         "clickbank": r"clickbank\.net|hop\.clickbank", "digistore": r"digistore24\.com", "buygoods": r"buygoods\.com", "stripe": r"checkout\.stripe\.com|buy\.stripe\.com"}
PLAYERS = {"vturb": r"vturb|converteai", "panda": r"pandavideo", "youtube": r"youtube\.com/embed", "vimeo": r"player\.vimeo", "wistia": r"wistia", "vidalytics": r"vidalytics"}
PRECO = re.compile(r"(R\$|US\$|\$|€|£)\s?(\d{1,4}(?:[.,]\d{3})*(?:[.,]\d{2})?)")
LOCALE = {"BR": "pt-BR", "PT": "pt-PT", "US": "en-US", "GB": "en-GB", "MX": "es-MX", "ES": "es-ES", "CO": "es-CO", "AR": "es-AR", "FR": "fr-FR", "DE": "de-DE", "IT": "it-IT"}


def valor(m):
    moeda, n = m.group(1), m.group(2)
    n = n.replace(".", "").replace(",", ".") if ("," in n[-3:]) else n.replace(",", "")
    try:
        return moeda, float(n)
    except ValueError:
        return moeda, None


def abrir_como_lead(p, url, pais):
    """Abre a página como um lead real (iPhone, vindo do Facebook, fbclid) — é o que o cloaker entrega ao comprador."""
    dev = dict(p.devices["iPhone 13"])
    dev.pop("default_browser_type", None)
    ctx = p.chromium.launch(headless=True).new_context(**dev, locale=LOCALE.get(pais, "pt-BR"),
                                                       extra_http_headers={"Referer": "https://m.facebook.com/"})
    pg = ctx.new_page()
    sep = "&" if "?" in url else "?"
    alvo = url + sep + "fbclid=IwAR" + "".join(random.choice("abcdefghijkABCDEFGHIJK0123456789") for _ in range(40)) + "&utm_source=facebook&utm_medium=paid"
    out = {}
    try:
        pg.goto(alvo, wait_until="domcontentloaded", timeout=40000)
        pg.wait_for_timeout(6000)
        html = pg.content()
        landing, titulo = pg.url, pg.title()
        txt = pg.inner_text("body")[:20000]
        links = pg.eval_on_selector_all("a[href],form[action]", "els => els.map(e => e.href || e.action)") + re.findall(r"https?://[^\"'\s<>]+", html)
        plat, co = None, None
        for nome, rx in PLATS.items():
            hit = next((l for l in links if re.search(rx, l, re.I)), None)
            if hit:
                plat, co = nome, hit
                break
        players = [n for n, rx in PLAYERS.items() if re.search(rx, html, re.I)]
        precos = [valor(m) for m in PRECO.finditer(txt)]
        if co:
            try:
                pg.goto(co, wait_until="domcontentloaded", timeout=30000)
                pg.wait_for_timeout(3500)
                precos = [valor(m) for m in PRECO.finditer(pg.inner_text("body")[:15000])] or precos
            except Exception:
                pass
        precos = [(m, v) for m, v in precos if v and 3 <= v <= 5000]
        moeda, v = (min(precos, key=lambda x: x[1]) if precos else (None, None))
        out = {"finalUrl": re.sub(r"[?&](fbclid|utm_[a-z]+)=[^&]*", "", landing), "title": (titulo or "")[:120],
               "type": "VSL" if players else ("Quiz" if re.search(r"quiz|pergunta 1|question 1|inlead", txt[:3000] + landing, re.I) else "Página"),
               "platform": plat, "checkout": co, "players": players, "price": f"{moeda} {v:.2f}".replace(".", ",") if v else None,
               "priceValue": v, "currency": "BRL" if moeda == "R$" else ("EUR" if moeda == "€" else "USD" if moeda else None),
               "at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="minutes")}
        out["finalUrl"] = out["finalUrl"] or url
    except Exception as e:
        print("   funil falhou:", str(e)[:100])
    finally:
        ctx.browser.close()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--conta", default="demo")
    ap.add_argument("--minutos", type=float, default=float(os.environ.get("ROBO_MINUTOS", 25)))
    ap.add_argument("--paginas", type=int, default=12, help="anunciantes medidos por rodada")
    ap.add_argument("--buscas", type=int, default=0, help="nº de buscas (0 = o do plano)")
    ap.add_argument("--funis", type=int, default=12, help="páginas abertas como lead (cloaker quebrado)")
    args = ap.parse_args()
    if not KEY:
        sys.exit("defina ROBOT_KEY")
    plano = api(f"/api/robot?a=plan&acct={args.conta}&n={args.buscas}")
    buscas = [b for b in plano["searches"] if b.get("platform", "meta") == "meta"]
    print(f"[plano] {len(buscas)} buscas · {len(plano.get('pageIds', []))} anunciantes acompanhados")
    sobra = lambda f=1.0: time.time() - INICIO < args.minutos * 60 * f

    todos, por_pagina, registro = {}, {}, []
    with sync_playwright() as p:
        nav = Nav(p)
        for b in buscas:
            if not sobra(0.55):
                print("[tempo] encerrando buscas")
                break
            ads, total = nav.abrir(url_busca(b["q"], b["country"]), rolagens=3)
            lidos = [para_garimpo(a, b["country"], b["q"]) for a in ads]
            lidos = [x for x in lidos if x["id"] and not LOCAL.search(x["pageName"])]
            for x in lidos:
                todos[x["id"]] = x
                por_pagina.setdefault(x["pageId"], []).append(x)
            registro.append({"q": b["q"], "country": b["country"], "found": len(lidos), "hits": sum(1 for x in lidos if (x["copies"] or 1) >= 3)})
            print(f"[busca] {b['country']}: {b['q']} -> {len(lidos)} anúncios (~{total})")

        # mede a escala dos anunciantes mais promissores (biblioteca do anunciante = total de ativos)
        cand = sorted(por_pagina, key=lambda pid: (max(x["copies"] for x in por_pagina[pid]) + len(por_pagina[pid]) * 2), reverse=True)
        cand = [c for c in cand if c][: args.paginas] + [str(x) for x in plano.get("pageIds", [])]
        for pid in dict.fromkeys(cand):
            if not sobra(0.92):
                break
            ads, total = nav.abrir(url_pagina(pid), rolagens=1)
            bib = [para_garimpo(a, "ALL", "page:" + pid) for a in ads if str(a.get("page_id")) == pid]
            dup = sum(1 for x in bib if (x["copies"] or 1) >= 3)
            n = max(total or 0, len(bib))
            for x in por_pagina.get(pid, []) + bib:
                x["pageAds"], x["dupCreatives"] = n, dup
                if x["id"] not in todos:
                    # da biblioteca do anunciante entram só os criativos mais duplicados
                    if (x["copies"] or 1) < 2 and len(bib) > 8:
                        continue
                    x["country"] = (por_pagina.get(pid) or [{}])[0].get("country", "ALL")
                todos[x["id"]] = x
            print(f"[anunciante] {(bib or por_pagina.get(pid) or [{'pageName': pid}])[0]['pageName']}: {n} ativos · {dup} criativos duplicados")
            for x in por_pagina.get(pid, []):
                x["pageAds"], x["dupCreatives"] = n, dup
        nav.fechar()

        # cloaker quebrado: abre como lead real as páginas das ofertas mais fortes (um domínio por vez)
        fortes = sorted([x for x in todos.values() if x.get("linkUrl") and x["destino"] == "site"],
                        key=lambda x: ((x.get("pageAds") or 0) + (x["copies"] or 1) * 5 + (x["days"] or 0) / 3), reverse=True)
        vistos = set()
        for x in fortes:
            if len(vistos) >= args.funis or not sobra(0.98):
                break
            dom = urllib.parse.urlparse(x["linkUrl"]).hostname or ""
            if not dom or dom in vistos or re.search(r"facebook|instagram|wa\.me|whatsapp|amazon|shopee|mercadolivre", dom):
                continue
            vistos.add(dom)
            f = abrir_como_lead(p, x["linkUrl"], x.get("country") or "BR")
            if f:
                for y in todos.values():
                    if y.get("linkUrl") and (urllib.parse.urlparse(y["linkUrl"]).hostname or "") == dom:
                        y["funnel"] = f
                print(f"[funil] {dom} -> {f.get('type')} · {f.get('platform') or 'sem checkout'} · {f.get('price') or 's/ preço'}")

    lista = list(todos.values())
    for i in range(0, max(1, len(lista)), 1000):
        r = api(f"/api/robot?a=ingest&acct={args.conta}", {"ads": lista[i:i + 1000], "searches": registro if i == 0 else []})
        print("[api]", r)
    print(f"[fim] {len(lista)} anúncios enviados em {round((time.time() - INICIO) / 60, 1)} min")


if __name__ == "__main__":
    main()
