console.log('Key cargada:', process.env.ANTHROPIC_KEY ? 'SÍ' : 'NO')
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const Anthropic = require('@anthropic-ai/sdk')

const app = express()
app.use(cors())
app.use(express.json())

const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_KEY })

const server = http.createServer(app)
const io = new Server(server, { cors: { origin: '*' } })

const PLANES = {
  basico:  { nombre: 'Moreno Order — Plan Básico',   precio: 1299 },
  pro:     { nombre: 'Moreno Order — Plan Pro',       precio: 1799 },
  premium: { nombre: 'Moreno Order — Plan Premium',   precio: 2499 },
}

io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id)
  socket.on('nueva_orden', (orden) => { io.emit('orden_recibida', orden) })
  socket.on('actualizar_estado', (data) => { io.emit('estado_actualizado', data) })
  socket.on('mesa_actualizada', (mesa) => { io.emit('mesa_actualizada', mesa) })
  socket.on('disconnect', () => { console.log('Cliente desconectado:', socket.id) })
})

app.post('/chat', async (req, res) => {
  const { mensaje, menu } = req.body
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: `Eres el asistente amigable del restaurante. 
El menú disponible es: ${JSON.stringify(menu)}.
Responde siempre en español, de forma breve y amigable (máximo 3 líneas).
Si te preguntan por recomendaciones, sugiere platillos del menú.
No inventes platillos que no están en el menú.`,
      messages: [{ role: 'user', content: mensaje }]
    })
    res.json({ respuesta: response.content[0].text })
  } catch (error) {
    console.error('Error Claude:', error)
    res.status(500).json({ error: 'Error al contactar la IA' })
  }
})

app.post('/crear-preferencia', async (req, res) => {
  const { restaurante_id, back_url, plan } = req.body

  if (!restaurante_id || !back_url || !plan) {
    return res.status(400).json({ error: 'Faltan datos' })
  }

  const planInfo = PLANES[plan]
  if (!planInfo) {
    return res.status(400).json({ error: 'Plan inválido' })
  }

  try {
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        items: [{
          title: planInfo.nombre,
          quantity: 1,
          unit_price: planInfo.precio,
          currency_id: 'MXN',
        }],
        back_urls: {
          success: back_url,
          failure: back_url,
          pending: back_url,
        },
        auto_return: 'approved',
        metadata: { restaurante_id, plan },
      }),
    })

    const data = await response.json()
    if (data.init_point) {
      res.json({ init_point: data.init_point })
    } else {
      console.error('Error MP:', data)
      res.status(500).json({ error: 'Error al crear preferencia' })
    }
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ error: 'Error de conexión con MercadoPago' })
  }
})

app.post('/crear-preferencia', async (req, res) => {
  const { titulo, precio, restaurante_id, slug } = req.body

  try {
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        items: [{
          title: `Order Moreno - Plan ${titulo}`,
          quantity: 1,
          unit_price: Number(precio),
          currency_id: 'MXN'
        }],
        back_urls: {
          success: `https://project-aok5h.vercel.app/?pago=exito&restaurante=${restaurante_id}&slug=${slug}`,
          failure: `https://project-aok5h.vercel.app/?pago=fallo`,
          pending: `https://project-aok5h.vercel.app/?pago=pendiente`
        },
        auto_return: 'approved'
      })
    })

    const data = await response.json()
    res.json({ init_point: data.init_point })
  } catch (error) {
    console.error('Error MP:', error)
    res.status(500).json({ error: 'Error al crear preferencia de pago' })
  }
})

server.listen(3001, () => {
  console.log('Servidor corriendo en puerto 3001')
})