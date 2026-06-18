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

// ── Rooms por restaurante ──────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id)

  // El cliente se une a la sala de su restaurante
  socket.on('unirse', (restaurante_id) => {
    if (restaurante_id) {
      socket.join(`rest_${restaurante_id}`)
      console.log(`Socket ${socket.id} unido a sala rest_${restaurante_id}`)
    }
  })

  // Nueva orden — solo al restaurante correspondiente
  socket.on('nueva_orden', (orden) => {
    console.log('Nueva orden:', orden.id, 'restaurante:', orden.restaurante_id)
    if (orden.restaurante_id) {
      io.to(`rest_${orden.restaurante_id}`).emit('orden_recibida', orden)
    } else {
      // Fallback por slug
      io.emit('orden_recibida', orden)
    }
  })

  // Actualizar estado — solo al restaurante correspondiente
  socket.on('actualizar_estado', (data) => {
    console.log('Estado actualizado:', data)
    if (data.restaurante_id) {
      io.to(`rest_${data.restaurante_id}`).emit('estado_actualizado', data)
    } else {
      io.emit('estado_actualizado', data)
    }
  })

  // Mesa actualizada — solo al restaurante correspondiente
  socket.on('mesa_actualizada', (mesa) => {
    if (mesa.restaurante_id) {
      io.to(`rest_${mesa.restaurante_id}`).emit('mesa_actualizada', mesa)
    } else {
      io.emit('mesa_actualizada', mesa)
    }
  })

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id)
  })
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
        items: [{ title: planInfo.nombre, quantity: 1, unit_price: planInfo.precio, currency_id: 'MXN' }],
        back_urls: { success: back_url, failure: back_url, pending: back_url },
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

server.listen(3001, () => {
  console.log('Servidor corriendo en puerto 3001')
})