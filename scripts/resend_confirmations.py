#!/usr/bin/env python3
"""
Re-send registration-confirmation emails for the 26 transactions that were marked
successful manually (they never went through the app's FinalizeRegistrationAsync,
so no confirmation email was sent).

Mirrors KaizenEvents' EmailTemplateService rendering:
  - ${name}/${email}/${phone} resolved from form_config
  - ${event_name} ${organization} ${amount} ${invoice_number} ${registration_id}
    ${registration_date}(IST) ${payment_status} ${event_date}
  - ${field:Label} / ${field:id} per-field values (option values mapped to labels)
  - unknown placeholders -> empty (e.g. ${zf:ADDED_TIME})
Sender resolved: template.email_sender_id -> verified DKIM sender -> global Brevo.
CC = template cc  (dedup, drop the primary recipient).

DRY_RUN=True renders + prints a sample and sends NOTHING.  Flip to False to send.
NOTE: RID 3231's template attaches a filled-form PDF in the app; this script can't
regenerate that PDF, so those emails go WITHOUT the attachment.
"""
import json, re, subprocess, sys, datetime, urllib.request, os

DRY_RUN = True  # superseded by the app-native resend endpoint; kept disabled

# Credentials are read from the environment — never hard-code secrets in a committed file.
#   set DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME BREVO_API_KEY before running.
MYSQL = os.environ.get("MYSQL_EXE", r"C:\Program Files\MySQL\MySQL Server 9.4\bin\mysql.exe")
DB = dict(host=os.environ.get("DB_HOST", "127.0.0.1"), port=os.environ.get("DB_PORT", "3306"),
          user=os.environ.get("DB_USER", "root"),
          pw=os.environ.get("DB_PASSWORD", ""), db=os.environ.get("DB_NAME", "kaizen_events"))

BREVO_KEY = os.environ.get("BREVO_API_KEY", "")
GLOBAL_SENDER = {"email": "noreply@rizones45678.org", "name": "RI Zones 4,5,6,7 and 8"}

PAY_IDS = [
 "pay_T8BNE9JolJ0mUq","pay_T8BUMH5DDv2fDx","pay_T8Ba12gBVKLyYq","pay_T8BtR2Ogj2Ekee","pay_T8BwPVSplHBqXO",
 "pay_T8CAofNJ6njL9L","pay_T8CIF5xOdStyQo","pay_T8EGvP1OOzd8hK","pay_T8VJkBK1sQyeJZ","pay_T8VxfqAfwTfGf0",
 "pay_T8W8Ce9FkYpVvR","pay_T8WuKGiInn5D5q","pay_T8XYLKIOhEZ34R","pay_T8XtmgyOV8HfEG","pay_T8Z8mtdwW4UHMA",
 "pay_T8bt1MXUPp5laG","pay_T8cALZUHl9YAbn","pay_T8clNibrGYGI76","pay_T8h4wOedyDJxOA","pay_T8iPWSQ0LlR8jG",
 "pay_T8r1H5fm4OebSh","pay_T5TAaGzogIDacG","pay_T5tX9P5koB1QjA","pay_T6GqsC2Sdt9HfW","pay_T7U9CbhiKjv2JB",
 "pay_T8hS2R586AzLPz",
]

def q(sql):
    r = subprocess.run([MYSQL, "-h", DB["host"], "-P", DB["port"], "-u", DB["user"],
                        "-p"+DB["pw"], DB["db"], "-N", "--raw", "-e", sql],
                       capture_output=True, text=True, encoding="utf-8")
    return r.stdout

def one_json(sql):
    out = q(sql).strip()
    return json.loads(out) if out else None

pid_list = ",".join("'%s'" % p for p in PAY_IDS)

# 1) recipients (one JSON array)
recips = one_json(f"""
SELECT JSON_ARRAYAGG(JSON_OBJECT(
  'reg_id', r.id, 'campaign_id', r.campaign_id, 'form_data', r.form_data,
  'total_amount', r.total_amount, 'invoice_number', r.invoice_number,
  'created_at', DATE_FORMAT(r.created_at,'%Y-%m-%dT%H:%i:%s'),
  'campaign_name', c.name, 'organization', c.organization_name,
  'start_date', DATE_FORMAT(c.start_date,'%Y-%m-%dT%H:%i:%s'),
  'subject', t.subject, 'body_html', t.body_html, 'cc', t.cc_emails,
  'reply_to', t.reply_to, 'sender_id', t.email_sender_id, 'attach_pdf', t.attach_filled_form_pdf))
FROM payments p
JOIN registrations r ON r.id=p.registration_id
JOIN campaigns c ON c.id=p.campaign_id
JOIN email_templates t ON t.campaign_id=c.id AND t.trigger='registration_confirmed'
WHERE p.gateway_payment_id IN ({pid_list});
""")

cids = sorted({r["campaign_id"] for r in recips})
cid_list = ",".join("'%s'" % c for c in cids)
form_configs = {r["id"]: r["cfg"] for r in (one_json(
    f"SELECT JSON_ARRAYAGG(JSON_OBJECT('id',id,'cfg',form_config)) FROM campaigns WHERE id IN ({cid_list});") or [])}
senders = {s["id"]: s for s in (one_json(
    "SELECT JSON_ARRAYAGG(JSON_OBJECT('id',es.id,'email',es.email,'name',es.name,"
    "'verified',(d.status='verified'))) FROM email_senders es LEFT JOIN dkim_domains d ON d.id=es.domain_id;") or [])}

