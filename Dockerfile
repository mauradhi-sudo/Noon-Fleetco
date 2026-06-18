FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY server.js .
COPY admin-portal.html .
COPY employee-portal.html .
COPY public/ ./public/ 2>/dev/null || true
COPY uploads/ ./uploads/ 2>/dev/null || true

# Google Cloud uses PORT environment variable
ENV PORT=8080
EXPOSE 8080

# Start application
CMD ["node", "server.js"]
