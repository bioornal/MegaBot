# Agente WhatsApp — Mega Muebles & Sommiers

Panel de operador + agente de IA para WhatsApp Business. Recibe mensajes vía [YCloud](https://ycloud.com), responde automáticamente con GPT-4o-mini, y permite al operador intervenir manualmente por chat.

## ⚠️ SEGURIDAD — LEER ANTES DE USAR EN PRODUCCIÓN

**El dashboard NO tiene autenticación.** Cualquiera con la URL puede leer todas las conversaciones de WhatsApp. Antes de usar en producción, elegí una opción:

- **Opción A (recomendada):** Cloudflare Access delante del dominio de Render
- **Opción B:** Middleware Next.js con basic auth en `src/middleware.ts`

## Setup local

### 1. Clonar y configurar variables de entorno

```bash
git clone <repo>
cd agente-delivery
cp .env.example .env.local
```

Editar `.env.local` con los valores reales:

| Variable | Cómo obtenerla |
|---|---|
| `YCLOUD_API_KEY` | [panel.ycloud.com](https://panel.ycloud.com) → Settings → API Keys |
| `YCLOUD_PHONE_NUMBER_ID` | YCloud panel → WhatsApp → Phone Numbers |
| `YCLOUD_WEBHOOK_SECRET` | Se genera al configurar el webhook en YCloud (ver abajo) |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) → API Keys |
| `OPENAI_MODEL` | Dejar `gpt-4o-mini` para v1 |

### 2. Instalar y correr

```bash
npm install   # ~1 min por compilación nativa de better-sqlite3
npm run dev   # http://localhost:3000
```

## Personalizar el agente

Editar `src/lib/system-prompt.ts` para agregar:

- **Catálogo de productos:** modelos de sommiers, colchones, muebles de dormitorio/living/comedor
- **Precios y financiación:** cuotas, tarjetas, efectivo
- **Horarios del local:** ejemplo "Lunes a Sábado 9 a 19hs, Domingo 10 a 14hs"
- **Zona de entrega:** barrios/localidades de Neuquén con costo de flete

## Configurar YCloud (webhook)

1. Iniciar sesión en [panel.ycloud.com](https://panel.ycloud.com)
2. Ir a **WhatsApp → Webhooks**
3. Agregar URL: `https://<tu-app>.onrender.com/api/webhook`
4. Crear un secreto (cualquier string aleatorio) → copiarlo en `YCLOUD_WEBHOOK_SECRET`
5. Activar el webhook y verificar que YCloud muestre estado "activo"

## Deploy en Render

1. Subir el código a un repo GitHub (privado)
2. En [render.com](https://render.com) → **New → Web Service**
3. Conectar el repo GitHub
4. Configurar:
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm run start`
   - **Runtime:** Node 20
5. Agregar variables de entorno en el panel de Render (las mismas del `.env.example`)
6. **CRÍTICO — Disco persistente:** en la sección **Disks**, agregar disco montado en `/app/data` (mínimo 1 GB). Sin esto, cada redespliegue borra la DB con todas las conversaciones.
7. Una vez desplegado, copiar la URL pública y configurarla en YCloud como webhook URL

### Plan de Render

El plan gratuito suspende el servidor tras 15 minutos de inactividad. El primer mensaje del día puede tardar ~30 segundos mientras el servidor se despierta.

**Recomendado para producción:** Plan Starter ($7/mes) para keep-alive continuo.

### Rollback

Render guarda todos los deploys anteriores. En caso de problemas: **Dashboard → Deploys → seleccionar deploy anterior → Rollback**.

## Mejoras pendientes (v2)

- Autenticación del dashboard (basic auth o Cloudflare Access)
- Soporte de mensajes de imagen y audio de WhatsApp
- Notificaciones push cuando llega mensaje en modo HUMAN
- Exportar historial de conversaciones a CSV
- Multi-tenant: soporte para múltiples números de WhatsApp
