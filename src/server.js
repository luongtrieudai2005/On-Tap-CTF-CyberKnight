const express = require('express')
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken')
const path = require('path')
const { initDatabase, queryAll, queryOne, run, getConfig } = require('./database')
const { authenticate, authorize } = require('./middleware/auth')

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /admin/\n/admin/generate_flag')
})

app.get('/', (req, res) => {
  res.render('index')
})

app.get('/admin-gateway', (req, res) => {
  res.status(405).send('Giao thức không hỗ trợ. Vui lòng sử dụng phương thức POST.')
})

app.post('/admin-gateway', (req, res) => {
  res.render('gateway')
})

app.get('/api/search', (req, res) => {
  const name = req.query.name || ''
  try {
    const sql = `SELECT id, name, email, department FROM interns WHERE name LIKE '%${name}%'`
    const results = queryAll(sql)
    res.json({ success: true, data: results })
  } catch (error) {
    res.json({ success: false, error: error.message })
  }
})

app.get('/login', (req, res) => {
  res.render('login', { error: null })
})

app.post('/login', (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.render('login', { error: 'Vui lòng nhập đầy đủ thông tin.' })
  }

  const user = queryOne('SELECT * FROM users WHERE username = ? AND password = ?', [username, password])
  if (!user) {
    return res.render('login', { error: 'Sai tên đăng nhập hoặc mật khẩu.' })
  }

  const secret = getConfig('JWT_SECRET') || 'super_secret_key_123'
  const token = jwt.sign({ username: user.username, role: user.role }, secret, { expiresIn: '24h' })

  res.cookie('token', token, { httpOnly: true, path: '/' })
  res.redirect('/dashboard')
})

app.get('/register', (req, res) => {
  res.render('register', { error: null })
})

app.post('/register', (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.render('register', { error: 'Vui lòng nhập đầy đủ thông tin.' })
  }

  const existing = queryOne('SELECT id FROM users WHERE username = ?', [username])
  if (existing) {
    return res.render('register', { error: 'Tên đăng nhập đã tồn tại.' })
  }

  run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, password, 'intern'])
  res.redirect('/login')
})

app.get('/dashboard', authenticate, (req, res) => {
  const flagRow = queryOne('SELECT flag FROM flags WHERE username = ?', [req.user.username])
  const userFlag = flagRow ? flagRow.flag : null

  if (req.user.role === 'intern') {
    return res.render('dashboard', { user: req.user, flag: userFlag })
  }
  if (req.user.role === 'employee' || req.user.role === 'admin') {
    return res.redirect('/employee/dashboard')
  }
  res.status(403).send('Không có quyền truy cập.')
})

app.get('/employee/dashboard', authenticate, authorize('employee', 'admin'), (req, res) => {
  const feedbacks = queryAll('SELECT * FROM feedbacks WHERE username = ? ORDER BY created_at DESC', [req.user.username])
  res.render('employee', { user: req.user, feedbacks })
})

app.post('/api/feedback', authenticate, authorize('employee', 'admin'), (req, res) => {
  const { content } = req.body
  if (!content) {
    return res.json({ success: false, error: 'Vui lòng nhập nội dung phản hồi.' })
  }

  run('INSERT INTO feedbacks (username, content) VALUES (?, ?)', [req.user.username, content])
  res.json({ success: true, message: 'Phản hồi đã được gửi.' })
})

app.get('/admin/review-feedbacks', authenticate, authorize('admin'), (req, res) => {
  const feedbacks = queryAll('SELECT * FROM feedbacks ORDER BY created_at DESC')
  res.render('admin-feedback', { feedbacks })
})

app.get('/admin/generate_flag', authenticate, authorize('admin'), (req, res) => {
  const { user } = req.query
  if (!user) {
    return res.json({ success: false, error: 'Thiếu tham số user.' })
  }

  const flag = `CKGW{${user}_${Date.now().toString(36).toUpperCase()}`
  run('INSERT OR IGNORE INTO flags (username, flag) VALUES (?, ?)', [user, flag])
  res.json({ success: true, flag })
})

app.get('/api/flag', authenticate, (req, res) => {
  const flagRow = queryOne('SELECT flag FROM flags WHERE username = ?', [req.user.username])
  if (flagRow) {
    return res.json({ success: true, flag: flagRow.flag })
  }
  res.json({ success: false, message: 'Flag chưa được tạo. Hãy gửi XSS và chờ Admin Bot duyệt.' })
})

app.get('/logout', (req, res) => {
  res.clearCookie('token', { path: '/' })
  res.redirect('/')
})

app.use((req, res) => {
  res.status(404).send('Không tìm thấy trang.')
})

function startAdminBot() {
  const INTERVAL = 20000
  console.log(`[AdminBot] Khởi động. Kiểm tra mỗi ${INTERVAL / 1000}s`)

  setInterval(() => {
    try {
      const unread = queryAll("SELECT * FROM feedbacks WHERE reviewed = 0")
      if (unread.length === 0) return

      console.log(`[AdminBot] Phát hiện ${unread.length} phản hồi mới. Đang xử lý...`)

      for (const fb of unread) {
        const match = fb.content.match(/generate_flag\?user=([a-zA-Z0-9_]+)/i)
        if (match) {
          const targetUser = match[1]
          const flag = `CKGW{${targetUser}_${Date.now().toString(36).toUpperCase()}`
          run('INSERT OR IGNORE INTO flags (username, flag) VALUES (?, ?)', [targetUser, flag])
          console.log(`[AdminBot] ĐÃ TẠO FLAG cho "${targetUser}": ${flag}`)
        }

        run('UPDATE feedbacks SET reviewed = 1 WHERE id = ?', [fb.id])
      }
    } catch (err) {
      console.error('[AdminBot] Lỗi:', err.message)
    }
  }, INTERVAL)
}

initDatabase().then(() => {
  startAdminBot()
  app.listen(PORT, () => {
    console.log(`Server đang chạy tại cổng ${PORT}`)
  })
}).catch(err => {
  console.error('Lỗi khởi tạo database:', err)
  process.exit(1)
})
