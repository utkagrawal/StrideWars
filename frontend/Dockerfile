# ── Builder Stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
# We must pass the production API URL during build since Vite embeds it
ENV VITE_API_URL=/api
RUN npm run build

# ── Runner Stage ──────────────────────────────────────────────────────────────
FROM nginx:alpine AS runner

# Copy the built React assets to Nginx's default serving directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Add a custom nginx config to support React Router (SPA fallback to index.html)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
