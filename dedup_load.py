#!/usr/bin/env python3
# Load Jaysin's exact-duplicate files (+ one thumbnail per group) into app.migration_dedup_files.
import json, subprocess, base64
from collections import defaultdict, OrderedDict
import pyvips
CUST = "Jaysin Julios"
SRC = "gdrive:DECOINKS_ORDERS_REVISED_FORMAT/Jaysin Julios"

d = json.load(open('/tmp/jinv.json'))
def cls(n):
    n = n.lower()
    if 'whatsapp' in n or 'reference' in n: return 'REFERENCE'
    if 'gangsheet' in n or 'gang sheet' in n: return 'CHILD_GANGSHEET'
    if 'mockup' in n: return 'MOCKUP'
    e = n.rsplit('.', 1)[-1] if '.' in n else ''
    if e in ('pdf', 'doc', 'docx', 'txt', 'xlsx', 'csv'): return 'DOCUMENT'
    return 'ARTWORK'
by = defaultdict(list)
for f in d:
    f['sha'] = (f.get('Hashes') or {}).get('sha256', '')
    f['name'] = f['Path'].split('/')[-1]
    if f['sha']: by[f['sha']].append(f)
groups = OrderedDict((s, v) for s, v in by.items() if len(v) > 1)
print(f"groups={len(groups)}", flush=True)

def esc(s): return str(s).replace("'", "''")
rows = []; gi = 0
for s, v in groups.items():
    gi += 1
    thumb = ''
    rep = v[0]
    if cls(rep['name']) != 'DOCUMENT':
        try:
            data = subprocess.run(["rclone", "cat", f"{SRC}/{rep['Path']}"], capture_output=True).stdout
            img = pyvips.Image.thumbnail_buffer(data, 170, height=170, size='down')
            if img.hasalpha(): img = img.flatten(background=[255, 255, 255])
            jpg = img.write_to_buffer('.jpg[Q=72]')
            thumb = 'data:image/jpeg;base64,' + base64.b64encode(jpg).decode()
        except Exception as e:
            thumb = ''
    for f in v:
        rows.append((f['Path'], f['name'], s, f.get('ID', ''), int(f.get('Size', 0) or 0), cls(f['name']), thumb))
    if gi % 10 == 0: print(f"...{gi}/{len(groups)}", flush=True)

with open('/tmp/dedup_insert.sql', 'w') as o:
    o.write("DELETE FROM app.migration_dedup_files WHERE customer='" + esc(CUST) + "';\n")
    for path, name, sha, did, size, atype, thumb in rows:
        tval = 'NULL' if not thumb else "'" + thumb + "'"
        o.write(f"INSERT INTO app.migration_dedup_files (customer,drive_path,file_name,sha256,drive_file_id,file_size,asset_type,dup_group,thumb_b64) "
                f"VALUES ('{esc(CUST)}','{esc(path)}','{esc(name)}','{esc(sha)}','{esc(did)}',{size},'{esc(atype)}','{esc(sha)}',{tval});\n")
print(f"rows={len(rows)}", flush=True)
subprocess.run(["docker", "cp", "/tmp/dedup_insert.sql", "decoinks_postgres:/tmp/dedup_insert.sql"])
r = subprocess.run(["docker", "exec", "decoinks_postgres", "psql", "-U", "postgres", "-d", "decoinks_db", "-f", "/tmp/dedup_insert.sql"], capture_output=True, text=True)
print("psql_err:", r.stderr[-300:], flush=True)
chk = subprocess.run(["docker", "exec", "decoinks_postgres", "psql", "-U", "postgres", "-d", "decoinks_db", "-tAc",
                      "SELECT 'rows='||count(*)||' with_thumb='||count(thumb_b64) FROM app.migration_dedup_files WHERE customer='Jaysin Julios'"], capture_output=True, text=True)
print(chk.stdout.strip(), flush=True)
print("DONE", flush=True)
