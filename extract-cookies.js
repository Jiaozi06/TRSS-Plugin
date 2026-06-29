import WebSocket from 'ws'
import http from 'http'

async function getCookies() {
  const res = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json', (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(JSON.parse(data)))
    }).on('error', reject)
  })

  const page = res.find(t => t.type === 'page' && t.url.includes('miyoushe')) || res[0]
  const wsUrl = page.webSocketDebuggerUrl
  const ws = new WebSocket(wsUrl)
  let msgId = 1

  ws.on('open', () => {
    ws.send(JSON.stringify({ id: msgId++, method: 'Network.getAllCookies' }))
  })

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString())
    if (msg.id && msg.result) {
      const cookies = msg.result.cookies || []
      const relevant = cookies.filter(c =>
        c.domain.includes('mihoyo') || c.domain.includes('miyoushe') || c.domain.includes('bbs')
      )

      console.log('=== 米游社相关 Cookies ===\n')
      for (const c of relevant) {
        console.log(`${c.name}=${c.value}`)
        console.log(`  域名: ${c.domain}, 路径: ${c.path}, HttpOnly: ${c.httpOnly}`)
        console.log('')
      }

      console.log('=== 登录凭据提取 ===\n')
      const stoken = cookies.find(c => c.name === 'stoken' || c.name === 'stoken_v2')
      const stuid = cookies.find(c => c.name === 'stuid')
      const loginTicket = cookies.find(c => c.name === 'login_ticket')
      const cookieToken = cookies.find(c => c.name === 'cookie_token')
      const ltoken = cookies.find(c => c.name === 'ltoken')
      const ltuid = cookies.find(c => c.name === 'ltuid')
      const mid = cookies.find(c => c.name === 'account_mid' || c.name === 'mid')
      const accountId = cookies.find(c => c.name === 'account_id')

      if (stoken || loginTicket || cookieToken || ltoken) {
        console.log('找到登录凭据：')
        if (stoken) console.log(`stoken=${stoken.value}`)
        if (stuid) console.log(`stuid=${stuid.value}`)
        if (mid) console.log(`mid=${mid.value}`)
        if (ltoken) console.log(`ltoken=${ltoken.value}`)
        if (ltuid) console.log(`ltuid=${ltuid.value}`)
        if (cookieToken) console.log(`cookie_token=${cookieToken.value}`)
        if (loginTicket) console.log(`login_ticket=${loginTicket.value}`)
        if (accountId) console.log(`account_id=${accountId.value}`)

        console.log('\n=== Cookie 拼接 ===')
        const parts = []
        if (stoken) parts.push(`stoken=${stoken.value}`)
        if (stuid) parts.push(`stuid=${stuid.value}`)
        if (mid) parts.push(`mid=${mid.value}`)
        if (ltoken) parts.push(`ltoken=${ltoken.value}`)
        if (ltuid) parts.push(`ltuid=${ltuid.value}`)
        if (cookieToken) parts.push(`cookie_token=${cookieToken.value}`)
        if (loginTicket) parts.push(`login_ticket=${loginTicket.value}`)
        console.log(parts.join(';'))
      } else {
        console.log('未找到 stoken/cookie_token/login_ticket')
        console.log('\n所有相关 cookie 名称:')
        for (const c of relevant) console.log(`  ${c.name}`)
      }

      ws.close()
      process.exit()
    }
  })
}

getCookies().catch(e => { console.error(e); process.exit(1) })
