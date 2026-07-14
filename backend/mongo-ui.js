const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = 8000;
const MONGO_URI = 'mongodb://localhost:27017';

app.use(express.json({ limit: '10mb' }));

let client;

async function getClient() {
    if (!client) {
        client = new MongoClient(MONGO_URI);
        await client.connect();
    }
    return client;
}

// Serve the UI
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<title>MongoDB Browser - KOSTIQ</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', sans-serif; background: #0a0e17; color: #e0e6ed; }
  .header { background: linear-gradient(135deg, #0d1b2a, #1b2838); padding: 16px 24px; border-bottom: 1px solid #1e3a5f; display: flex; align-items: center; gap: 16px; }
  .header h1 { font-size: 20px; color: #4ee6d0; }
  .header .db-name { color: #7aa2f7; font-size: 14px; }
  .container { display: flex; height: calc(100vh - 56px); }
  .sidebar { width: 240px; background: #0d1117; border-right: 1px solid #1e3a5f; overflow-y: auto; }
  .sidebar h3 { padding: 12px 16px; color: #4ee6d0; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; }
  .sidebar .db-item { padding: 8px 16px; cursor: pointer; font-size: 13px; color: #8899aa; transition: all .15s; }
  .sidebar .db-item:hover { background: #1a2332; color: #e0e6ed; }
  .sidebar .db-item.active { background: #1a2332; color: #4ee6d0; border-left: 3px solid #4ee6d0; }
  .sidebar .coll-item { padding: 6px 16px 6px 32px; cursor: pointer; font-size: 12px; color: #6688aa; transition: all .15s; }
  .sidebar .coll-item:hover { background: #1a2332; color: #e0e6ed; }
  .sidebar .coll-item.active { color: #7aa2f7; font-weight: 600; }
  .main { flex: 1; overflow: auto; padding: 20px; }
  .toolbar { display: flex; gap: 12px; margin-bottom: 16px; align-items: center; flex-wrap: wrap; }
  .toolbar .info { color: #4ee6d0; font-size: 14px; font-weight: 600; }
  .toolbar .count { color: #6688aa; font-size: 13px; }
  .btn { padding: 6px 14px; border: 1px solid #2a3a4a; background: #1a2332; color: #8899aa; border-radius: 6px; cursor: pointer; font-size: 12px; transition: all .15s; }
  .btn:hover { background: #2a3a4a; color: #e0e6ed; }
  .btn.primary { background: #1a4a3a; border-color: #4ee6d0; color: #4ee6d0; }
  .doc { background: #0d1117; border: 1px solid #1e3a5f; border-radius: 8px; margin-bottom: 10px; overflow: hidden; }
  .doc-header { padding: 8px 14px; background: #111922; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #6688aa; }
  .doc-body { padding: 12px 14px; }
  .doc pre { white-space: pre-wrap; word-break: break-all; font-size: 12px; color: #c0c8d0; font-family: 'Cascadia Code', 'Fira Code', monospace; line-height: 1.5; }
  .key { color: #7aa2f7; }
  .str { color: #9ece6a; }
  .num { color: #ff9e64; }
  .bool { color: #bb9af7; }
  .null { color: #565f89; }
  .loading { text-align: center; padding: 40px; color: #4ee6d0; }
  input[type=text] { background: #0d1117; border: 1px solid #2a3a4a; color: #e0e6ed; padding: 6px 10px; border-radius: 6px; font-size: 12px; font-family: monospace; }
</style>
</head>
<body>
<div class="header">
  <h1>🍃 MongoDB Browser</h1>
  <span class="db-name">localhost:27017</span>
</div>
<div class="container">
  <div class="sidebar" id="sidebar"><div class="loading">Loading...</div></div>
  <div class="main" id="main"><div class="loading">Select a database and collection</div></div>
</div>
<script>
let currentDb = null, currentColl = null;

async function loadDbs() {
  const r = await fetch('/api/databases');
  const dbs = await r.json();
  let html = '<h3>Databases</h3>';
  dbs.forEach(db => {
    html += '<div class="db-item" onclick="selectDb(\\''+db.name+'\\')">' + db.name + ' <span style="color:#565f89;font-size:11px">(' + formatSize(db.sizeOnDisk) + ')</span></div>';
  });
  document.getElementById('sidebar').innerHTML = html;
}

function formatSize(b) {
  if (b < 1024) return b + 'B';
  if (b < 1048576) return (b/1024).toFixed(1) + 'KB';
  return (b/1048576).toFixed(1) + 'MB';
}

async function selectDb(name) {
  currentDb = name;
  const r = await fetch('/api/databases/' + name + '/collections');
  const colls = await r.json();
  let html = '<h3>Databases</h3>';
  const dbsR = await fetch('/api/databases');
  const dbs = await dbsR.json();
  dbs.forEach(db => {
    html += '<div class="db-item'+(db.name===name?' active':'')+'" onclick="selectDb(\\''+db.name+'\\')">' + db.name + '</div>';
    if (db.name === name) {
      colls.forEach(c => {
        html += '<div class="coll-item" onclick="selectColl(\\''+name+'\\',\\''+c+'\\')">' + c + '</div>';
      });
    }
  });
  document.getElementById('sidebar').innerHTML = html;
}

async function selectColl(db, coll) {
  currentDb = db; currentColl = coll;
  document.querySelectorAll('.coll-item').forEach(el => el.classList.remove('active'));
  event.target.classList.add('active');
  const r = await fetch('/api/databases/' + db + '/collections/' + coll + '/documents?limit=50');
  const data = await r.json();
  let html = '<div class="toolbar"><span class="info">' + db + '.' + coll + '</span><span class="count">' + data.count + ' documents (showing ' + data.docs.length + ')</span><button class="btn" onclick="refreshColl()">↻ Refresh</button></div>';
  data.docs.forEach((doc, i) => {
    const id = doc._id || doc.id || i;
    html += '<div class="doc"><div class="doc-header"><span>#' + (i+1) + ' — ' + id + '</span></div><div class="doc-body"><pre>' + syntaxHighlight(doc) + '</pre></div></div>';
  });
  document.getElementById('main').innerHTML = html;
}

function refreshColl() { if (currentDb && currentColl) selectColl(currentDb, currentColl); }

function syntaxHighlight(obj) {
  let json = JSON.stringify(obj, null, 2);
  json = json.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return json.replace(/"([^"]+)":/g, '<span class="key">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span class="str">"$1"</span>')
    .replace(/: (\\d+\\.?\\d*)/g, ': <span class="num">$1</span>')
    .replace(/: (true|false)/g, ': <span class="bool">$1</span>')
    .replace(/: (null)/g, ': <span class="null">$1</span>');
}

loadDbs();
</script>
</body>
</html>`);
});

// API endpoints
app.get('/api/databases', async (req, res) => {
    try {
        const c = await getClient();
        const admin = c.db().admin();
        const result = await admin.listDatabases();
        res.json(result.databases);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/databases/:db/collections', async (req, res) => {
    try {
        const c = await getClient();
        const db = c.db(req.params.db);
        const collections = await db.listCollections().toArray();
        res.json(collections.map(c => c.name).sort());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/databases/:db/collections/:coll/documents', async (req, res) => {
    try {
        const c = await getClient();
        const db = c.db(req.params.db);
        const coll = db.collection(req.params.coll);
        const limit = parseInt(req.query.limit) || 50;
        const count = await coll.countDocuments();
        const docs = await coll.find({}).limit(limit).toArray();
        res.json({ count, docs });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
    console.log(`MongoDB Browser running at http://localhost:${PORT}`);
});
