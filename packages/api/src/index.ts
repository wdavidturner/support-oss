import { Hono } from 'hono'
import { cors } from 'hono/cors'
import packagesRoute from './routes/packages.js'
import analyzeRoute from './routes/analyze.js'

const app = new Hono()

app.use('/*', cors())

app.get('/', (c) => {
  return c.json({
    name: 'support-oss-api',
    version: '0.0.1',
    status: 'ok',
    endpoints: {
      'GET /api/packages/:name': 'Get package sustainability data',
      'POST /api/packages/batch': 'Get multiple packages',
      'POST /api/analyze': 'Analyze dependencies and get allocation',
    },
  })
})

app.get('/health', (c) => {
  return c.json({ status: 'healthy' })
})

// API routes
app.route('/api/packages', packagesRoute)
app.route('/api/analyze', analyzeRoute)

export default app
