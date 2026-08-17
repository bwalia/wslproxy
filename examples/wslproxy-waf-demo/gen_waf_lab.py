#!/usr/bin/env python3
"""Generate the WAF Efficacy Lab page (``lab.html``).

An in-browser lab that fires every WAF test case (GET **and** POST) at the host
that serves it — **same-origin**, which is the only way a browser can read the
WAF's 403 block and the `x-waf-*` response headers. Served at `/lab` on both
demo hosts by ``app/app.py``:

- on **payments-secure** the attacks are blocked → the page shows the WAF's
  efficacy (matched rule, violation code, support id) per attack;
- on **payments-open** nothing is blocked → the "before".

The attack list is imported from ``test_waf_live.py`` (its ``CASES``) so the lab
never drifts from the shipped rule set. Regenerate and commit ``lab.html``:

    python3 examples/wslproxy-waf-demo/gen_waf_lab.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import test_waf_live as t  # noqa: E402  (local import after sys.path tweak)

OUT = os.path.join(HERE, "lab.html")

# Map a case's expected rule id to a coarse group for filtering/colour.
def group_of(rule_id: str, name: str) -> str:
    r = rule_id.lower()
    if r.startswith("viol_"):
        return "Stage / positive-security"
    table = [
        ("sqli", "SQL injection"), ("xss", "XSS"), ("cmdi", "Command injection"),
        ("lfi", "LFI / traversal"), ("proto-0", "Protocol"), ("ssti", "SSTI"),
        ("log4shell", "RCE (CVE)"), ("spring4shell", "RCE (CVE)"), ("ssrf", "SSRF"),
        ("nosqli", "NoSQL injection"), ("jwt", "JWT / broken auth"),
        ("protopollute", "Prototype pollution"), ("xxe", "XXE"),
        ("graphql", "GraphQL"), ("openredirect", "Open redirect"),
        ("scanner", "Scanner / bot"), ("massassign", "Mass assignment"),
        ("smuggling", "HTTP request smuggling"),
    ]
    for key, label in table:
        if key in r:
            return label
    return "Control / benign"


def build_attacks():
    attacks = []
    for c in t.CASES:
        headers = dict(c.headers or {})
        # The browser forbids scripts from setting User-Agent, so a UA-only rule
        # (scanner detection) can't be exercised from a page — flag it.
        forbidden = any(k.lower() == "user-agent" for k in headers)
        expected = [c.rule_id, *(c.alt_rules or ())]
        attacks.append({
            "name": c.name,
            "group": group_of(c.rule_id, c.name),
            "method": c.method,
            "path": c.path,
            "expect": c.expect,                      # block | allow | monitor
            "body": c.body,
            "content_type": c.content_type,
            "headers": headers,
            "expected": [e for e in expected if e and e != "none"],
            "notes": c.notes,
            "browser": not forbidden,
            "forbidden_reason": "browser can't set the User-Agent header — run this one with curl"
                                if forbidden else "",
        })
    return attacks


def main():
    attacks = build_attacks()
    # Safe JSON-in-<script>: payloads contain literal "</script>" (the XSS
    # cases). Escaping < > & to \uXXXX keeps the parsed value identical while the
    # HTML parser never sees a tag boundary.
    data = (json.dumps(attacks, ensure_ascii=False)
            .replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026"))
    n = len(attacks)
    n_post = sum(1 for a in attacks if a["method"] != "GET")
    html = TEMPLATE.replace("__DATA__", data).replace("__N__", str(n)).replace("__NPOST__", str(n_post))
    with open(OUT, "w") as f:
        f.write(html)
    print(f"wrote {OUT} — {n} attack cases ({n_post} POST/PUT, {n - n_post} GET)")


TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>WSLProxy WAF Efficacy Lab</title>
<style>
  :root{
    --bg:#0b1020;--panel:#111827;--panel2:#0f1626;--line:#1f2937;--ink:#e5e7eb;
    --muted:#9aa4b8;--faint:#6b7280;--accent:#6366f1;--accent2:#818cf8;
    --safe:#34d399;--safe-soft:#0f2a22;--danger:#f87171;--danger-soft:#2a1518;
    --warn:#fbbf24;--warn-soft:#2a2312;--mono:ui-monospace,SFMono-Regular,Menlo,monospace;
  }
  *{box-sizing:border-box}
  body{margin:0;background:radial-gradient(1200px 600px at 80% -10%,#141d33,transparent),var(--bg);
    color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
  a{color:var(--accent2);text-decoration:none}a:hover{text-decoration:underline}
  code{font-family:var(--mono);font-size:.85em;background:#0c1424;border:1px solid var(--line);
    padding:.05rem .32rem;border-radius:5px;color:#c7d2fe}
  .wrap{max-width:1180px;margin:0 auto;padding:1.8rem 1.2rem 4rem}
  .eyebrow{display:inline-flex;align-items:center;gap:.5rem;font:600 .72rem/1 var(--mono);
    letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
  .eyebrow .dot{width:8px;height:8px;border-radius:50%;background:var(--accent);
    box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 22%,transparent)}
  h1{font-size:1.7rem;margin:.4rem 0 .2rem;letter-spacing:-.02em}
  .host{font-family:var(--mono);color:var(--accent2)}
  .verdict{margin:1rem 0;padding:1rem 1.2rem;border-radius:14px;border:1px solid var(--line);
    background:var(--panel);display:flex;gap:1rem;align-items:center;flex-wrap:wrap}
  .verdict .big{font-size:1.6rem;font-weight:700}
  .verdict.secure{border-color:#1c4034;background:linear-gradient(180deg,#0f2a22,#0d1a18)}
  .verdict.open{border-color:#3a1d20;background:linear-gradient(180deg,#2a1518,#1a1012)}
  .verdict .tag{font:700 .72rem/1 var(--mono);padding:.35rem .6rem;border-radius:999px;text-transform:uppercase;letter-spacing:.04em}
  .verdict.secure .tag{color:#052e2b;background:var(--safe)}
  .verdict.open .tag{color:#fff;background:var(--danger)}
  .bar{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin:1rem 0}
  button{font:600 .9rem/1 system-ui;color:#fff;background:var(--accent);border:0;border-radius:10px;
    padding:.6rem .95rem;cursor:pointer}
  button.ghost{background:var(--panel);color:var(--ink);border:1px solid var(--line)}
  button:disabled{opacity:.5;cursor:not-allowed}
  .search{flex:1;min-width:180px;background:var(--panel2);border:1px solid var(--line);border-radius:10px;
    color:var(--ink);padding:.55rem .8rem}
  .chips{display:flex;flex-wrap:wrap;gap:.35rem;margin:.4rem 0 .8rem}
  .chip{font:600 .72rem/1 var(--mono);color:var(--muted);background:var(--panel);border:1px solid var(--line);
    border-radius:999px;padding:.32rem .6rem;cursor:pointer;text-transform:uppercase;letter-spacing:.03em}
  .chip.on{color:#fff;background:var(--accent);border-color:var(--accent)}
  .counts{display:flex;gap:.5rem;flex-wrap:wrap;margin:.2rem 0 .8rem}
  .pill{font:600 .78rem/1 var(--mono);border:1px solid var(--line);border-radius:999px;padding:.35rem .6rem;color:var(--muted)}
  .pill b{color:var(--ink)}
  table{width:100%;border-collapse:collapse;font-size:.88rem}
  th,td{text-align:left;padding:.55rem .6rem;border-bottom:1px solid var(--line);vertical-align:top}
  th{color:var(--faint);font:600 .72rem/1 var(--mono);text-transform:uppercase;letter-spacing:.04em;position:sticky;top:0;background:var(--bg)}
  tr:hover td{background:#0c1526}
  .m{font-family:var(--mono);font-size:.82rem}
  .b{display:inline-block;font:700 .68rem/1 var(--mono);padding:.28rem .45rem;border-radius:6px;text-transform:uppercase;letter-spacing:.03em}
  .b.block{color:#fff;background:#b91c1c}.b.pass-open{color:#052e2b;background:var(--safe)}
  .b.wait{color:var(--muted);background:#0c1424;border:1px solid var(--line)}
  .b.skip{color:#111;background:var(--warn)}
  .b.err{color:#fff;background:#7c2d12}
  .v-pass{color:var(--safe);font-weight:700}.v-fail{color:var(--danger);font-weight:700}
  .rule{font-family:var(--mono);font-size:.8rem;color:#c7d2fe}
  .sid{font-family:var(--mono);font-size:.72rem;color:var(--faint)}
  .expand{cursor:pointer;color:var(--accent2)}
  .payload{background:#0a1120;border:1px solid var(--line);border-radius:8px;padding:.6rem .7rem;margin:.4rem 0 0;
    font-family:var(--mono);font-size:.78rem;color:#d7def0;white-space:pre-wrap;word-break:break-word}
  .grp{color:var(--faint);font-size:.72rem}
  .foot{color:var(--faint);font-size:.85rem;margin-top:1.6rem;border-top:1px solid var(--line);padding-top:1rem}
  .switch{margin-left:auto}
</style>
</head>
<body>
<div class="wrap">
  <span class="eyebrow"><span class="dot"></span> WSLProxy WAF · efficacy lab</span>
  <h1>WAF Efficacy Lab — <span class="host" id="host"></span></h1>
  <p style="color:var(--muted);margin:.2rem 0 0">Fire every shipped WAF test case (GET
  <b>and</b> POST) at <b>this host</b> and see, live, what the WAF stops — matched rule,
  violation code and support id. The lab tests the host that serves it (same-origin is the
  only way a browser can read a WAF block); use the switch to flip between the protected and
  unprotected host.</p>

  <div class="verdict" id="verdict"><span class="big" id="vbig">—</span>
    <span id="vtext" style="color:var(--muted)">Click <b>Run all</b> to test this host.</span>
    <a class="switch ghost" id="switch" style="display:none"></a>
  </div>

  <div class="bar">
    <button id="runall">▶ Run all</button>
    <button class="ghost" id="reset">Reset</button>
    <input class="search" id="q" placeholder="Filter — sqli, jwt, smuggling, /api/…">
    <a class="ghost" id="switch2" href="#" style="padding:.6rem .95rem;border-radius:10px;display:none"></a>
  </div>
  <div class="chips" id="chips"></div>
  <div class="counts" id="counts"></div>

  <table>
    <thead><tr>
      <th style="width:30%">Attack</th><th>Method</th><th>Expect</th>
      <th>Status</th><th>Result</th><th>Rule / violation</th><th>Verdict</th><th></th>
    </tr></thead>
    <tbody id="rows"></tbody>
  </table>

  <p class="foot">Same-origin only: a browser can read a WAF <code>403</code> block and the
  <code>x-waf-*</code> headers just for the host serving this page. One case
  (scanner User-Agent) can't run in-browser because scripts may not set
  <code>User-Agent</code> — run it with <code>curl</code>. For the machine-readable matrix
  and the open-host control, use <code>test_waf_live.py</code>. Generated by
  <code>gen_waf_lab.py</code> from <code>test_waf_live.py</code>.</p>
</div>

<script>
  const ATTACKS = __DATA__;
  const esc = s => String(s==null?"":s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
  const ORIGIN = location.origin;
  let cat = "all", query = "", results = {};

  // Show which host we're on and wire the switcher to its counterpart.
  const h = location.hostname;
  document.getElementById("host").textContent = h;
  const other = h.includes("secure") ? h.replace("secure","open")
              : h.includes("open") ? h.replace("open","secure")
              : (h.startsWith("payments.") ? h.replace("payments.","payments-secure.") : null);
  if(other){
    const url = location.protocol+"//"+other+"/lab";
    const a=document.getElementById("switch2"); a.href=url; a.textContent="↹ test "+other; a.style.display="";
  }

  // Build a valid same-origin URL while letting the WAF's decoded args still see the payload.
  function buildUrl(path){
    if(!path.includes("?")) return ORIGIN+encodeURI(path);
    const i=path.indexOf("?");
    return ORIGIN+encodeURI(path.slice(0,i))+"?"+encodeURI(path.slice(i+1)).replace(/#/g,"%23");
  }

  async function fire(a){
    if(!a.browser) return {skip:true};
    const opts={method:a.method,headers:{},redirect:"manual",cache:"no-store"};
    if(a.body!=null){ opts.body=a.body; opts.headers["Content-Type"]=a.content_type||"application/json"; }
    for(const k in a.headers){ if(k.toLowerCase()!=="user-agent") opts.headers[k]=a.headers[k]; }
    try{
      const r=await fetch(buildUrl(a.path),opts);
      if(r.type==="opaqueredirect") return {status:"302", redirect:true, blocked:false};
      const block=(r.headers.get("x-waf-block")||"").toLowerCase()==="true";
      return {status:String(r.status),
              blocked:(r.status===403&&block),
              rule:r.headers.get("x-waf-rule")||"",
              viol:r.headers.get("x-waf-violation")||"",
              sid:r.headers.get("x-support-id")||""};
    }catch(e){ return {status:"0", error:String(e)}; }
  }

  function verdict(a,res){
    if(res.skip) return {ok:null,label:"skipped"};
    if(res.error) return {ok:false,label:"error"};
    if(a.expect==="block") return {ok:res.blocked,label:res.blocked?"blocked ✓":"NOT blocked ✗"};
    // allow / monitor → should NOT hard-block
    return {ok:!res.blocked,label:res.blocked?"blocked ✗":"passed ✓"};
  }

  const cats=["all",...[...new Set(ATTACKS.map(a=>a.group))].sort()];
  const chips=document.getElementById("chips");
  chips.innerHTML=cats.map(c=>`<span class="chip${c==="all"?" on":""}" data-c="${esc(c)}">${c==="all"?"all":esc(c)}</span>`).join("");
  chips.onclick=e=>{const c=e.target.closest(".chip");if(!c)return;cat=c.dataset.c;
    [...chips.children].forEach(x=>x.classList.toggle("on",x.dataset.c===cat));draw();};
  document.getElementById("q").oninput=e=>{query=e.target.value.toLowerCase().trim();draw();};

  function shown(){return ATTACKS.filter(a=>{
    if(cat!=="all"&&a.group!==cat)return false;
    if(!query)return true;
    return (a.name+" "+a.group+" "+a.path+" "+a.expected.join(" ")).toLowerCase().includes(query);
  });}

  function idOf(a){return a.name;}

  function rowHtml(a){
    const res=results[idOf(a)];
    let status='<span class="b wait">—</span>', result="", rulec="", verd="", act="";
    if(res){
      const v=verdict(a,res);
      if(res.skip){ status='<span class="b skip">skip</span>'; result='<span class="grp">'+esc(a.forbidden_reason)+'</span>'; }
      else if(res.error){ status='<span class="b err">net</span>'; result='<span class="grp">'+esc(res.error)+'</span>'; }
      else{
        status='<span class="m">'+esc(res.status)+'</span>';
        result = res.blocked?'<span class="b block">BLOCKED</span>'
               : (a.expect==="block"?'<span class="b pass-open">reached origin</span>':'<span class="b pass-open">passed</span>');
        rulec = (res.rule?'<span class="rule">'+esc(res.rule)+'</span>':'')
              + (res.viol&&res.viol!==res.rule?'<br><span class="sid">'+esc(res.viol)+'</span>':'')
              + (res.sid?'<br><span class="sid">'+esc(res.sid)+'</span>':'');
      }
      if(v.ok!==null) verd='<span class="'+(v.ok?"v-pass":"v-fail")+'">'+v.label+'</span>';
    }
    act='<button class="ghost" data-fire="'+esc(a.name)+'" style="padding:.35rem .6rem;font-size:.78rem">fire</button>';
    return `<tr>
      <td><div>${esc(a.name)}</div><div class="grp">${esc(a.group)}</div>
        <div class="expand" data-x="${esc(a.name)}">show payload ▾</div>
        <div class="payload" id="p-${esc(a.name).replace(/[^a-z0-9]/gi,'_')}" style="display:none">${esc(a.method)} ${esc(a.path)}${a.body?("\n\n"+esc(a.body)):""}${Object.keys(a.headers).length?("\n\nheaders: "+esc(JSON.stringify(a.headers))):""}</div>
      </td>
      <td class="m">${esc(a.method)}</td>
      <td class="m">${esc(a.expect)}</td>
      <td>${status}</td>
      <td>${result}</td>
      <td>${rulec}</td>
      <td>${verd}</td>
      <td>${act}</td>
    </tr>`;
  }

  function draw(){
    const list=shown();
    document.getElementById("rows").innerHTML=list.map(rowHtml).join("");
    // counts + verdict banner
    const done=list.map(a=>results[idOf(a)]).filter(Boolean);
    const blocked=done.filter(r=>r&&r.blocked).length;
    const ran=done.filter(r=>r&&!r.skip).length;
    const attacksExpectingBlock=list.filter(a=>a.expect==="block"&&a.browser).length;
    const passes=list.filter(a=>{const r=results[idOf(a)];if(!r||r.skip)return false;return verdict(a,r).ok;}).length;
    document.getElementById("counts").innerHTML=
      `<span class="pill">shown <b>${list.length}</b></span>`+
      `<span class="pill">ran <b>${ran}</b></span>`+
      `<span class="pill">blocked <b>${blocked}</b></span>`+
      `<span class="pill">as-expected <b>${passes}/${ran}</b></span>`;
    // Infer protection from results across ALL attacks (not just filtered).
    const all=ATTACKS.map(a=>results[idOf(a)]).filter(r=>r&&!r.skip&&!r.error);
    const allBlock=all.filter(r=>r.blocked).length;
    const v=document.getElementById("verdict"), vb=document.getElementById("vbig"), vt=document.getElementById("vtext");
    if(all.length>=3){
      if(allBlock>=Math.max(1,Math.floor(all.length*0.5))){
        v.className="verdict secure"; vb.textContent=allBlock+"/"+all.length+" blocked";
        vt.innerHTML='<span class="tag">WAF active</span> This host is <b>protected</b> — attacks are stopped at the edge with <code>403</code> + <code>X-WAF-Block</code>.';
      }else{
        v.className="verdict open"; vb.textContent=allBlock+"/"+all.length+" blocked";
        vt.innerHTML='<span class="tag">exposed</span> This host is <b>unprotected</b> — the payloads reach the origin. Switch to the secure host to see them blocked.';
      }
    }
  }

  document.getElementById("rows").addEventListener("click",e=>{
    const x=e.target.closest("[data-x]");
    if(x){const el=document.getElementById("p-"+x.dataset.x.replace(/[^a-z0-9]/gi,"_"));
      el.style.display=el.style.display==="none"?"block":"none";return;}
    const f=e.target.closest("[data-fire]");
    if(f){const a=ATTACKS.find(z=>z.name===f.dataset.fire);runOne(a);}
  });

  async function runOne(a){ results[idOf(a)]=await fire(a); draw(); }

  document.getElementById("runall").onclick=async()=>{
    const btn=document.getElementById("runall"); btn.disabled=true; btn.textContent="running…";
    // small concurrency so one host isn't hammered
    const list=ATTACKS.slice(); let i=0;
    async function worker(){ while(i<list.length){ const a=list[i++]; results[idOf(a)]=await fire(a); draw(); } }
    await Promise.all([worker(),worker(),worker()]);
    btn.disabled=false; btn.textContent="▶ Run all";
  };
  document.getElementById("reset").onclick=()=>{results={};draw();
    const v=document.getElementById("verdict");v.className="verdict";
    document.getElementById("vbig").textContent="—";
    document.getElementById("vtext").innerHTML="Click <b>Run all</b> to test this host.";};

  draw();
</script>
</body>
</html>
"""


if __name__ == "__main__":
    main()
