# Imagen base oficial Node.js LTS (krypton) sobre Alpine
FROM node:24-alpine AS base

# Actualiza paquetes del sistema para tomar las versiones corregidas del distribuidor
RUN apk upgrade --no-cache \
  && apk add --no-cache tini

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

WORKDIR /app

# Dependencias de producción
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Código de la aplicación
COPY --chown=node:node server ./server
COPY --chown=node:node public ./public
COPY --chown=node:node package.json ./

# Directorio de datos persistente
RUN mkdir -p /data && chown -R node:node /data

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/index.js"]
