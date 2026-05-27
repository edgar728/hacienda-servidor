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
console.log('Key en código:', client.apiKey ? client.apiKey.substring(0, 20) + '...' : 'VACÍA')

const server = http.createServer(app)
const io = new Server(server, {
  cors: { origin: '*' }
})

io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id)

  socket.on('nueva_orden', (orden) => {
    console.log('Nueva orden:', orden)
    io.emit('orden_recibida', orden)
  })

  socket.on('actualizar_estado', (data) => {
    console.log('Estado actualizado:', data)
    io.emit('estado_actualizado', data)
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
      system: `Eres el asistente amigable del restaurante La Hacienda en Guadalajara. 
Tu trabajo es ayudar a los clientes a elegir platillos del menú.
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

server.listen(3001, () => {
  console.log('Servidor corriendo en puerto 3001')
})