PH = re.compile(r"\$\{(?P<e>[^}]+)\}")

def parse(j):
    if j is None: return None
    return j if isinstance(j,(dict,list)) else json.loads(j)

def resolve_contact(form, fields):
    name=email=phone=""
    for f in fields:
        t=f.get("type"); fid=f.get("id")
        if not fid: continue
        if t=="name" and not name:
            parts=[form.get(f"{fid}_first",""),form.get(f"{fid}_middle",""),form.get(f"{fid}_last","")]
            name=" ".join(x for x in parts if x).strip() or (form.get(fid) or "")
        elif t=="email" and not email: email=form.get(fid) or ""
        elif t in ("phone","tel") and not phone: phone=form.get(fid) or ""
    # label fallback
    for f in fields:
        lbl=(f.get("label") or "").lower(); fid=f.get("id"); t=f.get("type")
        if not fid or t in ("section_header","calculated"): continue
        if not name and "name" in lbl: name=form.get(fid) or name
        elif not email and "email" in lbl: email=form.get(fid) or email
        elif not phone and any(k in lbl for k in ("phone","mobile","contact")): phone=form.get(fid) or phone
    return name,email,phone

def ist(dtstr):
    try:
        d=datetime.datetime.strptime(dtstr,"%Y-%m-%dT%H:%M:%S")+datetime.timedelta(hours=5,minutes=30)
        return d.strftime("%d %b %Y, %I:%M %p")
    except Exception: return ""

def build_values(rec):
    fields = (parse(form_configs.get(rec["campaign_id"])) or {}).get("fields",[])
    form = parse(rec["form_data"]) or {}
    name,email,phone = resolve_contact(form,fields)
    v = {"name":name,"email":email,"phone":phone,"event_name":rec["campaign_name"] or "",
         "organization":rec["organization"] or "","amount":f"Rs. {float(rec['total_amount']):,.2f}",
         "invoice_number":rec["invoice_number"] or "","registration_id":(rec["reg_id"][:8].upper()),
         "registration_date":ist(rec["created_at"]),"payment_status":"completed",
         "event_date": (ist(rec["start_date"]).split(",")[0] if rec.get("start_date") else "")}
    for f in fields:
        lbl=f.get("label"); fid=f.get("id"); t=f.get("type")
        if not lbl or not fid: continue
        if t=="name":
            val=" ".join(x for x in [form.get(f"{fid}_first",""),form.get(f"{fid}_middle",""),form.get(f"{fid}_last","")] if x).strip()
        else:
            raw=form.get(fid)
            optmap={o.get("value"):(o.get("label") or o.get("value")) for o in (f.get("options") or [])}
            if isinstance(raw,list): val=", ".join(optmap.get(x,x) for x in raw)
            elif raw in optmap: val=optmap[raw]
            else: val="" if raw is None else str(raw)
        v[f"field:{lbl}"]=val; v[f"field:{fid}"]=val
    return v,name,email

def subst(text,values):
    if not text: return ""
    return PH.sub(lambda m: values.get(m.group("e").strip(),""), text)

def resolve_sender(rec):
    sid=rec.get("sender_id")
    if sid and sid in senders and senders[sid].get("verified"):
        s=senders[sid]; return {"email":s["email"],"name":s.get("name") or s["email"]}
    return GLOBAL_SENDER

def send_brevo(payload):
    req=urllib.request.Request("https://api.brevo.com/v3/smtp/email",
        data=json.dumps(payload).encode(),
        headers={"api-key":BREVO_KEY,"content-type":"application/json","accept":"application/json"})
    with urllib.request.urlopen(req) as r: return r.status, r.read().decode()

sample_shown=False
sent=0; skipped=0
print(f"Recipients: {len(recips)}\n")
for rec in recips:
    values,name,email=build_values(rec)
    if not email or "@" not in email:
        print(f"SKIP (no email): reg {rec['reg_id'][:8]} {rec['campaign_name']}"); skipped+=1; continue
    subject=subst(rec["subject"],values)
    body=subst(rec["body_html"],values)
    sender=resolve_sender(rec)
    cc=[a for a in (parse(rec.get("cc")) or []) if a and "@" in a and a.lower()!=email.lower()]
    cc=[subst(a,values) for a in cc]
    reply=subst(rec.get("reply_to"),values) if rec.get("reply_to") else None
    payload={"sender":sender,"to":[{"email":email,"name":name or email}],"subject":subject,"htmlContent":body}
    if cc: payload["cc"]=[{"email":a} for a in cc]
    if reply: payload["replyTo"]={"email":reply}
    print(f"- {email:38s} | {name[:22]:22s} | {rec['campaign_name'][:30]:30s}"
          f"{' [tmpl wants PDF]' if rec.get('attach_pdf') else ''}")
    if not sample_shown:
        sample_shown=True
        print("\n================ SAMPLE (rendered, NOT sent) ================")
        print("From   :", f"{sender['name']} <{sender['email']}>")
        print("To     :", f"{name} <{email}>")
        print("CC     :", cc); print("ReplyTo:", reply)
        print("Subject:", subject)
        print("---- body (first 900 chars) ----")
        print(body[:900])
        print("================ END SAMPLE ================\n")
    if not DRY_RUN:
        try:
            st,resp=send_brevo(payload)
            print("   sent:",st, resp[:80]); sent+=1
        except Exception as e:
            print("   SEND ERROR:",e)
print(f"\nDRY_RUN={DRY_RUN}  rendered={len(recips)}  sent={sent}  skipped={skipped}")
