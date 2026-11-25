import json
import sqlite3
import sys
import webbrowser
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID

ROOT = Path(__file__).resolve().parent
DB = ROOT / "stock.sqlite3"
SCHEMA = """
CREATE TABLE IF NOT EXISTS product(id INTEGER PRIMARY KEY, sku TEXT COLLATE NOCASE UNIQUE NOT NULL, name TEXT NOT NULL, unit TEXT NOT NULL, price INTEGER NOT NULL, minimum INTEGER NOT NULL, qty INTEGER NOT NULL DEFAULT 0 CHECK(qty>=0));
CREATE TABLE IF NOT EXISTS doc(id INTEGER PRIMARY KEY, kind TEXT NOT NULL, party TEXT NOT NULL, note TEXT NOT NULL, created TEXT NOT NULL, due TEXT NOT NULL, total INTEGER NOT NULL DEFAULT 0, paid INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS line(id INTEGER PRIMARY KEY, doc INTEGER REFERENCES doc, product INTEGER REFERENCES product, qty INTEGER NOT NULL, price INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS billed(invoice INTEGER PRIMARY KEY REFERENCES doc, bill INTEGER REFERENCES doc);
CREATE TABLE IF NOT EXISTS payment(id INTEGER PRIMARY KEY, invoice INTEGER REFERENCES doc, amount INTEGER NOT NULL, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS request(token TEXT PRIMARY KEY,result TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY,name TEXT NOT NULL,address TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS customer(id INTEGER PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL, phone TEXT NOT NULL);
INSERT OR IGNORE INTO settings(id,name,address) VALUES(1,'ร้านค้าของฉัน','');
"""

def connect():
    c = sqlite3.connect(DB, timeout=15)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    return c

def initialize(c):
    c.executescript(SCHEMA + "CREATE TABLE IF NOT EXISTS bill_amount(bill INTEGER REFERENCES doc,invoice INTEGER REFERENCES doc,amount INTEGER NOT NULL,PRIMARY KEY(bill,invoice));")
    c.execute("BEGIN IMMEDIATE")
    columns = {
        "settings": {"phone": "TEXT NOT NULL DEFAULT ''", "tax_id": "TEXT NOT NULL DEFAULT ''", "branch": "TEXT NOT NULL DEFAULT ''"},
        "doc": {"customer_id": "INTEGER REFERENCES customer(id)", "party_address": "TEXT NOT NULL DEFAULT ''", "party_phone": "TEXT NOT NULL DEFAULT ''"},
    }
    for table, additions in columns.items():
        existing = {row["name"] for row in c.execute(f"PRAGMA table_info({table})")}
        for name, definition in additions.items():
            if name not in existing:
                c.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")


def customer_key(doc):
    return ("member", doc["customer_id"]) if doc["customer_id"] else ("name", doc["party"])


def need(ok, message):
    if not ok:
        raise ValueError(message)

def field(value, limit=200, required=True):
    need(isinstance(value, str), "กรุณาตรวจข้อความ")
    value = value.strip()
    need(len(value) <= limit and (value or not required), "กรุณากรอกข้อมูลให้ครบและตรวจความยาวข้อความ")
    return value

def number(value, money=False):
    try:
        n = Decimal(str(value))
        if money:
            n *= 100
        need(n.is_finite() and 0 <= n <= 10**9 and n == n.to_integral_value(), "จำนวนหรือราคาไม่ถูกต้อง")
        return int(n)
    except InvalidOperation:
        raise ValueError("กรุณากรอกตัวเลขให้ถูกต้อง")

