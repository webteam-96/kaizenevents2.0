# Kaizen Events Frontend Dockerfile
# React Application with Multi-stage Build

# ====================
# Stage 1: Dependencies
# ====================
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile --production=false

# ====================
# Stage 2: Builder
# ====================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build argument for API URL
ARG REACT_APP_BACKEND_URL=http://localhost:8001/api
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

# Build application
RUN yarn build

# ====================
# Stage 3: Production
# ====================
FROM nginx:alpine AS production

# Labels
LABEL maintainer="Kaizen Events"
LABEL version="1.0"
LABEL description="Kaizen Events Frontend"

# Copy built files from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create non-root user
RUN addgroup -g 1001 -S kaizen && \
    adduser -S -D -H -u 1001 -h /var/cache/nginx -s /sbin/nologin -G kaizen kaizen && \
    chown -R kaizen:kaizen /usr/share/nginx/html && \
    chown -R kaizen:kaizen /var/cache/nginx && \
    chown -R kaizen:kaizen /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R kaizen:kaizen /var/run/nginx.pid

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost/ || exit 1

# Run nginx
CMD ["nginx", "-g", "daemon off;"]
