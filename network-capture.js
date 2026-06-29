import WebSocket from 'ws'
import http from 'http'

const WS_URL = 'http://127.0.0.1:9222/json'

async function getTarget() {
  const res = await new Promise((resolve, reject) => {
    http.get(WS_URL, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(JSON.parse(data)))
    }).on('error', reject)
  })
  const page = res.find(t => t.type === 'page' && t.url.includes('miyoushe'))
  if (page) return page.webSocketDebuggerUrl
  if (res.length > 0) return res[0].webSocketDebuggerUrl
  const tab = await new Promise((resolve, reject) => {
    http.put('http://127.0.0.1:9222/json/new?https://www.miyoushe.com/ys/', (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(JSON.parse(data)))
    }).on('error', reject)
  })
  return tab.webSocketDebuggerUrl
}

let msgId = 100
const pendingBodies = new Map()

async function capture() {
  const wsUrl = await getTarget()
  console.log(`Connecting to: ${wsUrl}`)
  const ws = new WebSocket(wsUrl)

  ws.on('open', () => {
    console.log('[CDP] Connected. Enabling Network...')
    ws.send(JSON.stringify({ id: 1, method: 'Network.enable' }))
    ws.send(JSON.stringify({ id: 2, method: 'Page.enable' }))
    ws.send(JSON.stringify({ id: 3, method: 'Page.navigate', params: { url: 'https://www.miyoushe.com/ys/' } }))
  })

  const requests = {}

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString())
    const { id, method, params } = msg

    if (method === 'Network.requestWillBeSent') {
      const { requestId, request } = params
      const url = request.url
      if (url.includes('passport') || url.includes('mihoyo') || url.includes('miyoushe') || url.includes('bbs') || url.includes('account')) {
        requests[requestId] = {
          url,
          method: request.method,
          headers: request.headers,
          postData: request.postData,
          time: new Date().toISOString()
        }
        console.log(`\n[REQ] ${request.method} ${url}`)
        if (request.postData) console.log(`  Body: ${request.postData}`)
      }
    }

    if (method === 'Network.responseReceived') {
      const { requestId, response } = params
      if (requests[requestId]) {
        requests[requestId].status = response.status
        requests[requestId].responseHeaders = response.headers
        console.log(`[RES] ${response.status} ${requests[requestId].url}`)
        // Request body
        const myId = ++msgId
        pendingBodies.set(myId, requestId)
        ws.send(JSON.stringify({
          id: myId,
          method: 'Network.getResponseBody',
          params: { requestId }
        }))
      }
    }

    if (method === 'Network.getResponseBody' && id && pendingBodies.has(id)) {
      const reqId = pendingBodies.get(id)
      pendingBodies.delete(id)
      if (requests[reqId]) {
        const body = params.body
        const isBase64 = params.base64Encoded
        try {
          const text = isBase64 ? Buffer.from(body, 'base64').toString() : body
          requests[reqId].responseBody = text
          console.log(`  Response: ${text.slice(0, 2000)}`)
        } catch (e) {
          console.log(`  Response: [binary, ${body.length} bytes]`)
        }
      }
    }

    if (method === 'Network.loadingFailed') {
      const { requestId, errorText } = params
      if (requests[requestId]) {
        console.log(`[FAIL] ${requests[requestId].url} - ${errorText}`)
      }
    }
  })

  process.on('SIGINT', () => {
    console.log('\n\n=== 捕获完成，生成报告 ===\n')
    const relevant = Object.values(requests)
      .filter(r => r.url.includes('passport') || r.url.includes('account'))
      .sort((a, b) => a.time.localeCompare(b.time))

    for (const r of relevant) {
      console.log(`\n${'='.repeat(60)}`)
      console.log(`时间: ${r.time}`)
      console.log(`${r.method} ${r.url}`)
      console.log(`状态: ${r.status}`)
      if (r.postData) console.log(`POST: ${r.postData}`)
      if (r.responseHeaders) {
        const ck = r.responseHeaders['set-cookie'] || r.responseHeaders['Set-Cookie']
        if (ck) console.log(`Set-Cookie: ${Array.isArray(ck) ? ck.join('; ') : ck}`)
      }
      if (r.responseBody) {
        try {
          const parsed = JSON.parse(r.responseBody)
          console.log(`Body: ${JSON.stringify(parsed, null, 2)}`)
        } catch {
          console.log(`Body: ${r.responseBody.slice(0, 500)}`)
        }
      }
    }

    // Save full report
    const fs = require('fs')
    fs.writeFileSync('login-flow-report.json', JSON.stringify(relevant, null, 2))
    console.log('\n报告已保存到: login-flow-report.json')
    ws.close()
    process.exit()
  })

  console.log('\n=== 浏览器调试模式已启动，网络监听中 ===')
  console.log('请在打开的浏览器中点击登录 → 扫码登录')
  console.log('完成后按 Ctrl+C 停止捕获并生成报告\n')
}

capture().catch(console.error)
