const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '..', 'data')
const DB_PATH = path.join(DATA_DIR, 'training.db')

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

let db = null

async function initDatabase() {
  const initSqlJs = require('sql.js')
  const SQL = await initSqlJs()

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'intern',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS interns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      department TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedbacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      content TEXT NOT NULL,
      reviewed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      flag TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  const stmt = db.prepare('SELECT COUNT(*) AS cnt FROM users')
  stmt.step()
  const { cnt } = stmt.getAsObject()
  stmt.free()

  if (cnt === 0) {
    const insertUser = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
    insertUser.bind(['admin', 'admin123', 'admin'])
    insertUser.step()
    insertUser.free()

    const internData = [
      ['Nguyen Van A', 'a@example.com', 'Security'],
      ['Tran Thi B', 'b@example.com', 'Development'],
      ['Le Van C', 'c@example.com', 'Networking'],
      ['Pham Thi D', 'd@example.com', 'Security']
    ]
    for (const row of internData) {
      const stmt = db.prepare('INSERT INTO interns (name, email, department) VALUES (?, ?, ?)')
      stmt.bind(row)
      stmt.step()
      stmt.free()
    }

    const insertConfig = db.prepare('INSERT INTO system_config (key, value) VALUES (?, ?)')
    insertConfig.bind(['JWT_SECRET', 'super_secret_key_123'])
    insertConfig.step()
    insertConfig.free()
  }

  save()
}

function save() {
  const data = db.export()
  fs.writeFileSync(DB_PATH, Buffer.from(data))
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql)
  if (params.length > 0) stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params)
  return rows.length > 0 ? rows[0] : null
}

function run(sql, params = []) {
  if (params.length > 0) db.run(sql, params)
  else db.run(sql)
  save()
}

function getConfig(key) {
  const row = queryOne('SELECT value FROM system_config WHERE key = ?', [key])
  return row ? row.value : null
}

module.exports = { initDatabase, queryAll, queryOne, run, getConfig }