def update(c, a):
    op = a["op"]
    now = datetime.now().isoformat(timespec="seconds")
    if op == "settings":
        c.execute("UPDATE settings SET name=?,address=?,phone=?,tax_id=?,branch=? WHERE id=1", (
            field(a["name"]), field(a["address"],500,False), field(a.get("phone",""),50,False),
            field(a.get("tax_id",""),30,False), field(a.get("branch",""),100,False),
        ))
    elif op == "customer":
        values = (field(a["name"]), field(a["address"],500,False), field(a["phone"],50,False))
        if a.get("id"):
            changed = c.execute("UPDATE customer SET name=?,address=?,phone=? WHERE id=?", (*values, number(a["id"]))).rowcount
            need(changed, "ไม่พบสมาชิก")
        else:
            c.execute("INSERT INTO customer(name,address,phone) VALUES(?,?,?)", values)
    elif op == "product":
        c.execute("INSERT INTO product(sku,name,unit,price,minimum) VALUES(?,?,?,?,?)",(field(a["sku"],60),field(a["name"]),field(a["unit"],30),number(a["price"],True),number(a["minimum"])))
    elif op in ("IN","OUT","INV"):
        lines = a["lines"]
        need(isinstance(lines,list) and 1 <= len(lines) <= 100,"กรุณาเพิ่มรายการสินค้า")
        member_id = number(a["customer_id"]) if op == "INV" and a.get("customer_id") else None
        member = c.execute("SELECT * FROM customer WHERE id=?", (member_id,)).fetchone() if member_id else None
        need(member_id is None or member is not None, "ไม่พบสมาชิกที่เลือก")
        party = member["name"] if member else field(a["party"],200,op!="OUT")
        party_address = member["address"] if member else ""
        party_phone = member["phone"] if member else ""
        due = date.fromisoformat(a["due"]).isoformat() if op=="INV" else ""
        doc = c.execute("INSERT INTO doc(kind,party,note,created,due,customer_id,party_address,party_phone) VALUES(?,?,?,?,?,?,?,?)",(op,party,field(a["note"],500,False),now,due,member_id,party_address,party_phone)).lastrowid
        total = 0
        for row in lines:
            pid, qty = number(row["id"]), number(row["qty"])
            price = number(row["price"],True) if op!="OUT" else 0
            need(qty>0,"จำนวนต้องมากกว่าศูนย์")
            delta = qty if op=="IN" else -qty
            ok = c.execute("UPDATE product SET qty=qty+? WHERE id=? AND qty+? BETWEEN 0 AND 1000000000",(delta,pid,delta)).rowcount
            need(ok,"ยอดคงเหลือไม่เพียงพอ หรือจำนวนเกินขอบเขต")
            c.execute("INSERT INTO line(doc,product,qty,price) VALUES(?,?,?,?)",(doc,pid,qty,price))
            total += qty*price
            need(total<=10**14,"ยอดเอกสารสูงเกินไป")
        c.execute("UPDATE doc SET total=? WHERE id=?",(total,doc))
        return {"doc":doc}
    elif op=="BILL":
        ids = list(dict.fromkeys(number(v) for v in a["ids"]))
        need(0<len(ids)<=100,"กรุณาเลือกใบแจ้งหนี้ 1–100 ใบ")
        docs = [c.execute("SELECT * FROM doc WHERE id=? AND kind='INV' AND total>paid AND id NOT IN (SELECT invoice FROM billed)",(i,)).fetchone() for i in ids]
        need(all(docs) and len({customer_key(d) for d in docs})==1,"เลือกใบแจ้งหนี้ค้างชำระของลูกค้ารายเดียวที่ยังไม่ได้วางบิล")
        first = docs[0]
        doc = c.execute(
            "INSERT INTO doc(kind,party,note,created,due,total,customer_id,party_address,party_phone) VALUES('BILL',?,'',?,'',?,?,?,?)",
            (first["party"], now, sum(d["total"]-d["paid"] for d in docs), first["customer_id"], first["party_address"], first["party_phone"]),
        ).lastrowid
        for d in docs:
            c.execute("INSERT INTO billed VALUES(?,?)",(d["id"],doc))
            c.execute("INSERT INTO bill_amount VALUES(?,?,?)",(doc,d["id"],d["total"]-d["paid"]))
        return {"doc":doc}
    elif op=="pay":
        amount = number(a["amount"],True)
        idx = number(a["id"])
        need(amount>0 and c.execute("UPDATE doc SET paid=paid+? WHERE id=? AND kind='INV' AND total-paid>=?",(amount,idx,amount)).rowcount,"กรุณาตรวจยอดรับชำระกับยอดค้าง")
        receipt = c.execute("INSERT INTO payment(invoice,amount,created) VALUES(?,?,?)",(idx,amount,now)).lastrowid
        return {"receipt": receipt}
    else:
        raise ValueError("ไม่รู้จักคำสั่ง")
    return {}

class Handler(BaseHTTPRequestHandler):
    def respond(self, code, data, mime="application/json"):
        payload = data if isinstance(data,bytes) else json.dumps(data,ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type",mime+"; charset=utf-8")
        self.send_header("Cache-Control","no-store")
        self.send_header("Content-Length",str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path=="/api":
            with connect() as c:
                c.execute("BEGIN")
                self.respond(200,{t:[dict(r) for r in c.execute("SELECT * FROM "+t)] for t in ("product","doc","line","bill_amount","payment","settings","customer")})
        elif path in ("/","/ui.js","/style.css"):
            filename, mime = {"/":("index.html","text/html"),"/ui.js":("ui.js","application/javascript"),"/style.css":("style.css","text/css")}[path]
            self.respond(200,(ROOT/filename).read_bytes(),mime)
        else:
            self.respond(404,{})

    def do_POST(self):
        try:
            need(self.path=="/api" and self.headers.get_content_type()=="application/json","คำขอไม่ถูกต้อง")
            origin = self.headers.get("Origin")
            need(not origin or origin==f"http://127.0.0.1:{self.server.server_port}","ต้นทางไม่ถูกต้อง")
            size = int(self.headers.get("Content-Length",0))
            need(0<size<=200000,"ข้อมูลใหญ่เกินไป")
            a = json.loads(self.rfile.read(size))
            token = str(UUID(a["token"]))
            with connect() as c:
                c.execute("BEGIN IMMEDIATE")
                prior = c.execute("SELECT result FROM request WHERE token=?",(token,)).fetchone()
                result = json.loads(prior[0]) if prior else update(c,a)
                if not prior:
                    c.execute("INSERT INTO request VALUES(?,?)",(token,json.dumps(result)))
            self.respond(200,result)
        except sqlite3.IntegrityError:
            self.respond(400,{"error":"รหัสสินค้าซ้ำหรือข้อมูลขัดแย้ง กรุณาตรวจสอบ"})
        except (ValueError,TypeError,KeyError,AttributeError) as e:
            self.respond(400,{"error":str(e)})
        except sqlite3.Error:
            self.respond(503,{"error":"ฐานข้อมูลไม่พร้อม กรุณาลองอีกครั้ง"})

def main():
    with connect() as c:
        initialize(c)
    server = ThreadingHTTPServer(("127.0.0.1",8765),Handler)
    url = "http://127.0.0.1:8765"
    print("Stockroom is running at",url,flush=True)
    if "--no-browser" not in sys.argv:
        webbrowser.open(url)
    server.serve_forever()

if __name__=="__main__":
    main()
